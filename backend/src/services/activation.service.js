import { pool } from "../db/pool.js";
import { hashPassword } from "../utils/password.js";
import { validatePasswordStrength } from "../utils/passwordValidation.js";
import { generateSecureToken, hashToken } from "../utils/token.js";
import { AUDIT_ACTIONS, recordAuditLog } from "./audit.service.js";

const ACTIVATION_TOKEN_EXPIRY_DAYS = 30;

export async function createActivationTokenForUser(userId) {
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);

  await pool.query(
    `
      INSERT INTO account_activation_tokens (
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, NOW() + INTERVAL '30 days')
    `,
    [userId, tokenHash]
  );

  return {
    rawToken,
    expiresInDays: ACTIVATION_TOKEN_EXPIRY_DAYS
  };
}

export async function activateAccount({ token, newPassword }) {
  const passwordValidation = validatePasswordStrength(newPassword);

  if (!passwordValidation.isValid) {
    return {
      error: "WEAK_PASSWORD",
      passwordErrors: passwordValidation.errors
    };
  }

  const tokenHash = hashToken(token.trim());
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query(
      `
        SELECT
          token_id,
          user_id,
          expires_at,
          used_at
        FROM account_activation_tokens
        WHERE token_hash = $1
        LIMIT 1
      `,
      [tokenHash]
    );

    const activationToken = tokenResult.rows[0];

    if (!activationToken) {
      await client.query("ROLLBACK");
      return {
        error: "INVALID_TOKEN"
      };
    }

    if (activationToken.used_at) {
      await client.query("ROLLBACK");
      return {
        error: "TOKEN_USED"
      };
    }

    if (new Date(activationToken.expires_at) <= new Date()) {
      await client.query("ROLLBACK");
      return {
        error: "TOKEN_EXPIRED"
      };
    }

    const userResult = await client.query(
      `
        SELECT user_id, status, role, email
        FROM users
        WHERE user_id = $1
        LIMIT 1
      `,
      [activationToken.user_id]
    );

    const user = userResult.rows[0];

    if (!user) {
      await client.query("ROLLBACK");
      return {
        error: "USER_NOT_FOUND"
      };
    }

    if (user.status === "DEACTIVATED") {
      await client.query("ROLLBACK");
      return {
        error: "USER_DEACTIVATED"
      };
    }

    const passwordHash = await hashPassword(newPassword);

    await client.query(
      `
        UPDATE users
        SET
          password_hash = $1,
          status = 'ACTIVE'
        WHERE user_id = $2
      `,
      [passwordHash, user.user_id]
    );

    await client.query(
      `
        UPDATE account_activation_tokens
        SET used_at = NOW()
        WHERE token_id = $1
      `,
      [activationToken.token_id]
    );

    await recordAuditLog({
      client,
      actor: { user_id: user.user_id, role: user.role },
      action: AUDIT_ACTIONS.ACCOUNT_ACTIVATED,
      entityType: "USER_ACCOUNT",
      entityId: user.user_id,
      entityReference: user.email,
      description: `${user.role} account ${user.email} completed activation.`,
      metadata: { account_role: user.role, changes: { status: { before: user.status, after: "ACTIVE" } } }
    });

    await client.query("COMMIT");

    return {
      success: true
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
