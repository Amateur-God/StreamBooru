require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query, pool } = require('./db');

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function applied() {
  const res = await query('SELECT filename FROM schema_migrations ORDER BY filename ASC');
  return new Set(res.rows.map(r => r.filename));
}

async function runSqlFile(client, fullPath) {
  const sql = fs.readFileSync(fullPath, 'utf8');
  await client.query(sql);
}

async function run() {
  await ensureMigrationsTable();
  const dir = path.join(__dirname, 'migrations');
  const all = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const done = await applied();
  const client = await pool.connect();
  try {
    for (const f of all) {
      if (done.has(f)) continue;
      console.log('Applying', f);
      await client.query('BEGIN');
      await runSqlFile(client, path.join(dir, f));
      await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [f]);
      await client.query('COMMIT');
      console.log('Applied', f);
    }
    console.log('Migrations complete');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Migration failed:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();