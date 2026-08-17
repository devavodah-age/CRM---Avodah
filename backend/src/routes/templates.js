const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM message_templates WHERE company_id=$1 ORDER BY name ASC',
      [req.companyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.post('/', async (req, res) => {
  const { name, text } = req.body;
  if (!name || !text) return res.status(400).json({ error: 'Nome e texto são obrigatórios.' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO message_templates (company_id, name, text) VALUES ($1,$2,$3) RETURNING *',
      [req.companyId, name.trim(), text.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.put('/:id', async (req, res) => {
  const { name, text } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE message_templates SET
        name = COALESCE($1, name),
        text = COALESCE($2, text)
       WHERE id=$3 AND company_id=$4 RETURNING *`,
      [name || null, text || null, req.params.id, req.companyId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Template não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM message_templates WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
