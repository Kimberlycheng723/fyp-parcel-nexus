import { pool } from "../db/pool.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import { validatePasswordStrength } from "../utils/passwordValidation.js";

const PROFILE_COLUMNS = `
  u.user_id,
  u.email,
  u.first_name,
  u.last_name,
  u.phone_number,
  u.role,
  u.unit_id,
  u.assigned_post,
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
    assigned_post: row.assigned_post,
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

export async function updateProfile({ userId, updates }) {
  const currentProfile = await getProfileByUserId(userId);

  if (!currentProfile) {
    return {
      error: "PROFILE_NOT_FOUND"
    };
  }

  const email = normalizeRequiredString(updates.email ?? currentProfile.email).toLowerCase();
  const phoneNumber = normalizeRequiredString(updates.phone_number ?? currentProfile.phone_number);
  const firstName = normalizeOptionalName(updates.first_name ?? currentProfile.first_name);
  const lastName = normalizeOptionalName(updates.last_name ?? currentProfile.last_name);

  if (!email) {
    return {
      error: "EMAIL_REQUIRED"
    };
  }

  if (!isValidEmail(email)) {
    return {
      error: "INVALID_EMAIL"
    };
  }

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

  const emailResult = await pool.query(
    `
      SELECT user_id
      FROM users
      WHERE LOWER(email) = $1
        AND user_id <> $2
      LIMIT 1
    `,
    [email, userId]
  );

  if (emailResult.rows[0]) {
    return {
      error: "EMAIL_ALREADY_EXISTS"
    };
  }

  await pool.query(
    `
      UPDATE users
      SET
        email = $1,
        phone_number = $2,
        first_name = $3,
        last_name = $4
      WHERE user_id = $5
    `,
    [email, phoneNumber, firstName, lastName, userId]
  );

  return {
    profile: await getProfileByUserId(userId)
  };
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
      SELECT password_hash
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

  return {
    success: true
  };
}
