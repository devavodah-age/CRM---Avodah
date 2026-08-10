// db.js
// Aqui a gente define o banco de dados: onde tudo fica guardado de verdade.
// Usamos SQLite pra começar (é um banco de dados que vive num arquivo só,
// zero configuração). Quando for pra produção com muitos clientes ao mesmo
// tempo, vale migrar pra PostgreSQL - a estrutura das tabelas continua igual.

const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "..", "pulso.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// "companies" = cada empresa cliente do seu SaaS (multi-tenant).
// Todo o resto (usuários, leads, automações) pertence a uma company_id.
db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  value REAL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'novo',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  from_type TEXT NOT NULL CHECK(from_type IN ('me','lead','system')),
  text TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  trigger_stage TEXT NOT NULL,
  action_text TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
`);

module.exports = db;
