const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT name, pixel_id, capi_token_set FROM companies WHERE id=$1',
      [req.companyId]
    );
    res.json(rows[0] || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.put('/', async (req, res) => {
  const { pixel_id, capi_token } = req.body;
  try {
    const updates = [];
    const values = [];
    let idx = 1;

    if (pixel_id !== undefined) {
      updates.push(`pixel_id=$${idx++}`);
      values.push(pixel_id || null);
    }
    if (capi_token !== undefined && capi_token !== '') {
      updates.push(`capi_token=$${idx++}`);
      values.push(capi_token);
      updates.push(`capi_token_set=TRUE`);
    }
    if (capi_token === '') {
      updates.push(`capi_token=NULL`);
      updates.push(`capi_token_set=FALSE`);
    }

    if (!updates.length) return res.json({});

    values.push(req.companyId);
    const { rows } = await pool.query(
      `UPDATE companies SET ${updates.join(', ')} WHERE id=$${idx} RETURNING name, pixel_id, capi_token_set`,
      values
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
