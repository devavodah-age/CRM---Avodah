// routes/auth.js
// Rotas públicas: cadastro de uma nova empresa cliente (signup) e login.

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { JWT_SECRET } = require("../middleware/auth");

const router = express.Router();

// POST /api/auth/signup
// Quando um novo cliente do seu SaaS se cadastra, isso cria:
// 1) a "company" dele (o tenant)
// 2) o primeiro usuário (admin) dessa company
router.post("/signup", (req, res) => {
  const { companyName, userName, email, password } = req.body;

  if (!companyName || !userName || !email || !password) {
    return res.status(400).json({ error: "Preencha nome da empresa, seu nome, email e senha." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(409).json({ error: "Já existe uma conta com esse email." });
  }

  const insertCompany = db.prepare("INSERT INTO companies (name) VALUES (?)");
  const companyResult = insertCompany.run(companyName);
  const companyId = companyResult.lastInsertRowid;

  const passwordHash = bcrypt.hashSync(password, 10);
  const insertUser = db.prepare(
    "INSERT INTO users (company_id, name, email, password_hash) VALUES (?, ?, ?, ?)"
  );
  const userResult = insertUser.run(companyId, userName, email, passwordHash);

  // cria automações padrão pra essa empresa começar, iguais ao protótipo
  const insertAuto = db.prepare(
    "INSERT INTO automations (company_id, name, trigger_stage, action_text, enabled) VALUES (?, ?, ?, ?, 1)"
  );
  insertAuto.run(companyId, "Boas-vindas ao novo lead", "novo", "Enviar mensagem de boas-vindas no WhatsApp");
  insertAuto.run(companyId, "Lembrete de proposta", "proposta", "Perguntar se o lead recebeu a proposta");

  const token = jwt.sign({ companyId, userId: userResult.lastInsertRowid }, JWT_SECRET, { expiresIn: "30d" });
  res.status(201).json({ token, company: { id: companyId, name: companyName } });
});

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Informe email e senha." });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Email ou senha incorretos." });
  }

  const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(user.company_id);
  const token = jwt.sign({ companyId: user.company_id, userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, company: { id: company.id, name: company.name } });
});

module.exports = router;
