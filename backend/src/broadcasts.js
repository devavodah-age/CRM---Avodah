const pool = require('./db');
const { sendMessage, getStatus } = require('./whatsapp');

let processing = false;

function renderMessage(template, lead) {
  const firstName = (lead.name || '').trim().split(/\s+/)[0] || '';
  return String(template || '')
    .replace(/\{nome\}/gi, firstName)
    .replace(/\{empresa\}/gi, lead.company_name || '')
    .replace(/\{telefone\}/gi, lead.phone || '');
}

async function processBroadcasts() {
  if (processing) return;
  processing = true;
  try {
    // Recupera uma entrega interrompida por restart/deploy.
    await pool.query(`
      UPDATE broadcast_recipients r SET status='pending', error='Entrega recuperada após reinício'
      FROM broadcasts b
      WHERE r.broadcast_id=b.id AND b.status='running' AND r.status='sending'
        AND r.created_at < NOW() - INTERVAL '10 minutes'
    `);
    const { rows: campaigns } = await pool.query(
      `SELECT * FROM broadcasts WHERE status='running' ORDER BY id LIMIT 3`
    );
    for (const campaign of campaigns) {
      if (getStatus(campaign.company_id).status !== 'open') continue;
      const client = await pool.connect();
      let recipient;
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `SELECT r.* FROM broadcast_recipients r
           WHERE r.broadcast_id=$1 AND r.status='pending'
           ORDER BY r.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [campaign.id]
        );
        recipient = result.rows[0];
        if (recipient) {
          await client.query(
            `UPDATE broadcast_recipients SET status='sending', error=NULL WHERE id=$1`,
            [recipient.id]
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }

      if (!recipient) {
        await pool.query(
          `UPDATE broadcasts SET status='completed', completed_at=NOW()
           WHERE id=$1 AND status='running'`, [campaign.id]
        );
        continue;
      }

      try {
        const result = await sendMessage(campaign.company_id, recipient.phone, recipient.rendered_message);
        await pool.query(
          `UPDATE broadcast_recipients SET status='sent', wa_msg_id=$2, sent_at=NOW()
           WHERE id=$1`, [recipient.id, result?.key?.id || null]
        );
        await pool.query(
          `INSERT INTO messages (lead_id, from_type, text, wa_msg_id)
           VALUES ($1,'me',$2,$3)
           ON CONFLICT (wa_msg_id) WHERE wa_msg_id IS NOT NULL DO NOTHING`,
          [recipient.lead_id, recipient.rendered_message, result?.key?.id || null]
        );
      } catch (error) {
        await pool.query(
          `UPDATE broadcast_recipients SET status='failed', error=$2 WHERE id=$1`,
          [recipient.id, String(error.message || error).slice(0, 500)]
        );
      }
      await pool.query(`
        UPDATE broadcasts b SET
          sent_count=(SELECT COUNT(*) FROM broadcast_recipients WHERE broadcast_id=b.id AND status='sent'),
          failed_count=(SELECT COUNT(*) FROM broadcast_recipients WHERE broadcast_id=b.id AND status='failed')
        WHERE b.id=$1`, [campaign.id]
      );
      await new Promise(resolve => setTimeout(resolve, Math.max(3000, campaign.interval_seconds * 1000)));
    }
  } catch (error) {
    console.error('[Broadcasts] processor error:', error.message);
  } finally { processing = false; }
}

function startBroadcastProcessor() {
  processBroadcasts().catch(() => {});
  setInterval(processBroadcasts, 1000);
  console.log('[Broadcasts] processor iniciado');
}

module.exports = { renderMessage, processBroadcasts, startBroadcastProcessor };
