const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || '';
let useSsl = String(process.env.PGSSL || 'false').toLowerCase();
if (useSsl === 'false') {
    useSsl = false;
} else if (useSsl === 'true') {
    useSsl = true;
} else {
    // If PGSSL is not explicitly set, default based on DATABASE_URL
    useSsl = !!connectionString && !connectionString.includes('sslmode=disable');
}


console.log(`Database connection SSL: ${useSsl}`); // Log SSL status

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        // Log slow queries
        if (duration > 100) { console.log('executed query', { text, duration, rows: res.rowCount }); }
        return res;
    } catch (err) {
        console.error('Database query error:', { text, params, error: err.message });
        throw err; // Re-throw the error after logging
    }
}

// Function to gracefully close the pool connection
async function closePool() {
  console.log("Closing database connection pool...");
  await pool.end();
  console.log("Database connection pool closed.");
}

// Handle graceful shutdown signals
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received.');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received.');
  await closePool();
  process.exit(0);
});


module.exports = { pool, query, closePool };