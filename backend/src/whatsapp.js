// Polyfill Web Crypto API for Node.js < 18
if (!globalThis.crypto) { const { webcrypto } = require("crypto"); globalThis.crypto = webcrypto; }

const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  initAuthCreds,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const pool = require('./db');
const { triggerAutomations } = require('./automationEngine');
const { fireLeadEvent } = require('./metaPixel');
const { sanitizeErrorMessage, reconnectDelay } = require('./whatsappConnectionPolicy');
const { enqueueN8nEvent } = require('./n8nOutbox');
const { extractMessageText } = require('./whatsappMessage');

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

// Verifica se parece um telefone real (E.164 max 15 dígitos).
// LIDs do WhatsApp têm 16+ dígitos — não são telefones.
function isRealPhone(phone) {
  const d = normalizePhone(phone);
  return !!d && d.length >= 8 && d.length <= 15;
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
const reconnectStates = new Map();
const authSaveQueues = new Map();
const LOCK_NAMESPACE = 917204;
let connectionLockClientPromise = null;

function cancelReconnect(companyId) {
  const state = reconnectStates.get(companyId);
  if (state?.timer) clearTimeout(state.timer);
  reconnectStates.delete(companyId);
}

function scheduleReconnect(companyId, { delay, attempt, source }) {
  const previous = reconnectStates.get(companyId);
  if (previous?.timer) clearTimeout(previous.timer);
  const state = { attempt, source, timer: null };
  state.timer = setTimeout(() => {
    // Um logout manual ou uma tentativa mais nova invalida este callback.
    if (reconnectStates.get(companyId) !== state) return;
    state.timer = null;
    connectWhatsApp(companyId).catch((e) => console.error('[WA] reconnect error:', e.message));
  }, delay);
  reconnectStates.set(companyId, state);
}

async function recordConnectionEvent(companyId, event, details = {}) {
  const message = sanitizeErrorMessage(details.message);
  try {
    await pool.query(
      `INSERT INTO whatsapp_connection_events
         (company_id, event, status_code, reason, message, reconnect_attempt)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [companyId, event, details.code || null, details.reason || null, message, details.attempt || null]
    );
    // Evita crescimento ilimitado: conserva os 100 eventos mais recentes da empresa.
    await pool.query(
      `DELETE FROM whatsapp_connection_events
       WHERE company_id=$1 AND id NOT IN (
         SELECT id FROM whatsapp_connection_events
         WHERE company_id=$1 ORDER BY created_at DESC LIMIT 100
       )`,
      [companyId]
    );
  } catch (e) {
    console.error('[WA] recordConnectionEvent error:', e.message);
  }
}

async function getConnectionLockClient() {
  if (!connectionLockClientPromise) {
    connectionLockClientPromise = pool.connect().then((client) => {
      client.on('error', (e) => {
        console.error('[WA] advisory lock connection error:', e.message);
        connectionLockClientPromise = null;
      });
      return client;
    }).catch((e) => {
      connectionLockClientPromise = null;
      throw e;
    });
  }
  return connectionLockClientPromise;
}

async function acquireConnectionLock(companyId) {
  // Uma única conexão PostgreSQL pode manter as travas de todas as empresas.
  // Assim não consumimos uma conexão do pool por número de WhatsApp conectado.
  const client = await getConnectionLockClient();
  const { rows } = await client.query(
    'SELECT pg_try_advisory_lock($1, $2) AS acquired',
    [LOCK_NAMESPACE, companyId]
  );
  return rows[0]?.acquired ? client : null;
}

async function releaseConnectionLock(conn) {
  if (!conn?.lockClient) return;
  const client = conn.lockClient;
  conn.lockClient = null;
  try { await client.query('SELECT pg_advisory_unlock($1, $2)', [LOCK_NAMESPACE, conn.companyId]); } catch {}
}

async function loadAuthState(companyId) {
  try {
    const res = await pool.query('SELECT creds, keys, lid_map FROM whatsapp_sessions WHERE company_id = $1', [companyId]);
    if (!res.rows.length) return { creds: null, keys: {}, lidMap: {} };
    const creds = res.rows[0].creds ? restoreBuffers(res.rows[0].creds) : null;
    const keys = restoreBuffers(res.rows[0].keys || {});
    const lidMap = res.rows[0].lid_map || {};
    return { creds, keys, lidMap };
  } catch (e) { console.error('[WA] loadAuthState error:', e.message); return { creds: null, keys: {}, lidMap: {} }; }
}

async function clearAuthState(companyId) {
  try {
    await pool.query(`DELETE FROM whatsapp_sessions WHERE company_id=$1`, [companyId]);
  } catch {}
}

async function saveAuthState(companyId, creds, keys) {
  // Baileys pode emitir várias atualizações de chaves simultaneamente. A fila evita
  // que uma escrita antiga termine por último e sobrescreva o estado mais novo.
  const previous = authSaveQueues.get(companyId) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => pool.query(
    `INSERT INTO whatsapp_sessions (company_id, creds, keys, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (company_id) DO UPDATE SET creds=$2, keys=$3, updated_at=NOW()`,
    [companyId, JSON.stringify(creds), JSON.stringify(keys)]
  )).catch((e) => console.error('[WA] saveAuthState error:', e.message));
  authSaveQueues.set(companyId, next);
  await next;
  if (authSaveQueues.get(companyId) === next) authSaveQueues.delete(companyId);
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
    await releaseConnectionLock(existing);
  }

  const lockClient = await acquireConnectionLock(companyId);
  if (!lockClient) {
    console.log('[WA] Another server instance owns company connection:', companyId);
    await recordConnectionEvent(companyId, 'lock_skipped', { message: 'Outra instância já mantém esta sessão' });
    const attempt = (reconnectStates.get(companyId)?.attempt || 0) + 1;
    // Essencial em deploy rolling: a instância antiga ainda pode segurar o lock
    // por alguns segundos enquanto a nova já iniciou.
    scheduleReconnect(companyId, { delay: 10000, attempt, source: 'lock_busy' });
    return;
  }

  const { creds: savedCreds, keys: savedKeys, lidMap: savedLidMap } = await loadAuthState(companyId);
  const freshCreds = savedCreds || initAuthCreds();
  console.log('[WA] Auth state loaded, hasSavedCreds:', !!savedCreds, 'lidMap entries:', Object.keys(savedLidMap).length);

  let version;
  try {
    const v = await fetchLatestBaileysVersion();
    version = v.version;
    console.log('[WA] Baileys version:', version);
  } catch (e) {
    console.error('[WA] fetchLatestBaileysVersion failed:', e.message);
    version = [2, 3000, 1015901307];
  }

  // Restore persisted LID→phone map from DB (survives Railway restarts)
  const conn = { companyId, lockClient, socket: null, status: 'connecting', qr: null, qrDataUrl: null, creds: freshCreds, lidToPhone: new Map(Object.entries(savedLidMap)) };
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
        cancelReconnect(companyId);
        await pool.query(
          `INSERT INTO whatsapp_sessions (company_id, status, last_connected_at, updated_at)
           VALUES ($1, 'open', NOW(), NOW())
           ON CONFLICT (company_id) DO UPDATE SET status='open', last_connected_at=NOW(), updated_at=NOW()`,
          [companyId]
        );
        await recordConnectionEvent(companyId, 'connected');
        console.log('[WA] Connected successfully!');
      }

      if (connection === 'close') {
        // Ignora o fechamento atrasado de um socket que já foi substituído.
        if (connections.get(companyId) !== conn) return;
        const boom = new Boom(lastDisconnect?.error);
        const code = boom?.output?.statusCode;
        const reason = Object.entries(DisconnectReason).find(([, v]) => v === code)?.[0] || 'unknown';
        const errorMessage = sanitizeErrorMessage(lastDisconnect?.error?.message);
        console.log('[WA] Connection closed, code:', code, 'reason:', reason, 'err:', errorMessage);
        conn.status = 'disconnected';
        await pool.query(
          `UPDATE whatsapp_sessions SET status='disconnected', last_disconnect_code=$2,
             last_disconnect_reason=$3, last_disconnect_message=$4,
             last_disconnected_at=NOW(), updated_at=NOW() WHERE company_id=$1`,
          [companyId, code || null, reason, errorMessage]
        ).catch(() => {});
        await recordConnectionEvent(companyId, 'disconnected', { code, reason, message: errorMessage });
        connections.delete(companyId);
        await releaseConnectionLock(conn);

        if (code === DisconnectReason.badSession || code === 500) {
          console.log('[WA] Bad session — clearing auth state, user must reconnect manually');
          await clearAuthState(companyId);
          return;
        }

        if (code === DisconnectReason.restartRequired || code === 515) {
          // Stream restart needed (happens after QR scan) — reconnect immediately with saved creds
          console.log('[WA] Restart required — reconnecting in 1s');
          scheduleReconnect(companyId, { delay: 1000, attempt: 0, source: 'restart_required' });
          return;
        }

        if (code !== DisconnectReason.loggedOut && code !== 401) {
          const attempt = (reconnectStates.get(companyId)?.attempt || 0) + 1;
          const delay = reconnectDelay(attempt);
          console.log('[WA] Will retry in', delay, 'ms (attempt', attempt, ')');
          await recordConnectionEvent(companyId, 'reconnect_scheduled', { code, reason, attempt, message: `Nova tentativa em ${delay}ms` });
          scheduleReconnect(companyId, { delay, attempt, source: reason });
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

    async function persistIncomingMessage({ phone, text, msgId, pushName }) {
      const variants = phoneVariants(phone);
      if (!variants.length) throw new Error('Telefone inválido na mensagem recebida');
      const placeholders = variants
        .map((_, i) => `REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $${i + 2}`)
        .join(' OR ');
      const lockKey = BigInt(companyId) * BigInt(1000000)
        + BigInt(parseInt(normalizePhone(phone)?.slice(-6) || '0', 10));
      const client = await pool.connect();
      let leadId;
      let newLeadForEvents = null;
      let inserted = false;
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey.toString()]);

        const duplicate = msgId
          ? await client.query('SELECT lead_id FROM messages WHERE wa_msg_id=$1 LIMIT 1', [msgId])
          : { rows: [] };
        if (duplicate.rows.length) {
          await client.query('COMMIT');
          return { inserted: false, leadId: duplicate.rows[0].lead_id };
        }

        const leadResult = await client.query(
          `SELECT id, name FROM leads WHERE company_id=$1 AND (${placeholders}) LIMIT 1`,
          [companyId, ...variants]
        );
        if (!leadResult.rows.length) {
          const name = pushName || phone;
          const newLead = await client.query(
            "INSERT INTO leads (company_id, name, phone, stage) VALUES ($1,$2,$3,'novo') RETURNING id, name",
            [companyId, name, phone]
          );
          leadId = newLead.rows[0].id;
          newLeadForEvents = { id: leadId, name: newLead.rows[0].name, phone };
          await client.query(
            "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
            [leadId, 'Lead criado automaticamente via WhatsApp']
          );
        } else {
          leadId = leadResult.rows[0].id;
        }

        const saved = await client.query(
          `INSERT INTO messages (lead_id, from_type, text, wa_msg_id)
           VALUES ($1,'lead',$2,$3)
           ON CONFLICT (wa_msg_id) WHERE wa_msg_id IS NOT NULL DO NOTHING
           RETURNING id`,
          [leadId, text, msgId || null]
        );
        inserted = saved.rowCount > 0;
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }

      if (!inserted) return { inserted: false, leadId };
      if (newLeadForEvents) {
        console.log('[WA] Auto-created lead for', phone);
        fireLeadEvent(companyId, newLeadForEvents).catch(console.error);
        triggerAutomations(companyId, 'new_lead', { lead: newLeadForEvents }).catch(console.error);
        enqueueN8nEvent(companyId, 'new_lead', {
          leadId, name: newLeadForEvents.name, phone, source: 'whatsapp',
        }).catch(console.error);
      }
      enqueueN8nEvent(companyId, 'message_received', {
        leadId, phone, message: text,
      }).catch(console.error);
      triggerAutomations(companyId, 'message_received', {
        lead: { id: leadId, phone }, message: text,
      }).catch(console.error);
      return { inserted: true, leadId };
    }

    async function replayPendingMessages(lid, phone) {
      const lidDigits = String(lid).replace(/\D/g, '');
      const { rows } = await pool.query(
        `SELECT id, wa_msg_id, push_name, text
         FROM whatsapp_pending_messages
         WHERE company_id=$1 AND lid=$2 ORDER BY id`,
        [companyId, lidDigits]
      );
      for (const pending of rows) {
        try {
          await persistIncomingMessage({
            phone, text: pending.text, msgId: pending.wa_msg_id, pushName: pending.push_name,
          });
          await pool.query('DELETE FROM whatsapp_pending_messages WHERE id=$1', [pending.id]);
          if (pending.wa_msg_id) processedMsgIds.add(pending.wa_msg_id);
        } catch (error) {
          console.error('[WA] pending message replay error:', error.message);
          break;
        }
      }
    }

    // Processa um contato do evento contacts.upsert/update:
    // mapeia LID -> telefone real, persiste no DB, e corrige leads com LID errado
    async function resolveContact(contact) {
      if (!contact.id) return;
      let realPhone, lid;

      if (contact.id.endsWith('@s.whatsapp.net')) {
        // Formato normal: id = telefone, lid = identificador LID
        realPhone = contact.id.replace('@s.whatsapp.net', '');
        lid = extractLid(contact.lid);
      } else if (contact.id.endsWith('@lid') && contact.phone) {
        // Formato inverso: id = LID, phone = telefone real (alguns clientes Baileys)
        lid = contact.id.replace('@lid', '');
        realPhone = normalizePhone(contact.phone);
      } else {
        return;
      }

      if (!realPhone || realPhone.length < 8 || realPhone.length > 15) return;
      if (!lid) return;

      const lidDigits = lid.replace(/\D/g, '');
      conn.lidToPhone.set(lid, realPhone);
      conn.lidToPhone.set(lidDigits, realPhone);
      console.log(`[WA] LID mapeado: ${lid} → ${realPhone}`);

      // Persiste no banco para sobreviver a restarts
      try {
        await pool.query(
          `INSERT INTO whatsapp_sessions (company_id, lid_map, updated_at) VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (company_id) DO UPDATE
             SET lid_map = COALESCE(whatsapp_sessions.lid_map, '{}'::jsonb) || $2::jsonb,
                 updated_at = NOW()`,
          [companyId, JSON.stringify({ [lid]: realPhone, [lidDigits]: realPhone })]
        );
      } catch (e) { console.error('[WA] resolveContact persist error:', e.message); }

      await replayPendingMessages(lidDigits, realPhone);

      // Corrige leads que têm o LID como telefone (criados antes do fix)
      try {
        const { rowCount } = await pool.query(
          `UPDATE leads SET phone=$1 WHERE company_id=$2
           AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $3`,
          [realPhone, companyId, lidDigits]
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

    // Baileys emite este evento quando o WhatsApp compartilha a relação entre
    // o identificador opaco @lid e o número real @s.whatsapp.net.
    socket.ev.on('chats.phoneNumberShare', async ({ lid, jid }) => {
      await resolveContact({ id: jid, lid }).catch(e =>
        console.error('[WA] chats.phoneNumberShare error:', e.message)
      );
    });

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const msg of messages) {
        // Capture messages sent from phone to existing leads
        // fromMe messages arrive as type='append' (sent from another device like phone)
        if (msg.key.fromMe) {
          try {
            const remoteJid = msg.key.remoteJid || '';
            // Aceita contatos individuais: @s.whatsapp.net, @c.us e @lid (LID-based)
            if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@c.us') && !remoteJid.endsWith('@lid')) continue;
            // Remove :deviceId (ex: "5511999:2@s.whatsapp.net" → "5511999")
            const rawPhone = remoteJid.replace(/@[^@]+$/, '').split(':')[0];
            const resolvedFromMe = conn.lidToPhone.get(rawPhone) || conn.lidToPhone.get(rawPhone.replace(/\D/g, ''));
            // @lid JID DEVE ser resolvido; @s.whatsapp.net aceita telefone real direto
            const phone = resolvedFromMe || (remoteJid.endsWith('@lid') ? null : (isRealPhone(rawPhone) ? rawPhone : null));
            const text = extractMessageText(msg.message);
            if (!text) continue;
            const msgId = msg.key.id;
            // DB-level dedup: evita duplicar mensagens no restart do servidor
            if (msgId) {
              const dup = await pool.query('SELECT id FROM messages WHERE wa_msg_id=$1 LIMIT 1', [msgId]);
              if (dup.rows.length) continue;
            }
            if (msgId && processedMsgIds.has(msgId)) continue;
            const variants = phoneVariants(phone);
            if (!variants.length) continue;
            const placeholders = variants.map((_, i) => `REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $${i + 2}`).join(' OR ');
            const leadResult = await pool.query(
              `SELECT id FROM leads WHERE company_id=$1 AND (${placeholders}) LIMIT 1`,
              [companyId, ...variants]
            );
            if (leadResult.rows.length) {
              const saved = await pool.query(
                `INSERT INTO messages (lead_id, from_type, text, wa_msg_id)
                 VALUES ($1,'me',$2,$3)
                 ON CONFLICT (wa_msg_id) WHERE wa_msg_id IS NOT NULL DO NOTHING
                 RETURNING id`,
                [leadResult.rows[0].id, text, msgId || null]
              );
              if (saved.rowCount > 0 && msgId) processedMsgIds.add(msgId);
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
        const remoteJid = msg.key.remoteJid || '';
        // Aceita contatos individuais: @s.whatsapp.net, @c.us e @lid (LID-based)
        if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@c.us') && !remoteJid.endsWith('@lid')) continue;
        // Remove :deviceId (ex: "5511999:2@s.whatsapp.net" → "5511999")
        const rawPhone = remoteJid.replace(/@[^@]+$/, '').split(':')[0];
        // Nas mensagens LID, a versão atual do Baileys fornece o número real
        // diretamente em senderPn/participantPn. Persiste o mapa antes do lookup.
        const phoneJidFromKey = msg.key.senderPn || msg.key.participantPn || '';
        const phoneFromKey = phoneJidFromKey.replace(/@[^@]+$/, '').split(':')[0];
        const lidJidFromKey = msg.key.senderLid || msg.key.participantLid || '';
        const lidFromKey = lidJidFromKey.replace(/@[^@]+$/, '').split(':')[0];

        // A primeira mensagem costuma chegar pelo telefone e informar o LID em
        // senderLid. Salvar esse caminho inverso é o que permite reconhecer as
        // mensagens seguintes, que podem chegar apenas como @lid e sem senderPn.
        if (!remoteJid.endsWith('@lid') && isRealPhone(rawPhone) && lidFromKey) {
          await resolveContact({ id: `${normalizePhone(rawPhone)}@s.whatsapp.net`, lid: lidFromKey });
        }
        if (remoteJid.endsWith('@lid') && isRealPhone(phoneFromKey)) {
          await resolveContact({ id: `${normalizePhone(phoneFromKey)}@s.whatsapp.net`, lid: rawPhone });
        }
        const resolved = conn.lidToPhone.get(rawPhone) || conn.lidToPhone.get(rawPhone.replace(/\D/g, ''));
        const phone = resolved
          || (isRealPhone(phoneFromKey) ? normalizePhone(phoneFromKey) : null)
          || (remoteJid.endsWith('@lid') ? null : (isRealPhone(rawPhone) ? rawPhone : null));
        // Normaliza wrappers (efêmera, view-once, editada) antes de extrair.
        const text = extractMessageText(msg.message);
        if (!text) continue;
        if (!phone) {
          if (msgId && remoteJid.endsWith('@lid')) {
            await pool.query(
              `INSERT INTO whatsapp_pending_messages
                 (company_id, wa_msg_id, lid, push_name, text)
               VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (company_id, wa_msg_id) DO NOTHING`,
              [companyId, msgId, rawPhone.replace(/\D/g, ''), msg.pushName || null, text]
            );
            processedMsgIds.add(msgId);
          }
          console.log('[WA] LID não resolvido; mensagem guardada até receber o telefone:', rawPhone);
          continue;
        }
        try {
          await persistIncomingMessage({ phone, text, msgId, pushName: msg.pushName });
          if (msgId) processedMsgIds.add(msgId);
        } catch (e) { console.error('[WA] message handler error:', e.message); }
      }
    });

    // Se o servidor reiniciou depois de guardar uma mensagem pendente, o mapa
    // LID→telefone já pode ter vindo da sessão persistida e nenhum novo evento
    // de contato será emitido. Reprocessa essas filas também na conexão.
    const replayedLids = new Set();
    for (const [lid, phone] of conn.lidToPhone) {
      const lidDigits = String(lid).replace(/\D/g, '');
      if (!lidDigits || replayedLids.has(lidDigits)) continue;
      replayedLids.add(lidDigits);
      await replayPendingMessages(lidDigits, phone);
    }

  } catch (e) {
    console.error('[WA] makeWASocket error:', e.message, e.stack);
    if (connections.get(companyId) === conn) connections.delete(companyId);
    await recordConnectionEvent(companyId, 'connection_error', { message: e.message });
    await releaseConnectionLock(conn);
  }
}

async function disconnectWhatsApp(companyId) {
  const conn = connections.get(companyId);
  cancelReconnect(companyId);
  if (conn?.socket) {
    try { await conn.socket.logout(); } catch {}
    try { conn.socket.end(undefined); } catch {}
  }
  connections.delete(companyId);
  await releaseConnectionLock(conn);
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

async function getDiagnostics(companyId) {
  const [session, events] = await Promise.all([
    pool.query(
      `SELECT status, last_disconnect_code, last_disconnect_reason, last_disconnect_message,
              last_connected_at, last_disconnected_at, updated_at
       FROM whatsapp_sessions WHERE company_id=$1`,
      [companyId]
    ),
    pool.query(
      `SELECT event, status_code, reason, message, reconnect_attempt, created_at
       FROM whatsapp_connection_events WHERE company_id=$1
       ORDER BY created_at DESC LIMIT 20`,
      [companyId]
    ),
  ]);
  return { session: session.rows[0] || null, events: events.rows };
}

// Corrige manualmente todos os leads da empresa que têm LID como telefone,
// usando o mapa em memória (populado pelo contacts.upsert). Retorna o total de leads corrigidos.
async function fixLeadPhones(companyId) {
  const conn = connections.get(companyId);
  if (!conn || conn.lidToPhone.size === 0) return 0;
  let fixed = 0;
  for (const [lid, phone] of conn.lidToPhone) {
    try {
      const { rowCount } = await pool.query(
        `UPDATE leads SET phone=$1 WHERE company_id=$2
         AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $3`,
        [phone, companyId, lid.replace(/\D/g, '')]
      );
      fixed += rowCount;
    } catch {}
  }
  if (fixed > 0) console.log(`[WA] fixLeadPhones: ${fixed} lead(s) corrigidos para empresa ${companyId}`);
  return fixed;
}

module.exports = { connectWhatsApp, disconnectWhatsApp, sendMessage, getStatus, getDiagnostics, fixLeadPhones };
