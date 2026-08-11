// Polyfill Web Crypto API for Node.js < 18
if (!globalThis.crypto) { const { webcrypto } = require("crypto"); globalThis.crypto = webcrypto; }

const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, initAuthCreds } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const pool = require('./db');

process.on('uncaughtException', (err) => {
  console.error('[WA] uncaughtException:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[WA] unhandledRejection:', reason?.message || reason);
});

// Restore Buffer/Uint8Array objects from PostgreSQL JSONB (returns plain objects)
function restoreBuffers(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(restoreBuffers);
  if (obj.type === 'Buffer' && Array.isArray(obj.data)) return Buffer.from(obj.data);
  const result = {};
  for (const key of Object.keys(obj)) result[key] = restoreBuffers(obj[key]);
  return result;
}

const connections = new Map();

async function loadAuthState(companyId) {
  try {
    const res = await pool.query('SELECT creds, keys FROM whatsapp_sessions WHERE company_id = $1', [companyId]);
    if (!res.rows.length) return { creds: null, keys: {} };
    // Restore Buffer objects lost during JSONB serialization
    const creds = res.rows[0].creds ? restoreBuffers(res.rows[0].creds) : null;
    const keys = restoreBuffers(res.rows[0].keys || {});
    return { creds, keys };
  } catch (e) { console.error('[WA] loadAuthState error:', e.message); return { creds: null, keys: {} }; }
}

async function clearAuthState(companyId) {
  try {
    await pool.query(`DELETE FROM whatsapp_sessions WHERE company_id=$1`, [companyId]);
  } catch {}
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
        // Restore Buffers that may have been deserialized as plain objects from DB
        result[id] = val !== undefined ? restoreBuffers(JSON.parse(JSON.stringify(val))) : undefined;
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
  if (existing?.socket) {
    try { existing.socket.end(undefined); } catch {}
  }

  const { creds: savedCreds, keys: savedKeys } = await loadAuthState(companyId);
  const freshCreds = savedCreds || initAuthCreds();
  console.log('[WA] Auth state loaded, hasSavedCreds:', !!savedCreds);

  let version;
  try {
    const v = await fetchLatestBaileysVersion();
    version = v.version;
    console.log('[WA] Baileys version:', version);
  } catch (e) {
    console.error('[WA] fetchLatestBaileysVersion failed:', e.message);
    version = [2, 3000, 1015901307];
  }

  const conn = { socket: null, status: 'connecting', qr: null, qrDataUrl: null, creds: freshCreds };
  connections.set(companyId, conn);

  const logger = pino({ level: 'silent' });
  const keysStore = buildKeysStore(companyId, savedKeys);

  try {
    const socket = makeWASocket({
      version,
      logger,
      auth: {
        creds: freshCreds,
        keys: makeCacheableSignalKeyStore(keysStore, logger),
      },
      printQRInTerminal: false,
      browser: ['Chrome (Linux)', 'Chrome', '124.0.6367.82'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 2000,
    });

    conn.socket = socket;
    try { socket.ws.on('error', (e) => console.error('[WA] ws error:', e.message)); } catch {}

    socket.ev.on('creds.update', async (update) => {
      conn.creds = { ...(conn.creds || {}), ...update };
      await saveAuthState(companyId, conn.creds, keysStore.getStore());
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log('[WA] connection.update:', JSON.stringify({ connection, hasQR: !!qr, errMsg: lastDisconnect?.error?.message }));

      if (qr) {
        try {
          conn.qr = qr;
          conn.qrDataUrl = await QRCode.toDataURL(qr);
          conn.status = 'qr';
          console.log('[WA] QR code generated OK');
        } catch (e) { console.error('[WA] QR generation error:', e.message); }
      }

      if (connection === 'open') {
        conn.status = 'open';
        conn.qr = null;
        conn.qrDataUrl = null;
        await setStatus(companyId, 'open');
        console.log('[WA] Connected successfully!');
      }

      if (connection === 'close') {
        const boom = new Boom(lastDisconnect?.error);
        const code = boom?.output?.statusCode;
        const reason = Object.entries(DisconnectReason).find(([, v]) => v === code)?.[0] || 'unknown';
        console.log('[WA] Connection closed, code:', code, 'reason:', reason, 'err:', lastDisconnect?.error?.message);
        conn.status = 'disconnected';
        await setStatus(companyId, 'disconnected');
        connections.delete(companyId);

        if (code === DisconnectReason.badSession || code === 500) {
          console.log('[WA] Bad session — clearing auth state, user must reconnect manually');
          await clearAuthState(companyId);
          return;
        }

        if (code === DisconnectReason.restartRequired || code === 515) {
          // Stream restart needed (happens after QR scan) — reconnect immediately with saved creds
          console.log('[WA] Restart required — reconnecting in 1s');
          setTimeout(() => connectWhatsApp(companyId).catch((e) => console.error('[WA] reconnect error:', e.message)), 1000);
          return;
        }

        if (code !== DisconnectReason.loggedOut && code !== 401) {
          const delay = 8000;
          console.log('[WA] Will retry in', delay, 'ms');
          setTimeout(() => connectWhatsApp(companyId).catch((e) => console.error('[WA] reconnect error:', e.message)), delay);
        }
      }
    });

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const remoteJid = msg.key.remoteJid || '';
        if (remoteJid.endsWith('@g.us')) continue; // ignore groups
        const phone = remoteJid.replace(/@[^@]+$/, ''); // strip @s.whatsapp.net, @lid, etc.
        if (!phone) continue;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        if (!text) continue;
        try {
          let leadResult = await pool.query(
            'SELECT id FROM leads WHERE company_id=$1 AND phone ILIKE $2 LIMIT 1',
            [companyId, `%${phone}%`]
          );
          let leadId;
          if (leadResult.rows.length) {
            leadId = leadResult.rows[0].id;
          } else {
            // Auto-create lead for unknown number
            const name = msg.pushName || phone;
            const newLead = await pool.query(
              "INSERT INTO leads (company_id, name, phone, stage) VALUES ($1,$2,$3,'novo') RETURNING id",
              [companyId, name, phone]
            );
            leadId = newLead.rows[0].id;
            await pool.query(
              "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
              [leadId, `Lead criado automaticamente via WhatsApp`]
            );
            console.log('[WA] Auto-created lead for', phone);
          }
          await pool.query(
            "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'lead',$2)",
            [leadId, text]
          );
        } catch (e) { console.error('[WA] message handler error:', e.message); }
      }
    });

  } catch (e) {
    console.error('[WA] makeWASocket error:', e.message, e.stack);
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
