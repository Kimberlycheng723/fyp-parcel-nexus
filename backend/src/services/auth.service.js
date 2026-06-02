import { pool } from "../db/pool.js";
import { comparePassword } from "../utils/password.js";
import { signAccessToken } from "../utils/jwt.js";

const SAFE_USER_COLUMNS = `
  user_id,
  email,
  first_name,
  last_name,
  phone_number,
  role,
  unit_id,
  status
`;

function toSafeUser(userRow) {
  return {
    user_id: userRow.user_id,
    email: userRow.email,
    role: userRow.role,
    first_name: userRow.first_name,
    last_name: userRow.last_name,
    phone_number: userRow.phone_number,
    unit_id: userRow.unit_id,
    status: userRow.status
  };
}

export async function loginWithEmailAndPassword({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await pool.query(
    `
      SELECT
        ${SAFE_USER_COLUMNS},
        password_hash
      FROM users
      WHERE LOWER(email) = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );

  const user = result.rows[0];

  if (!user) {
    return {
      error: "INVALID_CREDENTIALS"
    };
  }

  if (user.status === "PENDING_ACTIVATION") {
    return {
      error: "PENDING_ACTIVATION"
    };
  }

  if (user.status === "DEACTIVATED") {
    return {
      error: "DEACTIVATED"
    };
  }

  const passwordMatches = await comparePassword(password, user.password_hash);

  if (!passwordMatches) {
    return {
      error: "INVALID_CREDENTIALS"
    };
  }

  const safeUser = toSafeUser(user);

  return {
    accessToken: signAccessToken(safeUser),
    user: safeUser
  };
}

export async function getSafeUserById(userId) {
  const result = await pool.query(
    `
      SELECT ${SAFE_USER_COLUMNS}
      FROM users
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  const user = result.rows[0];

  if (!user) {
    return null;
  }

  return toSafeUser(user);
}
