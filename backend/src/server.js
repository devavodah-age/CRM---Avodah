// server.js
// Esse é o arquivo que "liga" o servidor. Ele junta todas as rotas
// (auth, leads, automations) e coloca o servidor pra escutar requisições.

const express = require("express");
const cors = require("cors");
const { requireAuth } = require("./middleware/auth");

const authRoutes = require("./routes/auth");
const leadsRoutes = require("./routes/leads");
const automationsRoutes = require("./routes/automations");

const app = express();
app.use(cors());
app.use(express.json());

// Rota simples pra confirmar que o servidor está de pé
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Pulso CRM backend rodando 🚀" });
});

// Rotas públicas (não precisam de login)
app.use("/api/auth", authRoutes);

// Rotas protegidas (precisam de token de login)
app.use("/api/leads", requireAuth, leadsRoutes);
app.use("/api/automations", requireAuth, automationsRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Pulso CRM backend rodando em http://localhost:${PORT}`);
});
