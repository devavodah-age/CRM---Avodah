const express = require('express')
const router = express.Router()
const { pool } = require('../db')
const { JWT_SECRET } = require('../middleware/auth')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { ok, fail } = require('../lib/respond')

// Middleware: só admin pode acessar estas rotas
function requireAdmin(req, res, next) {
  if (!req.isAdmin) {
    return fail(res, 'Acesso restrito a administradores.', 403)
  }
  next()
}

// GET /api/companies — lista todas as empresas (admin)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.created_at,
              COUNT(DISTINCT u.id) AS usuarios,
              COUNT(DISTINCT l.id) AS leads,
              ws.status AS whatsapp_status
         FROM companies c
         LEFT JOIN users u ON u.company_id = c.id
         LEFT JOIN leads l ON l.company_id = c.id
         LEFT JOIN whatsapp_sessions ws ON ws.company_id = c.id
        GROUP BY c.id, c.name, c.created_at, ws.status
        ORDER BY c.created_at DESC`,
    )
    ok(res, { companies: rows })
  } catch (err) {
    console.error('[GET /companies]', err)
    fail(res, 'Erro interno', 500)
  }
})

// POST /api/companies — cria nova empresa + usuário inicial (admin)
router.post('/', requireAdmin, async (req, res) => {
  const { companyName, userName, email, password } = req.body
  if (!companyName || !userName || !email || !password)
    return fail(res, 'companyName, userName, email e password obrigatórios', 400)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Verifica email duplicado
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK')
      return fail(res, 'Email já cadastrado', 409)
    }

    // Cria empresa
    const { rows: companyRows } = await client.query(
      'INSERT INTO companies (name) VALUES ($1) RETURNING id',
      [companyName],
    )
    const companyId = companyRows[0].id

    // Cria usuário da empresa (role = user)
    const hash = await bcrypt.hash(password, 10)
    const { rows: userRows } = await client.query(
      `INSERT INTO users (company_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'user') RETURNING id`,
      [companyId, userName, email, hash],
    )

    await client.query('COMMIT')
    ok(res, {
      company: { id: companyId, name: companyName },
      user: { id: userRows[0].id, email },
    }, 201)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /companies]', err)
    fail(res, 'Erro interno', 500)
  } finally {
    client.release()
  }
})

// DELETE /api/companies/:id — remove empresa e todos os dados (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Deleta em ordem pra respeitar FKs
    await client.query('DELETE FROM automation_jobs WHERE company_id = $1', [id])
    await client.query('DELETE FROM automations WHERE company_id = $1', [id])
    await client.query('DELETE FROM message_templates WHERE company_id = $1', [id])
    await client.query('DELETE FROM messages WHERE lead_id IN (SELECT id FROM leads WHERE company_id = $1)', [id])
    await client.query('DELETE FROM leads WHERE company_id = $1', [id])
    await client.query('DELETE FROM whatsapp_sessions WHERE company_id = $1', [id])
    await client.query('DELETE FROM users WHERE company_id = $1', [id])
    await client.query('DELETE FROM companies WHERE id = $1', [id])
    await client.query('COMMIT')
    ok(res, null)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[DELETE /companies/:id]', err)
    fail(res, 'Erro interno', 500)
  } finally {
    client.release()
  }
})

// POST /api/companies/:id/token — admin obtém token da empresa do cliente
// Permite operar como aquela empresa sem saber a senha do cliente.
router.post('/:id/token', requireAdmin, async (req, res) => {
  const { id } = req.params
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM companies WHERE id = $1',
      [id],
    )
    if (rows.length === 0)
      return fail(res, 'Empresa não encontrada', 404)

    // Busca um usuário da empresa pra popular userId no token
    const { rows: userRows } = await pool.query(
      'SELECT id FROM users WHERE company_id = $1 LIMIT 1',
      [id],
    )
    const userId = userRows[0]?.id ?? null

    const token = jwt.sign(
      { companyId: id, userId, isAdminImpersonating: true },
      JWT_SECRET,
      { expiresIn: '8h' },
    )
    ok(res, { token, company: rows[0] })
  } catch (err) {
    console.error('[POST /companies/:id/token]', err)
    fail(res, 'Erro interno', 500)
  }
})

module.exports = router
