// routes/leads.js
// Todas as rotas aqui exigem login (veja requireAuth no server.js) e só
// mexem nos dados da empresa (company_id) de quem está logado.

const express = require("express");
const db = require("../db");

const router = express.Router();

// Mesmos textos automáticos que já existiam no protótipo do front-end.
const AUTO_MESSAGES = {
  novo: (first) => `Olá ${first}! Obrigado pelo contato, sou da equipe comercial 🙌`,
  proposta: (first) => `Oi ${first}, tudo bem? Só confirmando se a proposta chegou certinho 📄`,
  negociacao: (first) => `${first}, vamos fechar? Fico à disposição para qualquer dúvida!`,
};

function attachMessages(lead) {
  const messages = db
    .prepare("SELECT * FROM messages WHERE lead_id = ? ORDER BY id ASC")
    .all(lead.id);
  return { ...lead, messages };
}

// GET /api/leads -> lista todos os leads da empresa logada
router.get("/", (req, res) => {
  const leads = db
    .prepare("SELECT * FROM leads WHERE company_id = ? ORDER BY id DESC")
    .all(req.companyId)
    .map(attachMessages);
  res.json(leads);
});

// POST /api/leads -> cria um novo lead (sempre começa na etapa "novo")
router.post("/", (req, res) => {
  const { name, company_name, phone, value } = req.body;
  if (!name) return res.status(400).json({ error: "O lead precisa de um nome." });

  const insert = db.prepare(
    "INSERT INTO leads (company_id, name, company_name, phone, value, stage) VALUES (?, ?, ?, ?, ?, 'novo')"
  );
  const result = insert.run(req.companyId, name, company_name || null, phone || null, value || 0);

  db.prepare("INSERT INTO messages (lead_id, from_type, text) VALUES (?, 'system', ?)").run(
    result.lastInsertRowid,
    "Lead criado manualmente"
  );

  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(attachMessages(lead));
});

// PATCH /api/leads/:id/stage -> move o lead pra outra etapa do funil
// e dispara a automação correspondente, se existir e estiver ligada.
router.patch("/:id/stage", (req, res) => {
  const { stage } = req.body;
  const lead = db
    .prepare("SELECT * FROM leads WHERE id = ? AND company_id = ?")
    .get(req.params.id, req.companyId);

  if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
  if (!stage) return res.status(400).json({ error: "Informe a nova etapa." });

  db.prepare("UPDATE leads SET stage = ? WHERE id = ?").run(stage, lead.id);

  const automation = db
    .prepare("SELECT * FROM automations WHERE company_id = ? AND trigger_stage = ? AND enabled = 1")
    .get(req.companyId, stage);

  if (automation) {
    db.prepare("INSERT INTO messages (lead_id, from_type, text) VALUES (?, 'system', ?)").run(
      lead.id,
      `🤖 Automação "${automation.name}" disparada`
    );
    const template = AUTO_MESSAGES[stage];
    if (template) {
      const first = lead.name.split(" ")[0];
      db.prepare("INSERT INTO messages (lead_id, from_type, text) VALUES (?, 'me', ?)").run(
        lead.id,
        template(first)
      );
    }
  }

  const updated = db.prepare("SELECT * FROM leads WHERE id = ?").get(lead.id);
  res.json({ lead: attachMessages(updated), automationTriggered: automation ? automation.name : null });
});

// POST /api/leads/:id/messages -> registra uma mensagem enviada ("me")
// Hoje só grava no banco. Quando a integração com o WhatsApp de verdade
// estiver pronta, é AQUI que vamos chamar a API da Meta pra enviar de fato.
router.post("/:id/messages", (req, res) => {
  const { text } = req.body;
  const lead = db
    .prepare("SELECT * FROM leads WHERE id = ? AND company_id = ?")
    .get(req.params.id, req.companyId);

  if (!lead) return res.status(404).json({ error: "Lead não encontrado." });
  if (!text || !text.trim()) return res.status(400).json({ error: "Mensagem vazia." });

  const result = db
    .prepare("INSERT INTO messages (lead_id, from_type, text) VALUES (?, 'me', ?)")
    .run(lead.id, text.trim());

  const message = db.prepare("SELECT * FROM messages WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(message);
});

module.exports = router;
