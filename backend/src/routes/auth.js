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
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Serializa apenas a escolha do primeiro administrador e evita duas contas
    // receberem esse papel em cadastros simultâneos.
    await client.query('SELECT pg_advisory_xact_lock($1)', [74012026]);
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Já existe uma conta com esse email.' });
    }
    const companyResult = await client.query('INSERT INTO companies (name) VALUES ($1) RETURNING id', [companyName.trim()]);
    const companyId = companyResult.rows[0].id;
    const passwordHash = bcrypt.hashSync(password, 10);
    // Primeira conta do sistema vira admin automaticamente
    const totalUsers = await client.query('SELECT COUNT(*) FROM users');
    const role = parseInt(totalUsers.rows[0].count) === 0 ? 'admin' : 'user';
    const userResult = await client.query(
      'INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [companyId, userName.trim(), normalizedEmail, passwordHash, role]
    );
    await client.query('COMMIT');
    const isAdmin = role === 'admin';
    const token = jwt.sign({ companyId, userId: userResult.rows[0].id, isAdmin }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, company: { id: companyId, name: companyName }, isAdmin });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  } finally {
    client?.release();
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
