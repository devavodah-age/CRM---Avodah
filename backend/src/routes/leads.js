const express = require('express');
const pool = require('../db');
const { triggerAutomations } = require('../automationEngine');
const { sendMessage, getStatus } = require('../whatsapp');
const { fireLeadEvent } = require('../metaPixel');
const { ok, fail } = require('../lib/respond');

const router = express.Router();

async function attachMessages(lead) {
  const result = await pool.query('SELECT * FROM messages WHERE lead_id = $1 ORDER BY id ASC', [lead.id]);
  return { ...lead, messages: result.rows };
}

router.get('/', async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  try {
    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT l.*,
          (SELECT text FROM messages WHERE lead_id=l.id ORDER BY id DESC LIMIT 1) as last_message,
          (SELECT COUNT(*) FROM messages WHERE lead_id=l.id)::int as message_count
         FROM leads l WHERE l.company_id=$1 ORDER BY l.id DESC LIMIT $2 OFFSET $3`,
        [req.companyId, limit, offset]
      ),
      pool.query(
        'SELECT COUNT(*)::int as total FROM leads WHERE company_id=$1',
        [req.companyId]
      ),
    ]);

    ok(res, {
      leads: dataResult.rows.map(l => ({ ...l, messages: [] })),
      total: countResult.rows[0].total,
      page,
      limit,
    });
  } catch (err) {
    console.error(err);
    fail(res, 'Erro interno.', 500);
  }
});

router.post('/', async (req, res) => {
  const { name, company_name, phone, value } = req.body;
  if (!name) return fail(res, 'O lead precisa de um nome.', 400);
  try {
    const result = await pool.query(
      "INSERT INTO leads (company_id, name, company_name, phone, value, stage) VALUES ($1, $2, $3, $4, $5, 'novo') RETURNING id",
      [req.companyId, name, company_name || null, phone || null, value || 0]
    );
    const leadId = result.rows[0].id;
    await pool.query("INSERT INTO messages (lead_id, from_type, text) VALUES ($1, 'system', 'Lead criado manualmente')", [leadId]);
    const lead = (await pool.query('SELECT * FROM leads WHERE id = $1', [leadId])).rows[0];
    triggerAutomations(req.companyId, 'new_lead', { lead }).catch(console.error);
    fireLeadEvent(req.companyId, lead).catch(console.error);
    ok(res, await attachMessages(lead), 201);
  } catch (err) {
    console.error(err);
    fail(res, 'Erro interno.', 500);
  }
});

router.patch('/:id/stage', async (req, res) => {
  const { stage } = req.body;
  try {
    const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1 AND company_id = $2', [req.params.id, req.companyId]);
    const lead = leadResult.rows[0];
    if (!lead) return fail(res, 'Lead não encontrado.', 404);
    if (!stage) return fail(res, 'Informe a nova etapa.', 400);

    await pool.query('UPDATE leads SET stage = $1 WHERE id = $2', [stage, lead.id]);
    triggerAutomations(req.companyId, 'stage_changed', { lead: { ...lead, stage }, stage }).catch(console.error);

    const updated = (await pool.query('SELECT * FROM leads WHERE id = $1', [lead.id])).rows[0];
    ok(res, { lead: await attachMessages(updated), automationTriggered: null });
  } catch (err) {
    console.error(err);
    fail(res, 'Erro interno.', 500);
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const leadResult = await pool.query('SELECT * FROM leads WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
    const lead = leadResult.rows[0];
    if (!lead) return fail(res, 'Lead não encontrado.', 404);
    const { name, company_name, phone, value, tags } = req.body;
    const setClauses = [];
    const params = [];
    let idx = 1;
    if (name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(name); }
    if (company_name !== undefined) { setClauses.push(`company_name = $${idx++}`); params.push(company_name); }
    if (phone !== undefined) { setClauses.push(`phone = $${idx++}`); params.push(phone); }
    if (value !== undefined) { setClauses.push(`value = $${idx++}`); params.push(value); }
    if (tags !== undefined) { setClauses.push(`tags = $${idx++}`); params.push(tags); }
    if (setClauses.length === 0) return ok(res, await attachMessages(lead));
    params.push(lead.id);
    const updated = await pool.query(
      `UPDATE leads SET ${setClauses.join(', ')} WHERE id=$${idx} RETURNING *`,
      params
    );
    ok(res, await attachMessages(updated.rows[0]));
  } catch (err) {
    console.error(err);
    fail(res, 'Erro interno.', 500);
  }
});

router.post('/import', async (req, res) => {
  const { leads: leadsData } = req.body;
  if (!Array.isArray(leadsData) || leadsData.length === 0) {
    return fail(res, 'Nenhum lead para importar.', 400);
  }
  let imported = 0;
  for (const row of leadsData) {
    if (!row.name || !row.name.trim()) continue;
    try {
      const result = await pool.query(
        "INSERT INTO leads (company_id, name, company_name, phone, value, stage) VALUES ($1,$2,$3,$4,$5,'novo') RETURNING id",
        [req.companyId, row.name.trim(), row.company_name || null, row.phone || null, Number(row.value) || 0]
      );
      await pool.query("INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system','Lead importado via CSV')", [result.rows[0].id]);
      imported++;
    } catch (e) { /* skip row on error */ }
  }
  ok(res, { imported }, 201);
});

router.delete('/:id', async (req, res) => {
  try {
    const leadResult = await pool.query('SELECT id FROM leads WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
    if (!leadResult.rows[0]) return fail(res, 'Lead não encontrado.', 404);
    await pool.query('DELETE FROM messages WHERE lead_id=$1', [req.params.id]);
    await pool.query('DELETE FROM leads WHERE id=$1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    fail(res, 'Erro interno.', 500);
  }
});

router.get('/:id/messages', async (req, res) => {
  try {
    const leadResult = await pool.query('SELECT id FROM leads WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
    if (!leadResult.rows[0]) return fail(res, 'Lead não encontrado.', 404);
    const result = await pool.query('SELECT * FROM messages WHERE lead_id=$1 ORDER BY id ASC', [req.params.id]);
    ok(res, result.rows);
  } catch (err) {
    console.error(err);
    fail(res, 'Erro interno.', 500);
  }
});

router.post('/:id/messages', async (req, res) => {
  const { text } = req.body;
  try {
    const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1 AND company_id = $2', [req.params.id, req.companyId]);
    const lead = leadResult.rows[0];
    if (!lead) return fail(res, 'Lead não encontrado.', 404);
    if (!text || !text.trim()) return fail(res, 'Mensagem vazia.', 400);

    let waMessageId = null;
    // Tenta enviar pelo WhatsApp se conectado e lead tem telefone
    if (lead.phone && getStatus(req.companyId).status === 'open') {
      try {
        const waResult = await sendMessage(req.companyId, lead.phone, text.trim());
        waMessageId = waResult?.key?.id || null;
      } catch (e) {
        // WhatsApp offline — salva normalmente, sem wa_msg_id
      }
    }

    // Salvar com wa_msg_id previne duplicação quando fromMe handler receber de volta.
    // ON CONFLICT precisa replicar o WHERE do índice parcial (wa_msg_id IS NOT NULL)
    // senão PostgreSQL não consegue fazer match e lança erro quando waMessageId=null.
    const result = await pool.query(
      "INSERT INTO messages (lead_id, from_type, text, wa_msg_id) VALUES ($1, 'me', $2, $3) ON CONFLICT (wa_msg_id) WHERE wa_msg_id IS NOT NULL DO UPDATE SET text=EXCLUDED.text RETURNING *",
      [lead.id, text.trim(), waMessageId]
    );
    ok(res, result.rows[0], 201);
  } catch (err) {
    console.error(err);
    fail(res, 'Erro interno.', 500);
  }
});

module.exports = router;
