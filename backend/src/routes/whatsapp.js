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
    if (leadId) {
      await pool.query('INSERT INTO messages (lead_id, from_type, text) VALUES ($1,$2,$3)', [leadId, 'me', text]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
