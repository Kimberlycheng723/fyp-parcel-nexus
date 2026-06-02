import "dotenv/config";

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "./pool.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(currentDir, "migrations", "001_create_fyp1_schema.sql");

async function migrate() {
  const schemaSql = await readFile(schemaPath, "utf8");

  await pool.query(schemaSql);
  console.log("Database schema applied successfully.");
}

migrate()
  .catch((error) => {
    console.error("Database schema migration failed.");
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
