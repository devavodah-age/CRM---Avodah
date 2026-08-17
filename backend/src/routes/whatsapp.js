const express = require('express');
const { connectWhatsApp, disconnectWhatsApp, sendMessage, getStatus } = require('../whatsapp');
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

module.exports = router;
