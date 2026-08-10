// routes/automations.js
const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/automations -> lista as automações da empresa logada
router.get("/", (req, res) => {
  const automations = db
    .prepare("SELECT * FROM automations WHERE company_id = ? ORDER BY id ASC")
    .all(req.companyId);
  res.json(automations);
});

// POST /api/automations -> cria uma nova regra
router.post("/", (req, res) => {
  const { name, trigger_stage, action_text } = req.body;
  if (!name || !trigger_stage || !action_text) {
    return res.status(400).json({ error: "Preencha nome, etapa gatilho e ação." });
  }
  const insert = db.prepare(
    "INSERT INTO automations (company_id, name, trigger_stage, action_text, enabled) VALUES (?, ?, ?, ?, 1)"
  );
  const result = insert.run(req.companyId, name, trigger_stage, action_text);
  const automation = db.prepare("SELECT * FROM automations WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(automation);
});

// PATCH /api/automations/:id -> liga/desliga uma automação
router.patch("/:id", (req, res) => {
  const automation = db
    .prepare("SELECT * FROM automations WHERE id = ? AND company_id = ?")
    .get(req.params.id, req.companyId);
  if (!automation) return res.status(404).json({ error: "Automação não encontrada." });

  const enabled = req.body.enabled !== undefined ? (req.body.enabled ? 1 : 0) : automation.enabled ? 0 : 1;
  db.prepare("UPDATE automations SET enabled = ? WHERE id = ?").run(enabled, automation.id);
  res.json({ ...automation, enabled });
});

// DELETE /api/automations/:id
router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM automations WHERE id = ? AND company_id = ?").run(req.params.id, req.companyId);
  res.status(204).send();
});

module.exports = router;
