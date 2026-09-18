const crypto = require('crypto');
const pool = require('./db');
const { retryDelayMinutes } = require('./n8nPolicy');

let isProcessing = false;

async function enqueueN8nEvent(companyId, eventType, payload) {
  if (!process.env.N8N_WEBHOOK_URL) return false;
  await pool.query(
    `INSERT INTO integration_events (company_id, event_type, payload)
     VALUES ($1,$2,$3::jsonb)`,
    [companyId, eventType, JSON.stringify({ event: eventType, companyId, ...payload })]
  );
  return true;
}

async function claimEvents() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Um deploy pode interromper a entrega depois que ela foi marcada como processing.
    await client.query(`
      UPDATE integration_events
      SET status='pending', locked_at=NULL, run_at=NOW(),
          last_error='Entrega interrompida por reinício do servidor'
      WHERE status='processing' AND locked_at < NOW() - INTERVAL '2 minutes'
    `);
    await client.query(`
      DELETE FROM integration_events
      WHERE status='delivered' AND delivered_at < NOW() - INTERVAL '30 days'
    `);
    const { rows } = await client.query(`
      SELECT id, company_id, event_type, payload, attempts
      FROM integration_events
      WHERE status='pending' AND run_at <= NOW()
      ORDER BY id
      LIMIT 20
      FOR UPDATE SKIP LOCKED
    `);
    for (const event of rows) {
      await client.query(
        `UPDATE integration_events SET status='processing', locked_at=NOW() WHERE id=$1`,
        [event.id]
      );
    }
    await client.query('COMMIT');
    return rows;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function deliverEvent(event) {
  const body = JSON.stringify({ ...event.payload, deliveryId: String(event.id) });
  const headers = {
    'Content-Type': 'application/json',
    'X-Pulso-Event-Id': String(event.id),
  };
  if (process.env.N8N_WEBHOOK_SECRET) {
    headers['X-Pulso-Signature'] = `sha256=${crypto
      .createHmac('sha256', process.env.N8N_WEBHOOK_SECRET)
      .update(body)
      .digest('hex')}`;
  }

  try {
    const response = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`n8n respondeu HTTP ${response.status}`);
    await pool.query(
      `UPDATE integration_events
       SET status='delivered', delivered_at=NOW(), locked_at=NULL, last_error=NULL
       WHERE id=$1`,
      [event.id]
    );
  } catch (e) {
    const attempts = event.attempts + 1;
    const error = String(e.message || e).slice(0, 500);
    if (attempts >= 5) {
      await pool.query(
        `UPDATE integration_events
         SET status='failed', attempts=$2, locked_at=NULL, last_error=$3 WHERE id=$1`,
        [event.id, attempts, error]
      );
    } else {
      const delay = retryDelayMinutes(attempts);
      await pool.query(
        `UPDATE integration_events
         SET status='pending', attempts=$2, locked_at=NULL, last_error=$3,
             run_at=NOW() + ($4 * INTERVAL '1 minute')
         WHERE id=$1`,
        [event.id, attempts, error, delay]
      );
    }
    console.error(`[n8n] Falha ao entregar evento ${event.id}:`, error);
  }
}

async function processN8nEvents() {
  if (isProcessing || !process.env.N8N_WEBHOOK_URL) return;
  isProcessing = true;
  try {
    const events = await claimEvents();
    for (const event of events) await deliverEvent(event);
  } catch (e) {
    console.error('[n8n] Outbox error:', e.message);
  } finally {
    isProcessing = false;
  }
}

function startN8nOutboxProcessor() {
  if (!process.env.N8N_WEBHOOK_URL) {
    console.log('[n8n] N8N_WEBHOOK_URL não configurada — outbox desativada');
    return;
  }
  processN8nEvents();
  setInterval(processN8nEvents, 30000);
  console.log('[n8n] Outbox iniciada (intervalo: 30s)');
}

module.exports = { enqueueN8nEvent, processN8nEvents, startN8nOutboxProcessor };
