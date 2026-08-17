# CLAUDE.md — CRM Avodah (Pulso CRM)

## Visão Geral

CRM próprio inspirado no Kommo. Multi-tenant (isolado por `company_id`), pipeline visual Kanban, automações com flow builder, integração WhatsApp via Baileys, chat por lead.

- **Frontend**: React + Vite + Tailwind CSS → deploy Vercel (`crm-avodah.vercel.app`)
- **Backend**: Node.js + Express + PostgreSQL → deploy Railway
- **WhatsApp**: `@whiskeysockets/baileys` (sem API oficial, sessão via QR)
- **Repo**: `devavodah-age/CRM---Avodah` (conta GitHub: devavodah-age)

---

## Estrutura

```
/backend
  src/
    server.js          — Express app, CORS, rotas, auto-reconnect WA na inicialização
    db.js              — Pool PostgreSQL + CREATE TABLE IF NOT EXISTS + migrations inline
    whatsapp.js        — Baileys: connect, QR, messages.upsert, creds no PostgreSQL
    automationEngine.js — Executa ações (wait, send_whatsapp, move_stage, add_note)
    middleware/auth.js  — JWT verify, injeta req.companyId e req.userId
    routes/
      auth.js          — POST /register, POST /login
      leads.js         — CRUD leads + GET /:id/messages + POST /:id/messages
      automations.js   — CRUD automações
      whatsapp.js      — /connect, /status, /disconnect, /send

/frontend
  src/
    App.jsx            — Componente único (~49kb): auth, pipeline, contacts, automações, chat, WA
    FlowCanvas.jsx     — Flow builder visual de automações (ReactFlow)
    main.jsx           — Entry point
```

---

## Variáveis de Ambiente

### Backend (Railway)
```
DATABASE_URL=          # PostgreSQL connection string (Railway Postgres)
JWT_SECRET=            # OBRIGATÓRIO — nunca deixar sem setar (fallback hardcoded = vulnerabilidade)
PORT=3001              # Railway seta automaticamente
N8N_WEBHOOK_URL=       # Opcional — webhook para eventos de leads/mensagens
```

### Frontend (Vercel)
```
VITE_API_URL=          # Ex: https://crm-avodah-backend.railway.app/api
```

---

## Banco de Dados

Schema criado automaticamente em `db.js` via `initDb()` no startup. Tabelas:

| Tabela | Descrição |
|--------|-----------|
| `companies` | Tenant raiz |
| `users` | Usuários por empresa |
| `leads` | Leads com stage, phone, value |
| `messages` | Histórico por lead (`from_type`: me/lead/system), `wa_msg_id` para dedup |
| `automations` | Config de automações com `actions JSONB` e `flow_nodes/flow_edges JSONB` |
| `whatsapp_sessions` | Creds + keys Baileys em JSONB por `company_id` |

---

## Bugs Conhecidos e Status

### CRÍTICOS (causa principal do WA parar após restart)

**[BUG-01] `restoreBuffers()` não reconstrói `Uint8Array` serializado como `{0:x,1:y,...}`**
- Arquivo: `backend/src/whatsapp.js` função `restoreBuffers()`
- Causa: JSONB do PostgreSQL não preserva `Uint8Array` — serializa como objeto numérico puro
- Efeito: Creds do Baileys corrompem na reconexão → `badSession` → limpa auth → precisa QR de novo
- Fix: Adicionar detecção de objeto com chaves exclusivamente numéricas → `new Uint8Array(Object.values(obj))`

**[BUG-02] Mensagens com `@lid` JID não batem com phone real do lead**
- Arquivo: `backend/src/whatsapp.js` handler `messages.upsert`
- Causa: WhatsApp usa `@lid` (ID opaco) em vez de `@s.whatsapp.net` para alguns contatos
- Efeito: `phone ILIKE '%123@lid%'` não bate → cria lead duplicado com phone errado
- Fix: Strip `@lid` → resolver via `contacts.upsert` antes, ou normalizar o JID antes do lookup

**[BUG-03] Endpoint `GET /leads/:id/messages` não existe no backend**
- Arquivo: `backend/src/routes/leads.js`
- Causa: Frontend faz polling desse endpoint a cada 5s mas ele nunca foi implementado
- Efeito: Chat não atualiza com novas mensagens recebidas
- Fix: Adicionar `router.get('/:id/messages', ...)` retornando `SELECT * FROM messages WHERE lead_id=$1`

### ALTOS

**[BUG-04] `fromMe` sem dedup no banco — duplica mensagens no restart**
- Arquivo: `backend/src/whatsapp.js` handler `fromMe` (~linha 215)
- Fix: INSERT com `ON CONFLICT (wa_msg_id) DO NOTHING` — usar mesmo padrão do handler incoming

**[BUG-05] Mídia (imagem/áudio/vídeo/sticker) silenciosamente descartada**
- Arquivo: `backend/src/whatsapp.js` (~linha 260)
- Fix: Checar `msg.message?.imageMessage`, `audioMessage`, etc. e salvar `[Imagem]`, `[Áudio]`

**[BUG-06] `automationEngine.js` usa `setTimeout` bloqueante para `wait`**
- Causa: Sem job queue — se Railway matar o processo, a automação em espera se perde
- Fix: Migrar para BullMQ ou tabela `automation_jobs` com cron que processa por timestamp

**[BUG-07] Sem backoff no loop de reconexão do WhatsApp**
- Arquivo: `backend/src/whatsapp.js` handler `connection === 'close'`
- Fix: `delay = Math.min(60000, attempt * 8000)` com counter persistido

### MÉDIOS / SEGURANÇA

**[SEC-01] `cors()` sem restrição de origem** → restringir para domínio Vercel  
**[SEC-02] JWT em `localStorage`** → XSS rouba token; migrar para cookie httpOnly  
**[SEC-03] Sem rate limit em `/auth/login`** → brute force possível; adicionar express-rate-limit  
**[SEC-04] JWT_SECRET com fallback hardcoded** → obrigar env var no startup  
**[SEC-05] `SELECT * FROM leads` sem LIMIT** → adicionar paginação

---

## Fluxo WhatsApp (como funciona)

```
1. Frontend POST /api/whatsapp/connect
2. backend/whatsapp.js: connectWhatsApp(companyId)
   → loadAuthState() busca creds/keys do PostgreSQL
   → makeWASocket() com creds salvas ou frescas
   → Se sem creds: gera QR → salva qrDataUrl em memória
   → Frontend polling GET /api/whatsapp/status a cada 3s pega o QR
3. Usuário escaneia QR
4. connection.update → 'open' → setStatus('open') no DB
5. messages.upsert → match por phone → INSERT em messages
6. creds.update → saveAuthState() persiste no PostgreSQL
7. Restart Railway: server.js setTimeout(3s) → auto-reconnect com creds do DB
```

**Estado em memória**: `connections: Map<companyId, {socket, status, qr, creds}>`  
Essa Map é **resetada a cada restart** — por isso `saveAuthState` no DB é crítico.

---

## Automações — Tipos de Trigger e Action

**Triggers:**
- `new_lead` — quando lead é criado (manual ou via WA)
- `stage_changed` — quando lead muda de etapa (+ `trigger_config.stage` opcional)
- `message_received` — quando lead manda mensagem

**Actions (JSONB array):**
```json
[
  { "type": "wait", "minutes": 30 },
  { "type": "send_whatsapp", "message": "Oi {nome}, tudo bem?" },
  { "type": "move_stage", "stage": "Proposta Enviada" },
  { "type": "add_note", "note": "Follow-up feito" }
]
```

**Variáveis de template**: `{nome}`, `{empresa}`, `{telefone}`

---

## Deploy

**Backend (Railway):**
- Start: `node src/server.js` (via `nixpacks.toml`)
- DB auto-provisioned pelo Railway PostgreSQL
- Reinicia automaticamente — auto-reconnect WA no startup (3s delay)

**Frontend (Vercel):**
- Build: `npm run build` no `/frontend`
- Root dir: `frontend`
- VITE_API_URL deve apontar para URL do Railway

---

## Comandos Úteis

```bash
# Dev local backend (precisa de DATABASE_URL e JWT_SECRET no .env)
cd backend && node src/server.js

# Dev local frontend
cd frontend && npm run dev

# Checar sintaxe backend
node --check backend/src/server.js
node --check backend/src/whatsapp.js

# Audit de segurança
cd backend && npm audit
cd frontend && npm audit
```

---

## Contexto de Desenvolvimento

- Projeto da agência **devavodah-age**
- Inspirado no Kommo CRM
- WhatsApp é o canal principal — bugs de recebimento de mensagem são prioridade máxima
- Railway reinicia containers com frequência — toda lógica crítica deve ser stateless ou persistida no PostgreSQL
- `App.jsx` está monolítico (~49kb) — refatoração em componentes é débito técnico conhecido
