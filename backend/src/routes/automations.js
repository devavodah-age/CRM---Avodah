const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/status', async (req, res) => {
  try {
    const [jobCounts, failedJobs, eventCounts, failedEvents] = await Promise.all([
      pool.query(
        `SELECT status, COUNT(*)::int AS count FROM automation_jobs
         WHERE company_id=$1 GROUP BY status`,
        [req.companyId]
      ),
      pool.query(
        `SELECT j.id, j.lead_id, j.attempts, j.last_error, j.created_at, a.name AS automation_name
         FROM automation_jobs j JOIN automations a ON a.id=j.automation_id
         WHERE j.company_id=$1 AND j.status='failed'
         ORDER BY j.id DESC LIMIT 20`,
        [req.companyId]
      ),
      pool.query(
        `SELECT status, COUNT(*)::int AS count FROM integration_events
         WHERE company_id=$1 GROUP BY status`,
        [req.companyId]
      ),
      pool.query(
        `SELECT id, event_type, attempts, last_error, created_at
         FROM integration_events WHERE company_id=$1 AND status='failed'
         ORDER BY id DESC LIMIT 20`,
        [req.companyId]
      ),
    ]);
    res.json({
      automationJobs: {
        counts: Object.fromEntries(jobCounts.rows.map(row => [row.status, row.count])),
        failed: failedJobs.rows,
      },
      n8nEvents: {
        counts: Object.fromEntries(eventCounts.rows.map(row => [row.status, row.count])),
        failed: failedEvents.rows,
      },
    });
  } catch (e) {
    console.error('[Automations] status error:', e.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM automations WHERE company_id=$1 ORDER BY id ASC',
      [req.companyId]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Erro interno.' }); }
});

router.post('/', async (req, res) => {
  const { name, trigger_type, trigger_config, actions, flow_nodes, flow_edges } = req.body;
  if (!name || !trigger_type || !Array.isArray(actions) || actions.length === 0) {
    return res.status(400).json({ error: 'Preencha nome, gatilho e pelo menos uma ação.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO automations (company_id, name, trigger_type, trigger_config, actions, flow_nodes, flow_edges, trigger_stage, action_text, enabled, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'','',TRUE,NOW()) RETURNING *`,
      [req.companyId, name, trigger_type, JSON.stringify(trigger_config || {}), JSON.stringify(actions), JSON.stringify(flow_nodes || []), JSON.stringify(flow_edges || [])]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.put('/:id', async (req, res) => {
  const { name, trigger_type, trigger_config, actions, flow_nodes, flow_edges } = req.body;
  if (!name || !trigger_type || !Array.isArray(actions) || actions.length === 0) {
    return res.status(400).json({ error: 'Preencha nome, gatilho e pelo menos uma ação.' });
  }
  try {
    const { rows } = await pool.query('SELECT * FROM automations WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
    if (!rows[0]) return res.status(404).json({ error: 'Automação não encontrada.' });
    const updated = await pool.query(
      `UPDATE automations SET name=$1, trigger_type=$2, trigger_config=$3, actions=$4, flow_nodes=$5, flow_edges=$6 WHERE id=$7 RETURNING *`,
      [name, trigger_type, JSON.stringify(trigger_config || {}), JSON.stringify(actions), JSON.stringify(flow_nodes || []), JSON.stringify(flow_edges || []), rows[0].id]
    );
    res.json(updated.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro interno.' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM automations WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
    if (!rows[0]) return res.status(404).json({ error: 'Automação não encontrada.' });
    const enabled = req.body.enabled !== undefined ? req.body.enabled : !rows[0].enabled;
    const updated = await pool.query('UPDATE automations SET enabled=$1 WHERE id=$2 RETURNING *', [enabled, rows[0].id]);
    res.json(updated.rows[0]);
  } catch { res.status(500).json({ error: 'Erro interno.' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM automations WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
    res.status(204).send();
  } catch { res.status(500).json({ error: 'Erro interno.' }); }
});

module.exports = router;
