// Polyfill Web Crypto API for Node.js < 18
if (!globalThis.crypto) { const { webcrypto } = require("crypto"); globalThis.crypto = webcrypto; }

const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, initAuthCreds } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const pool = require('./db');
const { triggerAutomations } = require('./automationEngine');

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
  // Node.js Buffer serialized as { type: 'Buffer', data: [...] }
  if (obj.type === 'Buffer' && Array.isArray(obj.data)) return Buffer.from(obj.data);
  // Uint8Array serialized as plain numeric-keyed object { '0': x, '1': y, ... }
  const keys = Object.keys(obj);
  if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
    return Buffer.from(keys.sort((a, b) => Number(a) - Number(b)).map(k => obj[k]));
  }
  const result = {};
  for (const key of keys) result[key] = restoreBuffers(obj[key]);
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

    const processedMsgIds = new Set();
    // When WhatsApp syncs contacts, resolve @lid -> real phone number in leads
    socket.ev.on('contacts.upsert', async (contacts) => {
      for (const contact of contacts) {
        try {
          // contact.id = @s.whatsapp.net (real phone), contact.lid = @lid (opaque ID)
          if (contact.id && contact.id.endsWith('@s.whatsapp.net') && contact.lid) {
            const realPhone = contact.id.replace('@s.whatsapp.net', '');
            const lidId = typeof contact.lid === 'string'
              ? contact.lid.replace(/@[^@]+$/, '')
              : String(contact.lid);
            // Update leads that have the @lid ID as phone
            await pool.query(
              'UPDATE leads SET phone=$1 WHERE company_id=$2 AND (phone=$3 OR phone=$4)',
              [realPhone, companyId, lidId, contact.lid]
            );
          }
        } catch (e) { console.error('[WA] contacts.upsert update error:', e.message); }
      }
    });

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const msg of messages) {
        // Capture messages sent from phone to existing leads
        // fromMe messages arrive as type='append' (sent from another device like phone)
        if (msg.key.fromMe) {
          try {
            const remoteJid = msg.key.remoteJid || '';
            if (remoteJid.endsWith('@g.us')) continue;
            if (remoteJid.endsWith('@lid')) continue; // @lid sem phone real, ignorar
            const phone = remoteJid.replace(/@[^@]+$/, '');
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            if (!text) continue;
            const msgId = msg.key.id;
            // DB-level dedup: evita duplicar mensagens no restart do servidor
            if (msgId) {
              const dup = await pool.query('SELECT id FROM messages WHERE wa_msg_id=$1 LIMIT 1', [msgId]);
              if (dup.rows.length) continue;
            }
            if (msgId && processedMsgIds.has(msgId)) continue;
            if (msgId) processedMsgIds.add(msgId);
            const leadResult = await pool.query(
              'SELECT id FROM leads WHERE company_id=$1 AND phone ILIKE $2 LIMIT 1',
              [companyId, `%${phone}%`]
            );
            if (leadResult.rows.length) {
              await pool.query(
                "INSERT INTO messages (lead_id, from_type, text, wa_msg_id) VALUES ($1,'me',$2,$3) ON CONFLICT (wa_msg_id) DO NOTHING",
                [leadResult.rows[0].id, text, msgId || null]
              );
            }
          } catch (e) { console.error('[WA] fromMe handler error:', e.message); }
          continue;
        }
        // Only process incoming messages when type='notify'
        if (type !== 'notify') continue;
        const msgId = msg.key.id;
        // In-memory dedup for same session
        if (msgId && processedMsgIds.has(msgId)) continue;
        if (msgId) processedMsgIds.add(msgId);
        const remoteJid = msg.key.remoteJid || '';
        if (remoteJid.endsWith('@g.us')) continue; // ignore groups
        if (remoteJid.endsWith('@lid')) continue; // @lid sem phone real resolvido ainda
        const phone = remoteJid.replace('@s.whatsapp.net', '');
        if (!phone) continue;
        // Extrair texto ou label de mídia
        const text = msg.message?.conversation
          || msg.message?.extendedTextMessage?.text
          || (msg.message?.imageMessage ? '[Imagem]' : null)
          || (msg.message?.audioMessage ? '[Áudio]' : null)
          || (msg.message?.videoMessage ? '[Vídeo]' : null)
          || (msg.message?.documentMessage ? `[Documento: ${msg.message.documentMessage.fileName || 'arquivo'}]` : null)
          || (msg.message?.stickerMessage ? '[Sticker]' : null)
          || '';
        if (!text) continue;
        try {
          // DB-level dedup: skip if this wa_msg_id was already saved
          if (msgId) {
            const dup = await pool.query('SELECT id FROM messages WHERE wa_msg_id=$1 LIMIT 1', [msgId]);
            if (dup.rows.length) continue;
          }
          let leadResult = await pool.query(
            'SELECT id, name FROM leads WHERE company_id=$1 AND phone ILIKE $2 LIMIT 1',
            [companyId, `%${phone}%`]
          );
          let leadId; let isNewLead = false;
          if (leadResult.rows.length) {
            leadId = leadResult.rows[0].id;
          } else {
            // Auto-create lead for unknown number
            const name = msg.pushName || phone;
            const newLead = await pool.query(
              "INSERT INTO leads (company_id, name, phone, stage) VALUES ($1,$2,$3,'novo') RETURNING id, name",
              [companyId, name, phone]
            );
            leadId = newLead.rows[0].id;
            isNewLead = true;
            await pool.query(
              "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
              [leadId, `Lead criado automaticamente via WhatsApp`]
            );
            console.log('[WA] Auto-created lead for', phone);
            // n8n webhook: new lead
            if (process.env.N8N_WEBHOOK_URL) {
              fetch(process.env.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: 'new_lead', leadId, name: newLead.rows[0].name, phone, companyId }),
              }).catch(() => {});
            }
          }
          await pool.query(
            "INSERT INTO messages (lead_id, from_type, text, wa_msg_id) VALUES ($1,'lead',$2,$3)",
            [leadId, text, msgId || null]
          );
          // n8n webhook: message received
          if (process.env.N8N_WEBHOOK_URL) {
            fetch(process.env.N8N_WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: 'message_received', leadId, phone, message: text, companyId }),
            }).catch(() => {});
          }
          // Trigger message_received automations
          triggerAutomations(companyId, 'message_received', { lead: { id: leadId, phone }, message: text }).catch(console.error);
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
  const jid = phone.includes('@') ? phone : phone.replace(/\D/g, '') + '@s.whatsapp.net';
  await conn.socket.sendMessage(jid, { text });
}

function getStatus(companyId) {
  const conn = connections.get(companyId);
  return { status: conn?.status || 'disconnected', qrDataUrl: conn?.qrDataUrl || null };
}

module.exports = { connectWhatsApp, disconnectWhatsApp, sendMessage, getStatus };