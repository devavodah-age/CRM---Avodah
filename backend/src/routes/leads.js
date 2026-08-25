const express = require('express');
const pool = require('../db');
const { triggerAutomations } = require('../automationEngine');
const { sendMessage, getStatus } = require('../whatsapp');
const { fireLeadEvent } = require('../metaPixel');

const router = express.Router();

async function attachMessages(lead) {
  const result = await pool.query('SELECT * FROM messages WHERE lead_id = $1 ORDER BY id ASC', [lead.id]);
  return { ...lead, messages: result.rows };
}

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*,
        (SELECT text FROM messages WHERE lead_id=l.id ORDER BY id DESC LIMIT 1) as last_message,
        (SELECT COUNT(*) FROM messages WHERE lead_id=l.id)::int as message_count
       FROM leads l WHERE l.company_id=$1 ORDER BY l.id DESC`,
      [req.companyId]
    );
    // Return with empty messages array so frontend doesn't break
    res.json(result.rows.map(l => ({ ...l, messages: [] })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.post('/', async (req, res) => {
  const { name, company_name, phone, value } = req.body;
  if (!name) return res.status(400).json({ error: 'O lead precisa de um nome.' });
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
    res.status(201).json(await attachMessages(lead));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.patch('/:id/stage', async (req, res) => {
  const { stage } = req.body;
  try {
    const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1 AND company_id = $2', [req.params.id, req.companyId]);
    const lead = leadResult.rows[0];
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
    if (!stage) return res.status(400).json({ error: 'Informe a nova etapa.' });

    await pool.query('UPDATE leads SET stage = $1 WHERE id = $2', [stage, lead.id]);
    triggerAutomations(req.companyId, 'stage_changed', { lead: { ...lead, stage }, stage }).catch(console.error);

    const updated = (await pool.query('SELECT * FROM leads WHERE id = $1', [lead.id])).rows[0];
    res.json({ lead: await attachMessages(updated), automationTriggered: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const leadResult = await pool.query('SELECT * FROM leads WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
    const lead = leadResult.rows[0];
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
    const { name, company_name, phone, value, tags } = req.body;
    const setClauses = [];
    const params = [];
    let idx = 1;
    if (name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(name); }
    if (company_name !== undefined) { setClauses.push(`company_name = $${idx++}`); params.push(company_name); }
    if (phone !== undefined) { setClauses.push(`phone = $${idx++}`); params.push(phone); }
    if (value !== undefined) { setClauses.push(`value = $${idx++}`); params.push(value); }
    if (tags !== undefined) { setClauses.push(`tags = $${idx++}`); params.push(tags); }
    if (setClauses.length === 0) return res.json(await attachMessages(lead));
    params.push(lead.id);
    const updated = await pool.query(
      `UPDATE leads SET ${setClauses.join(', ')} WHERE id=$${idx} RETURNING *`,
      params
    );
    res.json(await attachMessages(updated.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.post('/import', async (req, res) => {
  const { leads: leadsData } = req.body;
  if (!Array.isArray(leadsData) || leadsData.length === 0) {
    return res.status(400).json({ error: 'Nenhum lead para importar.' });
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
  res.status(201).json({ imported });
});

router.delete('/:id', async (req, res) => {
  try {
    const leadResult = await pool.query('SELECT id FROM leads WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
    if (!leadResult.rows[0]) return res.status(404).json({ error: 'Lead não encontrado.' });
    await pool.query('DELETE FROM messages WHERE lead_id=$1', [req.params.id]);
    await pool.query('DELETE FROM leads WHERE id=$1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.get('/:id/messages', async (req, res) => {
  try {
    const leadResult = await pool.query('SELECT id FROM leads WHERE id=$1 AND company_id=$2', [req.params.id, req.companyId]);
    if (!leadResult.rows[0]) return res.status(404).json({ error: 'Lead não encontrado.' });
    const result = await pool.query('SELECT * FROM messages WHERE lead_id=$1 ORDER BY id ASC', [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.post('/:id/messages', async (req, res) => {
  const { text } = req.body;
  try {
    const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1 AND company_id = $2', [req.params.id, req.companyId]);
    const lead = leadResult.rows[0];
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
    if (!text || !text.trim()) return res.status(400).json({ error: 'Mensagem vazia.' });

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
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
