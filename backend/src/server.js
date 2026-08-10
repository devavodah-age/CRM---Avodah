const express = require("express");
const cors = require("cors");
const { requireAuth } = require("./middleware/auth");

const authRoutes = require("./routes/auth");
const leadsRoutes = require("./routes/leads");
const automationsRoutes = require("./routes/automations");
const whatsappRoutes = require("./routes/whatsapp");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Pulso CRM backend rodando 🚀" });
});

app.use("/api/auth", authRoutes);
app.use("/api/leads", requireAuth, leadsRoutes);
app.use("/api/automations", requireAuth, automationsRoutes);
app.use("/api/whatsapp", requireAuth, whatsappRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Pulso CRM backend rodando em http://localhost:${PORT}`);
});
