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
    ALTER TABLE automations ADD COLUMN IF NOT EXISTS flow_nodes JSONB DEFAULT '[]';
    ALTER TABLE automations ADD COLUMN IF NOT EXISTS flow_edges JSONB DEFAULT '[]';
  `).catch(() => {});
  // Unique index for wa_msg_id deduplication
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS messages_wa_msg_id_idx ON messages(wa_msg_id) WHERE wa_msg_id IS NOT NULL;
  `).catch(() => {});
  // Job queue for automations (survives Railway restarts)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS automation_jobs (
      id SERIAL PRIMARY KEY,
      automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      next_action_index INTEGER NOT NULL DEFAULT 0,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS automation_jobs_pending_idx ON automation_jobs(run_at) WHERE status = 'pending';
  `).catch(() => {});
  // Add attempts column for job retry tracking
  await pool.query(`
    ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
  `).catch(() => {});
  // Index for company-scoped lead lookups
  await pool.query(`
    CREATE INDEX IF NOT EXISTS leads_company_id_idx ON leads(company_id);
  `).catch(() => {});
  // Meta Pixel + CAPI per company
  await pool.query(`
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS pixel_id TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS capi_token TEXT;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS capi_token_set BOOLEAN NOT NULL DEFAULT FALSE;
  `).catch(() => {});
  // Tags on leads
  await pool.query(`
    ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
  `).catch(() => {});
  // Message templates per company
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_templates (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `).catch(() => {});
  // Role de usuário: 'admin' gerencia todas as empresas, 'user' só vê a própria
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
  `).catch(() => {});
  console.log('Banco inicializado.');
}

initDb().catch(console.error);

module.exports = pool;
