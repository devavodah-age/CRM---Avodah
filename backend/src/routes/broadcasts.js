const express = require('express');
const pool = require('../db');
const { renderMessage } = require('../broadcasts');
const { ok, fail } = require('../lib/respond');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*,
        (SELECT COUNT(*)::int FROM broadcast_recipients r WHERE r.broadcast_id=b.id) AS recipient_count
       FROM broadcasts b WHERE b.company_id=$1 ORDER BY b.id DESC LIMIT 50`, [req.companyId]
    );
    ok(res, rows);
  } catch (error) { console.error(error); fail(res, 'Erro interno.', 500); }
});

router.get('/:id', async (req, res) => {
  try {
    const campaign = await pool.query(
      'SELECT * FROM broadcasts WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]
    );
    if (!campaign.rows[0]) return fail(res, 'Disparo não encontrado.', 404);
    const recipients = await pool.query(
      `SELECT r.*, l.name FROM broadcast_recipients r JOIN leads l ON l.id=r.lead_id
       WHERE r.broadcast_id=$1 ORDER BY r.id`, [req.params.id]
    );
    ok(res, { ...campaign.rows[0], recipients: recipients.rows });
  } catch (error) { console.error(error); fail(res, 'Erro interno.', 500); }
});

router.post('/', async (req, res) => {
  const { name, message, leadIds, intervalSeconds, confirmedOptIn } = req.body;
  if (!confirmedOptIn) return fail(res, 'Confirme que os contatos autorizaram receber esta mensagem.', 400);
  if (!name?.trim() || !message?.trim()) return fail(res, 'Informe nome e mensagem.', 400);
  if (!Array.isArray(leadIds) || leadIds.length === 0 || leadIds.length > 200) {
    return fail(res, 'Selecione entre 1 e 200 leads.', 400);
  }
  const interval = Math.max(3, Math.min(3600, Number(intervalSeconds) || 5));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const leads = await client.query(
      `SELECT id, name, company_name, phone FROM leads
       WHERE company_id=$1 AND id=ANY($2::int[]) AND phone IS NOT NULL`,
      [req.companyId, leadIds]
    );
    if (!leads.rows.length) {
      await client.query('ROLLBACK');
      return fail(res, 'Nenhum lead selecionado possui telefone.', 400);
    }
    const campaign = await client.query(
      `INSERT INTO broadcasts (company_id,name,message,status,interval_seconds,total_count)
       VALUES ($1,$2,$3,'queued',$4,$5) RETURNING *`,
      [req.companyId, name.trim(), message.trim(), interval, leads.rows.length]
    );
    for (const lead of leads.rows) {
      await client.query(
        `INSERT INTO broadcast_recipients (broadcast_id,lead_id,phone,rendered_message)
         VALUES ($1,$2,$3,$4)`,
        [campaign.rows[0].id, lead.id, lead.phone, renderMessage(message, lead)]
      );
    }
    await client.query('COMMIT');
    ok(res, campaign.rows[0], 201);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error); fail(res, 'Não foi possível criar o disparo.', 500);
  } finally { client.release(); }
});

router.post('/:id/start', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE broadcasts SET status='running', started_at=COALESCE(started_at,NOW())
       WHERE id=$1 AND company_id=$2 AND status IN ('queued','paused') RETURNING *`,
      [req.params.id, req.companyId]
    );
    if (!rows[0]) return fail(res, 'Disparo não encontrado ou já iniciado.', 404);
    ok(res, rows[0]);
  } catch (error) { console.error(error); fail(res, 'Erro interno.', 500); }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE broadcasts SET status='cancelled', completed_at=NOW()
       WHERE id=$1 AND company_id=$2 AND status IN ('queued','running','paused') RETURNING *`,
      [req.params.id, req.companyId]
    );
    if (!rows[0]) return fail(res, 'Disparo não encontrado ou já finalizado.', 404);
    ok(res, rows[0]);
  } catch (error) { console.error(error); fail(res, 'Erro interno.', 500); }
});

module.exports = router;
