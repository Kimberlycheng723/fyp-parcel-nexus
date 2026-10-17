import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../src/db/pool.js';

const file = process.env.FEATURE18_BASELINE_PATH;
assert.ok(file?.startsWith('/tmp/') || file?.startsWith('/private/tmp/'), 'Use a temporary baseline path');
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
async function snapshot() {
  const tables = {}, files = {};
  const names = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  for (const { tablename } of names) {
    const rows = await pool.query(`SELECT md5(to_jsonb(t)::text) AS digest FROM ${quote(tablename)} t ORDER BY 1`);
    tables[tablename] = rows.rows.map((row) => row.digest);
  }
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch((error) => {
      if (error.code === 'ENOENT') return []; throw error;
    })) {
      const name = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) files[name] = createHash('sha256').update(await readFile(name)).digest('hex');
    }
  }
  await walk('uploads'); await walk('private-uploads');
  return { tables, files };
}
try {
  const current = await snapshot();
  if (process.argv.includes('--verify')) {
    const before = JSON.parse(await readFile(file, 'utf8'));
    for (const [table, digests] of Object.entries(before.tables)) {
      const remaining = [...(current.tables[table] || [])];
      for (const digest of digests) {
        const index = remaining.indexOf(digest);
        assert.notEqual(index, -1, `Pre-existing row changed or removed in ${table}`);
        remaining.splice(index, 1);
      }
    }
    for (const [name, digest] of Object.entries(before.files)) assert.equal(current.files[name], digest, 'Pre-existing upload changed or removed');
    console.log('All pre-existing row hashes and original upload hashes are unchanged.');
  } else await writeFile(file, JSON.stringify(current), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ counts: Object.fromEntries(Object.entries(current.tables).map(([name, rows]) => [name, rows.length])), upload_files: Object.keys(current.files).length }));
} finally { await pool.end(); }
