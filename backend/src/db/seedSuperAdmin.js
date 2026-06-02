import "dotenv/config";

import { pool } from "./pool.js";
import { hashPassword } from "../utils/password.js";

const requiredEnvVars = [
  "SEED_SUPER_ADMIN_EMAIL",
  "SEED_SUPER_ADMIN_PASSWORD",
  "SEED_SUPER_ADMIN_FIRST_NAME",
  "SEED_SUPER_ADMIN_LAST_NAME",
  "SEED_SUPER_ADMIN_PHONE"
];

function getSeedConfig() {
  const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);

  if (missingEnvVars.length > 0) {
    throw new Error(`Missing seed environment variables: ${missingEnvVars.join(", ")}`);
  }

  return {
    email: process.env.SEED_SUPER_ADMIN_EMAIL.trim().toLowerCase(),
    password: process.env.SEED_SUPER_ADMIN_PASSWORD,
    firstName: process.env.SEED_SUPER_ADMIN_FIRST_NAME.trim(),
    lastName: process.env.SEED_SUPER_ADMIN_LAST_NAME.trim(),
    phoneNumber: process.env.SEED_SUPER_ADMIN_PHONE.trim()
  };
}

async function seedSuperAdmin() {
  const seedConfig = getSeedConfig();

  const existingUserResult = await pool.query(
    `
      SELECT user_id
      FROM users
      WHERE LOWER(email) = $1
      LIMIT 1
    `,
    [seedConfig.email]
  );

  if (existingUserResult.rows[0]) {
    console.log("SUPER_ADMIN seed user already exists. No changes made.");
    return;
  }

  const passwordHash = await hashPassword(seedConfig.password);

  await pool.query(
    `
      INSERT INTO users (
        email,
        password_hash,
        first_name,
        last_name,
        phone_number,
        role,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'SUPER_ADMIN', 'ACTIVE')
    `,
    [
      seedConfig.email,
      passwordHash,
      seedConfig.firstName,
      seedConfig.lastName,
      seedConfig.phoneNumber
    ]
  );

  console.log("SUPER_ADMIN seed user created successfully.");
}

seedSuperAdmin()
  .catch((error) => {
    console.error("SUPER_ADMIN seed failed.");
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
