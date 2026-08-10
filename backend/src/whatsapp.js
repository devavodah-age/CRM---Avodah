const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const pool = require('./db');

const connections = new Map(); // companyId -> { socket, status, qr, qrDataUrl }

async function loadAuthState(companyId) {
  const res = await pool.query('SELECT creds, keys FROM whatsapp_sessions WHERE company_id = $1', [companyId]);
  if (!res.rows.length) return { creds: null, keys: {} };
  return { creds: res.rows[0].creds, keys: res.rows[0].keys || {} };
}

async function saveAuthState(companyId, creds, keys) {
  await pool.query(
    `INSERT INTO whatsapp_sessions (company_id, creds, keys, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (company_id) DO UPDATE SET creds=$2, keys=$3, updated_at=NOW()`,
    [companyId, JSON.stringify(creds), JSON.stringify(keys)]
  );
}

async function setStatus(companyId, status) {
  await pool.query(
    `INSERT INTO whatsapp_sessions (company_id, status, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (company_id) DO UPDATE SET status=$2, updated_at=NOW()`,
    [companyId, status]
  );
  const conn = connections.get(companyId);
  if (conn) conn.status = status;
}

function buildStateStore(companyId, initialKeys) {
  let keysStore = initialKeys || {};

  return {
    creds: null,
    keys: makeCacheableSignalKeyStore(
      {
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
          if (conn) {
            await saveAuthState(companyId, conn.creds, keysStore);
          }
        },
      },
      pino({ level: 'silent' })
    ),
    getKeysStore: () => keysStore,
  };
}

async function connectWhatsApp(companyId) {
  if (connections.has(companyId)) {
    const existing = connections.get(companyId);
    if (existing.status === 'open') return;
    try { existing.socket.end(); } catch {}
  }

  const { creds: savedCreds, keys: savedKeys } = await loadAuthState(companyId);
  const { version } = await fetchLatestBaileysVersion();
  const stateStore = buildStateStore(companyId, savedKeys);

  const conn = { socket: null, status: 'connecting', qr: null, qrDataUrl: null, creds: savedCreds };
  connections.set(companyId, conn);

  const socket = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: {
      creds: savedCreds || {},
      keys: stateStore.keys,
    },
    printQRInTerminal: false,
    browser: ['Pulso CRM', 'Chrome', '120.0'],
  });

  conn.socket = socket;

  socket.ev.on('creds.update', async (update) => {
    conn.creds = { ...(conn.creds || {}), ...update };
    await saveAuthState(companyId, conn.creds, stateStore.getKeysStore());
  });

  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      conn.qr = qr;
      conn.qrDataUrl = await QRCode.toDataURL(qr);
      conn.status = 'qr';
    }

    if (connection === 'open') {
      conn.status = 'open';
      conn.qr = null;
      conn.qrDataUrl = null;
      await setStatus(companyId, 'open');
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      conn.status = 'disconnected';
      await setStatus(companyId, 'disconnected');
      connections.delete(companyId);

      if (code !== DisconnectReason.loggedOut) {
        setTimeout(() => connectWhatsApp(companyId), 3000);
      }
    }
  });

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const phone = msg.key.remoteJid?.replace('@s.whatsapp.net', '').replace('@g.us', '');
      if (!phone) continue;
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      if (!text) continue;

      try {
        const lead = await pool.query(
          'SELECT id FROM leads WHERE company_id=$1 AND phone ILIKE $2 LIMIT 1',
          [companyId, `%${phone}%`]
        );
        if (lead.rows.length) {
          await pool.query(
            'INSERT INTO messages (lead_id, from_type, text) VALUES ($1, $2, $3)',
            [lead.rows[0].id, 'lead', text]
          );
        }
      } catch {}
    }
  });
}

async function disconnectWhatsApp(companyId) {
  const conn = connections.get(companyId);
  if (conn?.socket) {
    try { await conn.socket.logout(); } catch {}
    try { conn.socket.end(); } catch {}
  }
  connections.delete(companyId);
  await pool.query(
    `UPDATE whatsapp_sessions SET creds=NULL, keys=NULL, status='disconnected', updated_at=NOW() WHERE company_id=$1`,
    [companyId]
  );
}

async function sendMessage(companyId, phone, text) {
  const conn = connections.get(companyId);
  if (!conn || conn.status !== 'open') throw new Error('WhatsApp não conectado');
  const jid = phone.replace(/\D/g, '') + '@s.whatsapp.net';
  await conn.socket.sendMessage(jid, { text });
}

function getStatus(companyId) {
  const conn = connections.get(companyId);
  return {
    status: conn?.status || 'disconnected',
    qrDataUrl: conn?.qrDataUrl || null,
  };
}

module.exports = { connectWhatsApp, disconnectWhatsApp, sendMessage, getStatus };
