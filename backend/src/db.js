const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      name TEXT NOT NULL,
      company_name TEXT,
      phone TEXT,
      value DECIMAL DEFAULT 0,
      stage TEXT NOT NULL DEFAULT 'novo',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES leads(id),
      from_type TEXT NOT NULL CHECK(from_type IN ('me','lead','system')),
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS automations (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      name TEXT NOT NULL,
      trigger_stage TEXT NOT NULL,
      action_text TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS whatsapp_sessions (
      company_id INTEGER PRIMARY KEY REFERENCES companies(id),
      creds JSONB,
      keys JSONB,
      status TEXT NOT NULL DEFAULT 'disconnected',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Banco inicializado.');
}

initDb().catch(console.error);

module.exports = pool;
