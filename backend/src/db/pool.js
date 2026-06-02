import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function testDatabaseConnection() {
  const result = await pool.query("SELECT NOW() AS checked_at");

  return {
    connected: true,
    checkedAt: result.rows[0].checked_at
  };
}
