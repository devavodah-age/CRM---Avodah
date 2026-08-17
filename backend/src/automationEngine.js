const pool = require('./db');

let sendMessageFn = null;

function setWhatsAppSender(fn) {
  sendMessageFn = fn;
}

// Called when a CRM event fires (lead created, stage changed, message received).
// Creates a job row in the DB instead of running inline — survives Railway restarts.
async function triggerAutomations(companyId, triggerType, context) {
  try {
    const { rows: automations } = await pool.query(
      `SELECT * FROM automations WHERE company_id=$1 AND enabled=TRUE AND trigger_type=$2`,
      [companyId, triggerType]
    );
    for (const automation of automations) {
      if (triggerType === 'stage_changed') {
        const cfg = automation.trigger_config || {};
        if (cfg.stage && cfg.stage !== context.stage) continue;
      }
      const actions = Array.isArray(automation.actions) ? automation.actions : [];
      if (actions.length === 0) continue;

      await pool.query(
        `INSERT INTO automation_jobs (automation_id, company_id, lead_id, next_action_index, run_at, status)
         VALUES ($1, $2, $3, 0, NOW(), 'pending')`,
        [automation.id, companyId, context.lead.id]
      );
      console.log(`[AutoEngine] Job criado — automação "${automation.name}" lead ${context.lead.id}`);
    }
  } catch (e) {
    console.error('[AutoEngine] triggerAutomations error:', e.message);
  }
}

// Runs every 30s. Claims pending jobs due to execute and processes them.
async function processJobs() {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows: jobs } = await client.query(`
      SELECT j.id, j.automation_id, j.company_id, j.lead_id, j.next_action_index,
             a.name AS auto_name, a.actions
      FROM automation_jobs j
      JOIN automations a ON a.id = j.automation_id
      WHERE j.status = 'pending' AND j.run_at <= NOW()
      LIMIT 20
      FOR UPDATE OF j SKIP LOCKED
    `);

    if (jobs.length === 0) {
      await client.query('COMMIT');
      client.release();
      return;
    }

    // Mark all as running before releasing the lock
    for (const job of jobs) {
      await client.query(`UPDATE automation_jobs SET status='running' WHERE id=$1`, [job.id]);
    }
    await client.query('COMMIT');
    client.release();
    client = null;

    for (const job of jobs) {
      await executeJob(job).catch(e =>
        console.error(`[AutoEngine] Erro no job ${job.id}:`, e.message)
      );
    }
  } catch (e) {
    console.error('[AutoEngine] processJobs error:', e.message);
  } finally {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  }
}

async function executeJob(job) {
  const actions = Array.isArray(job.actions) ? job.actions : [];
  let i = job.next_action_index;

  // Always fetch fresh lead data (lead may have changed since job was created)
  const { rows } = await pool.query('SELECT * FROM leads WHERE id=$1', [job.lead_id]);
  if (!rows[0]) {
    await pool.query(`UPDATE automation_jobs SET status='done' WHERE id=$1`, [job.id]);
    return;
  }
  const lead = rows[0];

  console.log(`[AutoEngine] Executando job ${job.id} — "${job.auto_name}" lead ${lead.id} — ação ${i}/${actions.length}`);

  try {
    while (i < actions.length) {
      const action = actions[i];

      if (action.type === 'wait') {
        // Suspend job: update run_at to future time, reset status to pending
        const minutes = Number(action.minutes) || 1;
        const runAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        await pool.query(
          `UPDATE automation_jobs SET status='pending', next_action_index=$1, run_at=$2 WHERE id=$3`,
          [i + 1, runAt, job.id]
        );
        console.log(`[AutoEngine] Job ${job.id} pausado — retoma em ${minutes}min (${runAt})`);
        return;

      } else if (action.type === 'send_whatsapp') {
        const firstName = (lead.name || '').split(' ')[0];
        const text = (action.message || '')
          .replace(/\{nome\}/g, firstName)
          .replace(/\{empresa\}/g, lead.company_name || '')
          .replace(/\{telefone\}/g, lead.phone || '');

        if (!lead.phone) {
          await pool.query(
            "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
            [lead.id, `⚠️ Automação "${job.auto_name}": lead sem telefone cadastrado`]
          );
        } else {
          try {
            if (sendMessageFn) await sendMessageFn(job.company_id, lead.phone, text);
            await pool.query(
              "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'me',$2)",
              [lead.id, text]
            );
          } catch (e) {
            await pool.query(
              "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
              [lead.id, `⚠️ WhatsApp offline — mensagem não enviada: "${text}"`]
            );
          }
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

      i++;
    }

    // All actions completed
    await pool.query(
      "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
      [lead.id, `🤖 Automação "${job.auto_name}" executada com sucesso`]
    );
    await pool.query(`UPDATE automation_jobs SET status='done' WHERE id=$1`, [job.id]);
    console.log(`[AutoEngine] Job ${job.id} concluído — lead ${lead.id}`);

  } catch (e) {
    console.error(`[AutoEngine] Job ${job.id} falhou:`, e.message);
    await pool.query(`UPDATE automation_jobs SET status='failed' WHERE id=$1`, [job.id]);
  }
}

function startJobProcessor() {
  // Run immediately on startup to resume any jobs that were pending before restart
  processJobs();
  // Then poll every 30 seconds
  setInterval(processJobs, 30 * 1000);
  console.log('[AutoEngine] Job processor iniciado (intervalo: 30s)');
}

module.exports = { triggerAutomations, setWhatsAppSender, startJobProcessor };
