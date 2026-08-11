const pool = require('./db');

let sendMessageFn = null;

function setWhatsAppSender(fn) {
  sendMessageFn = fn;
}

async function triggerAutomations(companyId, triggerType, context) {
  try {
    const result = await pool.query(
      `SELECT * FROM automations WHERE company_id=$1 AND enabled=TRUE AND trigger_type=$2`,
      [companyId, triggerType]
    );
    for (const automation of result.rows) {
      if (triggerType === 'stage_changed') {
        const cfg = automation.trigger_config || {};
        if (cfg.stage && cfg.stage !== context.stage) continue;
      }
      runAutomation(automation, context, companyId).catch(e =>
        console.error('[AutoEngine] error in automation', automation.id, e.message)
      );
    }
  } catch (e) {
    console.error('[AutoEngine] triggerAutomations error:', e.message);
  }
}

async function runAutomation(automation, context, companyId) {
  const lead = { ...context.lead };
  const actions = Array.isArray(automation.actions) ? automation.actions : [];
  console.log(`[AutoEngine] Running "${automation.name}" for lead ${lead.id}`);

  for (const action of actions) {
    if (action.type === 'wait') {
      const ms = (Number(action.minutes) || 1) * 60 * 1000;
      await new Promise(r => setTimeout(r, ms));
      const fresh = await pool.query('SELECT * FROM leads WHERE id=$1', [lead.id]);
      if (!fresh.rows[0]) return;
      Object.assign(lead, fresh.rows[0]);
    } else if (action.type === 'send_whatsapp') {
      const firstName = (lead.name || '').split(' ')[0];
      const text = (action.message || '')
        .replace(/\{nome\}/g, firstName)
        .replace(/\{empresa\}/g, lead.company_name || '')
        .replace(/\{telefone\}/g, lead.phone || '');
      if (!lead.phone) {
        await pool.query(
          "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
          [lead.id, `⚠️ Automação "${automation.name}": lead sem telefone cadastrado`]
        );
        continue;
      }
      try {
        if (sendMessageFn) await sendMessageFn(companyId, lead.phone, text);
        await pool.query("INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'me',$2)", [lead.id, text]);
      } catch {
        await pool.query(
          "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
          [lead.id, `⚠️ WhatsApp offline — mensagem não enviada: "${text}"`]
        );
      }
    } else if (action.type === 'move_stage') {
      if (action.stage) {
        await pool.query('UPDATE leads SET stage=$1 WHERE id=$2', [action.stage, lead.id]);
        lead.stage = action.stage;
      }
    } else if (action.type === 'add_note') {
      await pool.query(
        "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
        [lead.id, `📝 ${action.note || ''}`]
      );
    }
  }

  await pool.query(
    "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
    [lead.id, `🤖 Automação "${automation.name}" executada com sucesso`]
  );
}

module.exports = { triggerAutomations, setWhatsAppSender };
