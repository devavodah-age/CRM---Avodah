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
      last_disconnect_code INTEGER,
      last_disconnect_reason TEXT,
      last_disconnect_message TEXT,
      last_connected_at TIMESTAMPTZ,
      last_disconnected_at TIMESTAMPTZ,
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
  `);
  // Mensagens recebidas por um JID @lid podem chegar antes do evento que revela
  // o telefone real. Mantemos essas mensagens até o mapeamento ser conhecido.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_pending_messages (
      id BIGSERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      wa_msg_id TEXT NOT NULL,
      lid TEXT NOT NULL,
      push_name TEXT,
      text TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, wa_msg_id)
    );
    CREATE INDEX IF NOT EXISTS whatsapp_pending_messages_lid_idx
      ON whatsapp_pending_messages(company_id, lid);
  `);
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
    ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
    ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS last_error TEXT;
    ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
  `).catch(() => {});
  // Outbox persistente para eventos enviados ao n8n
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration_events (
      id BIGSERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      locked_at TIMESTAMPTZ,
      last_error TEXT,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS integration_events_pending_idx
      ON integration_events(run_at) WHERE status = 'pending';
  `).catch(() => {});
  // Persist LID→phone map across restarts
  await pool.query(`
    ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS lid_map JSONB DEFAULT '{}';
    ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS last_disconnect_code INTEGER;
    ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS last_disconnect_reason TEXT;
    ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS last_disconnect_message TEXT;
    ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMPTZ;
    ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS last_disconnected_at TIMESTAMPTZ;
  `).catch(() => {});
  // Histórico curto para diagnosticar quedas e ciclos de reconexão do WhatsApp
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_connection_events (
      id BIGSERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      status_code INTEGER,
      reason TEXT,
      message TEXT,
      reconnect_attempt INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS whatsapp_connection_events_company_created_idx
      ON whatsapp_connection_events(company_id, created_at DESC);
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_contacts (
      id BIGSERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      jid TEXT NOT NULL,
      lid TEXT,
      phone TEXT,
      name TEXT,
      imported_lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, jid)
    );
    CREATE INDEX IF NOT EXISTS whatsapp_contacts_company_idx ON whatsapp_contacts(company_id, last_seen_at DESC);
  `).catch(() => {});
  // Campanhas de disparo controlado. Cada destinatário tem uma linha própria
  // para permitir retry, cancelamento e auditoria sem reenviar os já concluídos.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','queued','running','paused','completed','cancelled')),
      interval_seconds INTEGER NOT NULL DEFAULT 5 CHECK (interval_seconds >= 3),
      total_count INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS broadcast_recipients (
      id BIGSERIAL PRIMARY KEY,
      broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
      lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      rendered_message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','sending','sent','failed')),
      wa_msg_id TEXT,
      error TEXT,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (broadcast_id, lead_id)
    );
    CREATE INDEX IF NOT EXISTS broadcast_recipients_pending_idx
      ON broadcast_recipients(broadcast_id, status, id);
  `).catch(() => {});
  // Role de usuário: 'admin' gerencia todas as empresas, 'user' só vê a própria
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
  `).catch(() => {});
  console.log('Banco inicializado.');
}

// Em testes sem banco configurado, não inicia uma conexão implícita com localhost.
// As suítes de integração usam TEST_DATABASE_URL quando disponível.
const dbReady = (process.env.NODE_ENV !== 'test' || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL)
  ? initDb()
  : Promise.resolve();

// Evita rejeição não tratada durante imports, mas preserva a rejeição para que
// server.js não suba os workers antes das migrations terminarem.
dbReady.catch((error) => console.error('Falha ao inicializar banco:', error));

module.exports = pool;
module.exports.initDb = initDb;
module.exports.dbReady = dbReady;
