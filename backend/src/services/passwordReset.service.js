import { pool } from "../db/pool.js";
import { buildPasswordResetLink, sendPasswordResetEmail } from "./email.service.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import { validatePasswordStrength } from "../utils/passwordValidation.js";
import { generateSecureToken, hashToken } from "../utils/token.js";

const RESET_TOKEN_EXPIRY_MINUTES = 15;
const FORGOT_PASSWORD_MESSAGE =
  "If the email is registered and active, password reset instructions will be sent.";

export async function createPasswordResetToken({ email }) {
  const normalizedEmail = email.trim().toLowerCase();
  const userResult = await pool.query(
    `
      SELECT user_id, status
      FROM users
      WHERE LOWER(email) = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );

  const user = userResult.rows[0];

  if (!user || user.status !== "ACTIVE") {
    return {
      message: FORGOT_PASSWORD_MESSAGE
    };
  }

  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
        UPDATE password_reset_tokens
        SET used_at = NOW()
        WHERE user_id = $1
          AND used_at IS NULL
      `,
      [user.user_id]
    );

    await client.query(
      `
        INSERT INTO password_reset_tokens (
          user_id,
          token_hash,
          expires_at
        )
        VALUES ($1, $2, NOW() + INTERVAL '15 minutes')
      `,
      [user.user_id, tokenHash]
    );

    await client.query("COMMIT");

    const response = {
      message: FORGOT_PASSWORD_MESSAGE
    };

    if (process.env.NODE_ENV === "development") {
      response.developmentResetToken = rawToken;
      response.expiresInMinutes = RESET_TOKEN_EXPIRY_MINUTES;
    }

    const resetLink = buildPasswordResetLink(rawToken);

    try {
      const emailResult = await sendPasswordResetEmail({
        to: normalizedEmail,
        resetLink
      });

      if (process.env.NODE_ENV === "development") {
        response.email = {
          sent: emailResult.sent,
          skipped: emailResult.skipped || false
        };
      }
    } catch (error) {
      console.error("Password reset email failed to send.");

      if (process.env.NODE_ENV === "development") {
        response.email = {
          sent: false,
          error: "EMAIL_SEND_FAILED"
        };
      }
    }

    return response;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function resetPassword({ token, newPassword }) {
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
        FROM password_reset_tokens
        WHERE token_hash = $1
        LIMIT 1
      `,
      [tokenHash]
    );

    const resetToken = tokenResult.rows[0];

    if (!resetToken) {
      await client.query("ROLLBACK");
      return {
        error: "INVALID_TOKEN"
      };
    }

    if (resetToken.used_at) {
      await client.query("ROLLBACK");
      return {
        error: "TOKEN_USED"
      };
    }

    if (new Date(resetToken.expires_at) <= new Date()) {
      await client.query("ROLLBACK");
      return {
        error: "TOKEN_EXPIRED"
      };
    }

    const userResult = await client.query(
      `
        SELECT user_id, status, password_hash
        FROM users
        WHERE user_id = $1
        LIMIT 1
      `,
      [resetToken.user_id]
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

    const isSamePassword = await comparePassword(newPassword, user.password_hash);

    if (isSamePassword) {
      await client.query("ROLLBACK");
      return {
        error: "SAME_PASSWORD"
      };
    }

    const passwordHash = await hashPassword(newPassword);

    await client.query(
      `
        UPDATE users
        SET password_hash = $1
        WHERE user_id = $2
      `,
      [passwordHash, user.user_id]
    );

    await client.query(
      `
        UPDATE password_reset_tokens
        SET used_at = NOW()
        WHERE token_id = $1
      `,
      [resetToken.token_id]
    );

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
