import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "./pool.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(currentDir, "migrations");

async function migrate() {
  const migrationFiles = (await readdir(migrationsDir))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  for (const migrationFile of migrationFiles) {
    const migrationPath = resolve(migrationsDir, migrationFile);
    const migrationSql = await readFile(migrationPath, "utf8");

    await pool.query(migrationSql);
    console.log(`Applied migration: ${migrationFile}`);
  }

  console.log("Database migrations applied successfully.");
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
