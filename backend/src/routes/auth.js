const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/signup', async (req, res) => {
  const { companyName, userName, email, password } = req.body;
  if (!companyName || !userName || !email || !password) {
    return res.status(400).json({ error: 'Preencha nome da empresa, seu nome, email e senha.' });
  }
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Já existe uma conta com esse email.' });
    }
    const companyResult = await pool.query('INSERT INTO companies (name) VALUES ($1) RETURNING id', [companyName]);
    const companyId = companyResult.rows[0].id;
    const passwordHash = bcrypt.hashSync(password, 10);
    const userResult = await pool.query(
      'INSERT INTO users (company_id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
      [companyId, userName, email, passwordHash]
    );
    await pool.query(
      'INSERT INTO automations (company_id, name, trigger_stage, action_text, enabled) VALUES ($1, $2, $3, $4, TRUE)',
      [companyId, 'Boas-vindas ao novo lead', 'novo', 'Enviar mensagem de boas-vindas no WhatsApp']
    );
    await pool.query(
      'INSERT INTO automations (company_id, name, trigger_stage, action_text, enabled) VALUES ($1, $2, $3, $4, TRUE)',
      [companyId, 'Lembrete de proposta', 'proposta', 'Perguntar se o lead recebeu a proposta']
    );
    const token = jwt.sign({ companyId, userId: userResult.rows[0].id, isAdmin: false }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, company: { id: companyId, name: companyName } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Informe email e senha.' });
  }
  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Email ou senha incorretos.' });
    }
    const companyResult = await pool.query('SELECT * FROM companies WHERE id = $1', [user.company_id]);
    const company = companyResult.rows[0];
    const isAdmin = user.role === 'admin';
    const token = jwt.sign({ companyId: user.company_id, userId: user.id, isAdmin }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, company: { id: company.id, name: company.name }, isAdmin });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
