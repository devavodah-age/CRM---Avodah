const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM automations WHERE company_id = $1 ORDER BY id ASC', [req.companyId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.post('/', async (req, res) => {
  const { name, trigger_stage, action_text } = req.body;
  if (!name || !trigger_stage || !action_text) {
    return res.status(400).json({ error: 'Preencha nome, etapa gatilho e ação.' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO automations (company_id, name, trigger_stage, action_text, enabled) VALUES ($1, $2, $3, $4, TRUE) RETURNING *',
      [req.companyId, name, trigger_stage, action_text]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const autoResult = await pool.query(
      'SELECT * FROM automations WHERE id = $1 AND company_id = $2',
      [req.params.id, req.companyId]
    );
    const automation = autoResult.rows[0];
    if (!automation) return res.status(404).json({ error: 'Automação não encontrada.' });

    const enabled = req.body.enabled !== undefined ? req.body.enabled : !automation.enabled;
    await pool.query('UPDATE automations SET enabled = $1 WHERE id = $2', [enabled, automation.id]);
    res.json({ ...automation, enabled });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM automations WHERE id = $1 AND company_id = $2', [req.params.id, req.companyId]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
