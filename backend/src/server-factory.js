const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("./middleware/auth");

const authRoutes = require("./routes/auth");
const leadsRoutes = require("./routes/leads");
const automationsRoutes = require("./routes/automations");
const whatsappRoutes = require("./routes/whatsapp");
const settingsRoutes = require("./routes/settings");
const templatesRoutes = require("./routes/templates");
const companiesRoutes = require("./routes/companies");

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) return callback(null, true);
    callback(new Error('CORS bloqueado: origem não permitida'));
  },
  credentials: true,
}));

app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Pulso CRM backend rodando" });
});

app.use("/api/auth",        authLimiter, authRoutes);
app.use("/api/leads",       apiLimiter, requireAuth, leadsRoutes);
app.use("/api/automations", apiLimiter, requireAuth, automationsRoutes);
app.use("/api/whatsapp",    apiLimiter, requireAuth, whatsappRoutes);
app.use("/api/settings",    apiLimiter, requireAuth, settingsRoutes);
app.use("/api/templates",   apiLimiter, requireAuth, templatesRoutes);
app.use("/api/companies",   apiLimiter, requireAuth, companiesRoutes);

module.exports = app;
