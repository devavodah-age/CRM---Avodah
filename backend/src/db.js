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
      wa_msg_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS automations (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      name TEXT NOT NULL,
      trigger_stage TEXT NOT NULL DEFAULT '',
      action_text TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      trigger_type TEXT DEFAULT 'stage_changed',
      trigger_config JSONB DEFAULT '{}',
      actions JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS whatsapp_sessions (
      company_id INTEGER PRIMARY KEY REFERENCES companies(id),
      creds JSONB,
      keys JSONB,
      status TEXT NOT NULL DEFAULT 'disconnected',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Migrations for existing deployments
  await pool.query(`
    ALTER TABLE automations ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'stage_changed';
    ALTER TABLE automations ADD COLUMN IF NOT EXISTS trigger_config JSONB DEFAULT '{}';
    ALTER TABLE automations ADD COLUMN IF NOT EXISTS actions JSONB DEFAULT '[]';
    ALTER TABLE automations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE automations ALTER COLUMN trigger_stage SET DEFAULT '';
    ALTER TABLE automations ALTER COLUMN action_text SET DEFAULT '';
    ALTER TABLE automations ADD COLUMN IF NOT EXISTS flow_nodes JSONB DEFAULT '[]';
    ALTER TABLE automations ADD COLUMN IF NOT EXISTS flow_edges JSONB DEFAULT '[]';
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS wa_msg_id TEXT;
  `).catch(() => {});
  // Unique index for wa_msg_id deduplication
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS messages_wa_msg_id_idx ON messages(wa_msg_id) WHERE wa_msg_id IS NOT NULL;
  `).catch(() => {});
  console.log('Banco inicializado.');
}

initDb().catch(console.error);

module.exports = pool;
