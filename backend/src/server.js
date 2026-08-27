const app = require('./server-factory');
const { connectWhatsApp, sendMessage } = require("./whatsapp");
const { setWhatsAppSender, startJobProcessor } = require("./automationEngine");
const pool = require("./db");

// Wire up WhatsApp sender so automations can send real messages
setWhatsAppSender(sendMessage);

// Start automation job processor (polls DB every 30s, survives Railway restarts)
startJobProcessor();

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`Pulso CRM backend rodando em http://localhost:${PORT}`);

  // Auto-reconnect WhatsApp sessions that have credentials saved.
  // Query by creds IS NOT NULL (not status='open') because Railway SIGTERM
  // may trigger connection.update(close) and set status='disconnected' before
  // the new server starts — so we must reconnect regardless of last status.
  // Intentionally logged-out sessions have creds=NULL and are excluded.
  setTimeout(async () => {
    try {
      const { rows } = await pool.query(
        "SELECT company_id FROM whatsapp_sessions WHERE creds IS NOT NULL"
      );
      if (rows.length === 0) {
        console.log("[WA] No active sessions to reconnect");
        return;
      }
      for (const { company_id } of rows) {
        console.log("[WA] Auto-reconnecting company:", company_id);
        connectWhatsApp(company_id).catch((e) =>
          console.error("[WA] Auto-reconnect failed for", company_id, e.message)
        );
      }
    } catch (e) {
      console.error("[WA] Auto-reconnect startup error:", e.message);
    }
  }, 3000);
});
