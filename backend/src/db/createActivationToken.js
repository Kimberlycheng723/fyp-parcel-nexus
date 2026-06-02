import "dotenv/config";

import { pool } from "./pool.js";
import { createActivationTokenForUser } from "../services/activation.service.js";

function assertDevelopmentEnvironment() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Activation token development script can only run when NODE_ENV=development.");
  }
}

function getActivationEmail() {
  if (!process.env.DEV_ACTIVATION_EMAIL) {
    throw new Error("DEV_ACTIVATION_EMAIL is not configured.");
  }

  return process.env.DEV_ACTIVATION_EMAIL.trim().toLowerCase();
}

async function createDevelopmentActivationToken() {
  assertDevelopmentEnvironment();

  const email = getActivationEmail();
  const userResult = await pool.query(
    `
      SELECT user_id, email, status
      FROM users
      WHERE LOWER(email) = $1
      LIMIT 1
    `,
    [email]
  );

  const user = userResult.rows[0];

  if (!user) {
    throw new Error(`No user found with email: ${email}`);
  }

  if (user.status === "DEACTIVATED") {
    throw new Error("Cannot create an activation token for a deactivated user.");
  }

  const activationToken = await createActivationTokenForUser(user.user_id);

  console.log("Development activation token created.");
  console.log(`User email: ${user.email}`);
  console.log(`Expires in: ${activationToken.expiresInDays} days`);
  console.log(`Raw activation token: ${activationToken.rawToken}`);
}

createDevelopmentActivationToken()
  .catch((error) => {
    console.error("Development activation token creation failed.");
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
