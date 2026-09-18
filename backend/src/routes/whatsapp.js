const express = require('express');
const { connectWhatsApp, disconnectWhatsApp, sendMessage, getStatus, getDiagnostics, fixLeadPhones } = require('../whatsapp');
const pool = require('../db');

const router = express.Router();

router.post('/connect', async (req, res) => {
  const companyId = req.companyId;
  try {
    connectWhatsApp(companyId).catch(console.error);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', async (req, res) => {
  const companyId = req.companyId;
  res.json(getStatus(companyId));
});

// Diagnóstico persistente das últimas conexões e quedas (sem expor credenciais).
router.get('/diagnostics', async (req, res) => {
  try {
    res.json(await getDiagnostics(req.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/disconnect', async (req, res) => {
  const companyId = req.companyId;
  try {
    await disconnectWhatsApp(companyId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/send', async (req, res) => {
  const companyId = req.companyId;
  const { phone, text, leadId } = req.body;
  if (!phone || !text) return res.status(400).json({ error: 'phone e text obrigatorios' });
  try {
    await sendMessage(companyId, phone, text);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /fix-phones — corrige leads com LID como telefone usando o mapa em memória
router.post('/fix-phones', async (req, res) => {
  try {
    const fixed = await fixLeadPhones(req.companyId);
    res.json({ ok: true, fixed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retorna todos os leads com telefone suspeito (LID) para o frontend mostrar
router.get('/suspicious-phones', async (req, res) => {
  try {
    // Números suspeitos: muito longos (>13 dígitos) ou começam com padrões de LID
    // Números brasileiros reais: 12-13 dígitos com DDI 55
    const { rows } = await pool.query(`
      SELECT id, name, phone FROM leads
      WHERE company_id = $1
        AND phone IS NOT NULL
        AND (
          LENGTH(REGEXP_REPLACE(phone, '[^0-9]', '', 'g')) > 13
          OR LENGTH(REGEXP_REPLACE(phone, '[^0-9]', '', 'g')) < 8
          OR (
            LENGTH(REGEXP_REPLACE(phone, '[^0-9]', '', 'g')) BETWEEN 12 AND 15
            AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') NOT LIKE '55%'
            AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') NOT LIKE '1%'
          )
        )
      ORDER BY id DESC
    `, [req.companyId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/contacts', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, jid, lid, phone, name, imported_lead_id, first_seen_at, last_seen_at
       FROM whatsapp_contacts WHERE company_id=$1 ORDER BY last_seen_at DESC LIMIT 2000`,
      [req.companyId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/contacts/import', async (req, res) => {
  const ids = Array.isArray(req.body.contactIds) ? req.body.contactIds : [];
  if (!ids.length || ids.length > 500) return res.status(400).json({ error: 'Selecione entre 1 e 500 contatos.' });
  const client = await pool.connect();
  let imported = 0;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM whatsapp_contacts WHERE company_id=$1 AND id=ANY($2::bigint[]) AND phone IS NOT NULL`,
      [req.companyId, ids]
    );
    for (const contact of rows) {
      const existing = await client.query(
        `SELECT id FROM leads WHERE company_id=$1 AND REGEXP_REPLACE(phone,'[^0-9]','','g')=REGEXP_REPLACE($2,'[^0-9]','','g') LIMIT 1`,
        [req.companyId, contact.phone]
      );
      let leadId = existing.rows[0]?.id;
      if (!leadId) {
        const lead = await client.query(
          `INSERT INTO leads (company_id,name,phone,stage) VALUES ($1,$2,$3,'novo') RETURNING id`,
          [req.companyId, contact.name || contact.phone, contact.phone]
        );
        leadId = lead.rows[0].id;
        await client.query(`INSERT INTO messages (lead_id,from_type,text) VALUES ($1,'system','Contato importado do WhatsApp')`, [leadId]);
        imported++;
      }
      await client.query('UPDATE whatsapp_contacts SET imported_lead_id=$1 WHERE id=$2', [leadId, contact.id]);
    }
    await client.query('COMMIT');
    res.status(201).json({ ok: true, imported });
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); res.status(500).json({ error: err.message }); }
  finally { client.release(); }
});

module.exports = router;
