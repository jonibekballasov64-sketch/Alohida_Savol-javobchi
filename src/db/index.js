const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { DATABASE_URL } = require('../config');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL && DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
});

async function initSchema() {
  const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('DB sxemasi tayyor.');
}

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query, initSchema };
