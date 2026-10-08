import { pool } from "../db/pool.js";
import {
  buildEmailChangeVerificationLink,
  sendEmailChangeVerificationEmail
} from "./email.service.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import { validatePasswordStrength } from "../utils/passwordValidation.js";
import { signEmailChangeToken, verifyEmailChangeToken } from "../utils/jwt.js";
import { AUDIT_ACTIONS, recordAuditLog, recordAuditLogSafely } from "./audit.service.js";

const PROFILE_COLUMNS = `
  u.user_id,
  u.email,
  u.first_name,
  u.last_name,
  u.phone_number,
  u.role,
  u.unit_id,
  u.status,
  u.created_at,
  u.updated_at,
  units.block,
  units.floor,
  units.unit_number,
  units.full_unit_code
`;

function normalizeOptionalName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
}

function normalizeRequiredString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toProfile(row) {
  return {
    user_id: row.user_id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    phone_number: row.phone_number,
    role: row.role,
    unit_id: row.unit_id,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    unit: row.unit_id
      ? {
          unit_id: row.unit_id,
          block: row.block,
          floor: row.floor,
          unit_number: row.unit_number,
          full_unit_code: row.full_unit_code
        }
      : null
  };
}

export async function getProfileByUserId(userId) {
  const result = await pool.query(
    `
      SELECT ${PROFILE_COLUMNS}
      FROM users u
      LEFT JOIN units ON units.unit_id = u.unit_id
      WHERE u.user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  const profile = result.rows[0];

  if (!profile) {
    return null;
  }

  return toProfile(profile);
}

export async function updateProfile({ requester, userId, updates }) {
  const currentProfile = await getProfileByUserId(userId);

  if (!currentProfile) {
    return {
      error: "PROFILE_NOT_FOUND"
    };
  }

  const phoneNumber = normalizeRequiredString(updates.phone_number ?? currentProfile.phone_number);
  const firstName = normalizeOptionalName(updates.first_name ?? currentProfile.first_name);
  const lastName = normalizeOptionalName(updates.last_name ?? currentProfile.last_name);

  if (!phoneNumber) {
    return {
      error: "PHONE_REQUIRED"
    };
  }

  if (currentProfile.role !== "RESIDENT" && (!firstName || !lastName)) {
    return {
      error: "NAME_REQUIRED"
    };
  }

  await pool.query(
    `
      UPDATE users
      SET
        phone_number = $1,
        first_name = $2,
        last_name = $3
      WHERE user_id = $4
    `,
    [phoneNumber, firstName, lastName, userId]
  );

  const updatedProfile = await getProfileByUserId(userId);
  const changes = {};
  for (const [field, before, after] of [
    ["phone_number", currentProfile.phone_number, updatedProfile.phone_number],
    ["first_name", currentProfile.first_name, updatedProfile.first_name],
    ["last_name", currentProfile.last_name, updatedProfile.last_name]
  ]) {
    if (String(before ?? "") !== String(after ?? "")) changes[field] = { before: before ?? null, after: after ?? null };
  }
  await recordAuditLogSafely({
    actor: requester,
    action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
    entityType: "USER_ACCOUNT",
    entityId: userId,
    entityReference: updatedProfile.email,
    description: `${updatedProfile.role} account profile ${updatedProfile.email} was updated.`,
    metadata: { account_role: updatedProfile.role, changes }
  });

  return {
    profile: updatedProfile
  };
}

async function isEmailUsedByAnotherUser(email, userId, client = pool) {
  const emailResult = await client.query(
    `
      SELECT user_id
      FROM users
      WHERE LOWER(email) = $1
        AND user_id <> $2
      LIMIT 1
    `,
    [email, userId]
  );

  return Boolean(emailResult.rows[0]);
}

export async function requestEmailChange({ userId, email }) {
  const currentProfile = await getProfileByUserId(userId);

  if (!currentProfile) {
    return {
      error: "PROFILE_NOT_FOUND"
    };
  }

  const normalizedEmail = normalizeRequiredString(email).toLowerCase();

  if (!normalizedEmail) {
    return {
      error: "EMAIL_REQUIRED"
    };
  }

  if (!isValidEmail(normalizedEmail)) {
    return {
      error: "INVALID_EMAIL"
    };
  }

  if (normalizedEmail === currentProfile.email.toLowerCase()) {
    return {
      message: "This is already your registered email address.",
      unchanged: true
    };
  }

  if (await isEmailUsedByAnotherUser(normalizedEmail, userId)) {
    return {
      error: "EMAIL_ALREADY_EXISTS"
    };
  }

  const token = signEmailChangeToken({
    userId,
    email: normalizedEmail
  });
  const verificationLink = buildEmailChangeVerificationLink(token);
  const emailResult = await sendEmailChangeVerificationEmail({
    to: normalizedEmail,
    verificationLink
  });

  if (!emailResult.sent || emailResult.rejected?.length > 0) {
    return {
      error: "EMAIL_VERIFICATION_SEND_FAILED"
    };
  }

  return {
    message: "Verification email sent. Please check your new email address to confirm the change."
  };
}

export async function confirmEmailChange({ token }) {
  let payload;

  try {
    payload = verifyEmailChangeToken(token);
  } catch (error) {
    return {
      error: "INVALID_EMAIL_CHANGE_TOKEN"
    };
  }

  const userId = payload.sub;
  const normalizedEmail = normalizeRequiredString(payload.email).toLowerCase();

  if (!userId || !normalizedEmail || !isValidEmail(normalizedEmail)) {
    return {
      error: "INVALID_EMAIL_CHANGE_TOKEN"
    };
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `
        SELECT user_id, status, email, role
        FROM users
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      await client.query("ROLLBACK");
      return {
        error: "PROFILE_NOT_FOUND"
      };
    }

    if (user.status === "DEACTIVATED") {
      await client.query("ROLLBACK");
      return {
        error: "USER_DEACTIVATED"
      };
    }

    if (await isEmailUsedByAnotherUser(normalizedEmail, userId, client)) {
      await client.query("ROLLBACK");
      return {
        error: "EMAIL_ALREADY_EXISTS"
      };
    }

    await client.query(
      `
        UPDATE users
        SET email = $1
        WHERE user_id = $2
      `,
      [normalizedEmail, userId]
    );

    await recordAuditLog({
      client,
      actor: { user_id: user.user_id, role: user.role },
      action: AUDIT_ACTIONS.EMAIL_CHANGED,
      entityType: "USER_ACCOUNT",
      entityId: user.user_id,
      entityReference: normalizedEmail,
      description: `${user.role} account email address was changed.`,
      metadata: { account_role: user.role, changes: { email: { before: user.email, after: normalizedEmail } } }
    });

    await client.query("COMMIT");

    return {
      message: "Email address verified and updated successfully."
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function changeOwnPassword({ userId, currentPassword, newPassword }) {
  const passwordValidation = validatePasswordStrength(newPassword);

  if (!passwordValidation.isValid) {
    return {
      error: "WEAK_PASSWORD",
      passwordErrors: passwordValidation.errors
    };
  }

  const userResult = await pool.query(
    `
      SELECT password_hash, role, email
      FROM users
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  const user = userResult.rows[0];

  if (!user) {
    return {
      error: "PROFILE_NOT_FOUND"
    };
  }

  const passwordMatches = await comparePassword(currentPassword, user.password_hash);

  if (!passwordMatches) {
    return {
      error: "INVALID_CURRENT_PASSWORD"
    };
  }

  const passwordHash = await hashPassword(newPassword);

  await pool.query(
    `
      UPDATE users
      SET password_hash = $1
      WHERE user_id = $2
    `,
    [passwordHash, userId]
  );

  await recordAuditLogSafely({
    actor: { user_id: userId, role: user.role },
    action: AUDIT_ACTIONS.PASSWORD_CHANGED,
    entityType: "USER_ACCOUNT",
    entityId: userId,
    entityReference: user.email,
    description: `${user.role} account ${user.email} changed its password.`,
    metadata: { account_role: user.role }
  });

  return {
    success: true
  };
}
