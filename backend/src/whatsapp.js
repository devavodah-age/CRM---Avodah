// Polyfill Web Crypto API for Node.js < 18
if (!globalThis.crypto) { const { webcrypto } = require("crypto"); globalThis.crypto = webcrypto; }

const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, initAuthCreds } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const pool = require('./db');
const { triggerAutomations } = require('./automationEngine');
const { fireLeadEvent } = require('./metaPixel');

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

// Normaliza phone para só dígitos
function normalizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/\D/g, '') || null;
}

// Retorna variantes do número para busca (com/sem DDI 55)
function phoneVariants(phone) {
  const d = normalizePhone(phone);
  if (!d) return [];
  const set = new Set([d]);
  if (d.startsWith('55') && d.length >= 12) set.add(d.slice(2)); // sem DDI
  if (!d.startsWith('55') && d.length >= 8)  set.add('55' + d); // com DDI
  return [...set];
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

  const conn = { socket: null, status: 'connecting', qr: null, qrDataUrl: null, creds: freshCreds, lidToPhone: new Map() };
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
      // Necessário para Baileys reprocessar mensagens com retry sem Bad MAC
      getMessage: async (key) => {
        try {
          const res = await pool.query('SELECT text FROM messages WHERE wa_msg_id=$1 LIMIT 1', [key?.id]);
          if (res.rows[0]) return { conversation: res.rows[0].text };
        } catch {}
        return { conversation: undefined };
      },
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
          const attempt = (conn._reconnectAttempt || 0) + 1;
          const delay = Math.min(8000 * Math.pow(2, attempt - 1), 120000); // 8s, 16s, 32s... max 2min
          console.log('[WA] Will retry in', delay, 'ms (attempt', attempt, ')');
          setTimeout(() => {
            const c = connections.get(companyId) || {};
            c._reconnectAttempt = attempt;
            connections.set(companyId, c);
            connectWhatsApp(companyId).catch((e) => console.error('[WA] reconnect error:', e.message));
          }, delay);
        }
      }
    });

    const processedMsgIds = new Set();
    // Extrai o número LID de um campo contact.lid (pode ser string, objeto ou null)
    function extractLid(lid) {
      if (!lid) return null;
      if (typeof lid === 'string') return lid.replace(/@[^@]+$/, ''); // remove @lid sufixo
      if (typeof lid === 'object' && lid.user) return String(lid.user);
      return null;
    }

    // Processa um contato do evento contacts.upsert/update:
    // mapeia LID -> telefone real e atualiza leads com telefone errado no banco
    async function resolveContact(contact) {
      if (!contact.id || !contact.id.endsWith('@s.whatsapp.net')) return;
      const realPhone = contact.id.replace('@s.whatsapp.net', '');
      if (!realPhone || realPhone.length < 8) return;
      const lid = extractLid(contact.lid);
      if (!lid) return;
      // Armazena no mapa em memória
      conn.lidToPhone.set(lid, realPhone);
      conn.lidToPhone.set(lid.replace(/\D/g, ''), realPhone);
      console.log(`[WA] LID mapeado: ${lid} → ${realPhone}`);
      // Atualiza leads que estão com o número errado (LID como telefone)
      try {
        const { rowCount } = await pool.query(
          `UPDATE leads SET phone=$1 WHERE company_id=$2
           AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $3`,
          [realPhone, companyId, lid.replace(/\D/g, '')]
        );
        if (rowCount > 0) console.log(`[WA] ${rowCount} lead(s) corrigidos: LID ${lid} → ${realPhone}`);
      } catch (e) { console.error('[WA] resolveContact update error:', e.message); }
    }

    socket.ev.on('contacts.upsert', async (contacts) => {
      for (const contact of contacts) {
        await resolveContact(contact).catch(e => console.error('[WA] contacts.upsert error:', e.message));
      }
    });

    socket.ev.on('contacts.update', async (updates) => {
      for (const update of updates) {
        await resolveContact(update).catch(e => console.error('[WA] contacts.update error:', e.message));
      }
    });

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const msg of messages) {
        // Capture messages sent from phone to existing leads
        // fromMe messages arrive as type='append' (sent from another device like phone)
        if (msg.key.fromMe) {
          try {
            const remoteJid = msg.key.remoteJid || '';
            // Aceita apenas JIDs de contato individual real
            if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@c.us')) continue;
            // Remove :deviceId (ex: "5511999:2@s.whatsapp.net" → "5511999")
            const rawPhone = remoteJid.replace(/@[^@]+$/, '').split(':')[0];
            // Resolve LID → telefone real via mapa em memória
            const phone = conn.lidToPhone.get(rawPhone) || conn.lidToPhone.get(rawPhone.replace(/\D/g, '')) || rawPhone;
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
            const variants = phoneVariants(phone);
            if (!variants.length) continue;
            const placeholders = variants.map((_, i) => `REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $${i + 2}`).join(' OR ');
            const leadResult = await pool.query(
              `SELECT id FROM leads WHERE company_id=$1 AND (${placeholders}) LIMIT 1`,
              [companyId, ...variants]
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
        // Recupera mensagens recentes perdidas durante redeploy (type='append')
        if (type === 'append' && !msg.key.fromMe) {
          const msgTime = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : 0;
          if (Date.now() - msgTime > 10 * 60 * 1000) continue; // ignora histórico antigo
          // cai através e processa como notify
        } else if (type !== 'notify') {
          continue;
        }
        const msgId = msg.key.id;
        // In-memory dedup for same session
        if (msgId && processedMsgIds.has(msgId)) continue;
        if (msgId) processedMsgIds.add(msgId);
        const remoteJid = msg.key.remoteJid || '';
        // Aceita apenas JIDs de contato individual (@s.whatsapp.net ou @c.us)
        if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@c.us')) continue;
        // Remove :deviceId (ex: "5511999:2@s.whatsapp.net" → "5511999")
        const rawPhone = remoteJid.replace(/@[^@]+$/, '').split(':')[0];
        // Resolve LID → telefone real via mapa em memória
        const phone = conn.lidToPhone.get(rawPhone) || conn.lidToPhone.get(rawPhone.replace(/\D/g, '')) || rawPhone;
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
          const variants = phoneVariants(phone);
          if (!variants.length) continue;
          const placeholders = variants.map((_, i) => `REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $${i + 2}`).join(' OR ');
          let leadId; let isNewLead = false;
          // Advisory lock por (company_id, phone) para evitar criação de leads duplicados
          const lockKey = BigInt(companyId) * BigInt(1000000) + BigInt(parseInt(normalizePhone(phone)?.slice(-6) || '0', 10));
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey.toString()]);

            let leadResult = await client.query(
              `SELECT id, name FROM leads WHERE company_id=$1 AND (${placeholders}) LIMIT 1`,
              [companyId, ...variants]
            );

            if (!leadResult.rows.length) {
              const name = msg.pushName || phone;
              const newLead = await client.query(
                "INSERT INTO leads (company_id, name, phone, stage) VALUES ($1,$2,$3,'novo') RETURNING id, name",
                [companyId, name, phone]
              );
              leadId = newLead.rows[0].id;
              isNewLead = true;
              await client.query(
                "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
                [leadId, 'Lead criado automaticamente via WhatsApp']
              );
              console.log('[WA] Auto-created lead for', phone);
              fireLeadEvent(companyId, { name: msg.pushName || phone, phone }).catch(console.error);
              // n8n webhook: new lead
              if (process.env.N8N_WEBHOOK_URL) {
                fetch(process.env.N8N_WEBHOOK_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ event: 'new_lead', leadId, name: newLead.rows[0].name, phone, companyId }),
                }).catch(() => {});
              }
            } else {
              leadId = leadResult.rows[0].id;
            }
            await client.query('COMMIT');
          } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            throw e;
          } finally {
            client.release();
          }
          await pool.query(
            "INSERT INTO messages (lead_id, from_type, text, wa_msg_id) VALUES ($1,'lead',$2,$3) ON CONFLICT (wa_msg_id) DO NOTHING",
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
  const jid = phone.includes('@') ? phone : normalizePhone(phone) + '@s.whatsapp.net';
  const result = await conn.socket.sendMessage(jid, { text });
  return result; // { key: { id, fromMe, remoteJid }, ... }
}

function getStatus(companyId) {
  const conn = connections.get(companyId);
  return { status: conn?.status || 'disconnected', qrDataUrl: conn?.qrDataUrl || null };
}

module.exports = { connectWhatsApp, disconnectWhatsApp, sendMessage, getStatus };