const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const pool = require('./db');

process.on('uncaughtException', (err) => {
  console.error('[WA] uncaughtException:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[WA] unhandledRejection:', reason?.message || reason);
});

const connections = new Map();

async function loadAuthState(companyId) {
  try {
    const res = await pool.query('SELECT creds, keys FROM whatsapp_sessions WHERE company_id = $1', [companyId]);
    if (!res.rows.length) return { creds: null, keys: {} };
    return { creds: res.rows[0].creds, keys: res.rows[0].keys || {} };
  } catch (e) { console.error('[WA] loadAuthState error:', e.message); return { creds: null, keys: {} }; }
}

async function saveAuthState(companyId, creds, keys) {
  try {
    await pool.query(
      `INSERT INTO whatsapp_sessions (company_id, creds, keys, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (company_id) DO UPDATE SET creds=$2, keys=$3, updated_at=NOW()`,
      [companyId, JSON.stringify(creds), JSON.stringify(keys)]
    );
  } catch (e) { console.error('[WA] saveAuthState error:', e.message); }
}

async function setStatus(companyId, status) {
  try {
    await pool.query(
      `INSERT INTO whatsapp_sessions (company_id, status, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (company_id) DO UPDATE SET status=$2, updated_at=NOW()`,
      [companyId, status]
    );
  } catch {}
  const conn = connections.get(companyId);
  if (conn) conn.status = status;
}

function buildKeysStore(companyId, initialKeys) {
  let keysStore = initialKeys || {};
  return {
    get: async (type, ids) => {
      const result = {};
      for (const id of ids) {
        const val = keysStore[`${type}-${id}`];
        result[id] = val ? JSON.parse(JSON.stringify(val)) : undefined;
      }
      return result;
    },
    set: async (data) => {
      for (const category in data) {
        for (const id in data[category]) {
          keysStore[`${category}-${id}`] = data[category][id];
        }
      }
      const conn = connections.get(companyId);
      if (conn) await saveAuthState(companyId, conn.creds, keysStore);
    },
    getStore: () => keysStore,
  };
}

async function connectWhatsApp(companyId) {
  console.log('[WA] connectWhatsApp called for company:', companyId);

  const existing = connections.get(companyId);
  if (existing && (existing.status === 'open' || existing.status === 'connecting')) {
    console.log('[WA] Already connecting/connected, skipping');
    return;
  }
  if (existing && existing.socket) {
    try { existing.socket.end(undefined); } catch {}
  }

  const { creds: savedCreds, keys: savedKeys } = await loadAuthState(companyId);
  console.log('[WA] Auth state loaded, hasCreds:', !!savedCreds);

  let version;
  try {
    const v = await fetchLatestBaileysVersion();
    version = v.version;
    console.log('[WA] Baileys version:', version);
  } catch (e) {
    console.error('[WA] fetchLatestBaileysVersion failed:', e.message);
    version = [2, 3000, 1015901307];
  }

  const conn = { socket: null, status: 'connecting', qr: null, qrDataUrl: null, creds: savedCreds };
  connections.set(companyId, conn);

  const logger = pino({ level: 'silent' });
  const keysStore = buildKeysStore(companyId, savedKeys);

  try {
    const socket = makeWASocket({
      version,
      logger,
      auth: {
        creds: savedCreds || {},
        keys: makeCacheableSignalKeyStore(keysStore, logger),
      },
      printQRInTerminal: false,
      browser: ['Pulso CRM', 'Chrome', '120.0'],
      connectTimeoutMs: 60000,
    });

    conn.socket = socket;
    try { socket.ws.on('error', (e) => console.error('[WA] ws error:', e.message)); } catch {}

    socket.ev.on('creds.update', async (update) => {
      conn.creds = { ...(conn.creds || {}), ...update };
      await saveAuthState(companyId, conn.creds, keysStore.getStore());
    });

    socket.ev.on('connection.update', async (update) => {
      console.log('[WA] connection.update:', JSON.stringify({ connection: update.connection, hasQR: !!update.qr }));
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          conn.qr = qr;
          conn.qrDataUrl = await QRCode.toDataURL(qr);
          conn.status = 'qr';
          console.log('[WA] QR code generated');
        } catch (e) { console.error('[WA] QR error:', e.message); }
      }

      if (connection === 'open') {
        conn.status = 'open';
        conn.qr = null;
        conn.qrDataUrl = null;
        await setStatus(companyId, 'open');
        console.log('[WA] Connected!');
      }

      if (connection === 'close') {
        const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
        console.log('[WA] Connection closed, code:', code);
        conn.status = 'disconnected';
        await setStatus(companyId, 'disconnected');
        connections.delete(companyId);
        if (code !== DisconnectReason.loggedOut && code !== 401) {
          setTimeout(() => connectWhatsApp(companyId).catch((e) => console.error('[WA] reconnect error:', e.message)), 5000);
        }
      }
    });

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const phone = (msg.key.remoteJid || '').replace('@s.whatsapp.net', '').replace('@g.us', '');
        if (!phone) continue;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        if (!text) continue;
        try {
          const lead = await pool.query('SELECT id FROM leads WHERE company_id=$1 AND phone ILIKE $2 LIMIT 1', [companyId, `%${phone}%`]);
          if (lead.rows.length) {
            await pool.query('INSERT INTO messages (lead_id, from_type, text) VALUES ($1,$2,$3)', [lead.rows[0].id, 'lead', text]);
          }
        } catch {}
      }
    });

  } catch (e) {
    console.error('[WA] makeWASocket error:', e.message);
    connections.delete(companyId);
  }
}

async function disconnectWhatsApp(companyId) {
  const conn = connections.get(companyId);
  if (conn?.socket) {
    try { await conn.socket.logout(); } catch {}
    try { conn.socket.end(undefined); } catch {}
  }
  connections.delete(companyId);
  try {
    await pool.query(`UPDATE whatsapp_sessions SET creds=NULL, keys=NULL, status='disconnected', updated_at=NOW() WHERE company_id=$1`, [companyId]);
  } catch {}
}

async function sendMessage(companyId, phone, text) {
  const conn = connections.get(companyId);
  if (!conn || conn.status !== 'open') throw new Error('WhatsApp não conectado');
  const jid = phone.replace(/\D/g, '') + '@s.whatsapp.net';
  await conn.socket.sendMessage(jid, { text });
}

function getStatus(companyId) {
  const conn = connections.get(companyId);
  return { status: conn?.status || 'disconnected', qrDataUrl: conn?.qrDataUrl || null };
}

module.exports = { connectWhatsApp, disconnectWhatsApp, sendMessage, getStatus };
