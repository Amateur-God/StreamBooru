const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || '';
const useSsl = String(process.env.PGSSL || '').toLowerCase() === 'true';

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };