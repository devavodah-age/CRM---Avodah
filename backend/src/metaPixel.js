const crypto = require('crypto');
const pool = require('./db');

function hash(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

async function sendCAPIEvent({ pixelId, capiToken, eventName, userData }) {
  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'system_generated',
      user_data: {
        em: userData.email   ? [hash(userData.email)]                          : undefined,
        ph: userData.phone   ? [hash(userData.phone.replace(/\D/g, ''))]       : undefined,
        fn: userData.firstName ? [hash(userData.firstName)]                    : undefined,
        ln: userData.lastName  ? [hash(userData.lastName)]                     : undefined,
      },
    }],
  };

  const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${capiToken}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[CAPI] Erro ao enviar evento:', JSON.stringify(data?.error || data));
  } else {
    console.log(`[CAPI] ${eventName} → ${data.events_received} evento(s) recebido(s)`);
  }
}

async function fireLeadEvent(companyId, lead) {
  try {
    const { rows } = await pool.query(
      'SELECT pixel_id, capi_token FROM companies WHERE id=$1',
      [companyId]
    );
    const company = rows[0];
    if (!company?.pixel_id || !company?.capi_token) return;

    const nameParts = (lead.name || '').trim().split(' ');
    await sendCAPIEvent({
      pixelId: company.pixel_id,
      capiToken: company.capi_token,
      eventName: 'Lead',
      userData: {
        phone: lead.phone || null,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
      },
    });
  } catch (e) {
    console.error('[CAPI] fireLeadEvent error:', e.message);
  }
}

module.exports = { fireLeadEvent };
