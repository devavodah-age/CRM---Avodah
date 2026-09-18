const pool = require('./db');
const { enqueueN8nEvent } = require('./n8nOutbox');

let sendMessageFn = null;
let isProcessing = false;
let noResponseTickCount = 0; // fires every ~1h (120 × 30s intervals)

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

    // Recupera jobs abandonados por restart/deploy. Depois de três recuperações,
    // marca como failed para não criar um loop infinito.
    await client.query(`
      UPDATE automation_jobs
      SET status='failed', attempts=attempts + 1, locked_at=NULL,
          last_error='Job interrompido repetidamente por reinício do servidor'
      WHERE status='running'
        AND COALESCE(locked_at, created_at) < NOW() - INTERVAL '5 minutes'
        AND attempts >= 2
    `);
    await client.query(`
      UPDATE automation_jobs
      SET status='pending', attempts=attempts + 1, locked_at=NULL, run_at=NOW(),
          last_error='Job recuperado após reinício do servidor'
      WHERE status='running'
        AND COALESCE(locked_at, created_at) < NOW() - INTERVAL '5 minutes'
        AND attempts < 2
    `);

    const { rows: jobs } = await client.query(`
      SELECT j.id, j.automation_id, j.company_id, j.lead_id, j.next_action_index, j.attempts,
             a.name AS auto_name, a.actions
      FROM automation_jobs j
      JOIN automations a ON a.id = j.automation_id
      WHERE j.status = 'pending' AND j.run_at <= NOW()
      LIMIT 5
      FOR UPDATE OF j SKIP LOCKED
    `);

    if (jobs.length === 0) {
      await client.query('COMMIT');
      client.release();
      return;
    }

    // Mark all as running before releasing the lock
    for (const job of jobs) {
      await client.query(
        `UPDATE automation_jobs SET status='running', locked_at=NOW() WHERE id=$1`,
        [job.id]
      );
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
    await pool.query(
      `UPDATE automation_jobs SET status='done', locked_at=NULL, completed_at=NOW() WHERE id=$1`,
      [job.id]
    );
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
          `UPDATE automation_jobs SET status='pending', next_action_index=$1, run_at=$2, locked_at=NULL WHERE id=$3`,
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
          const error = new Error('Lead sem telefone cadastrado');
          error.retryable = false;
          throw error;
        } else {
          let result;
          try {
            if (!sendMessageFn) throw new Error('Provedor de WhatsApp indisponível');
            result = await sendMessageFn(job.company_id, lead.phone, text);
          } catch (e) {
            await pool.query(
              "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
              [lead.id, `⚠️ WhatsApp indisponível — envio será tentado novamente: "${text}"`]
            );
            throw e;
          }
          // O envio externo já aconteceu. Salva primeiro o checkpoint para que uma
          // falha posterior no banco não provoque um segundo envio no retry.
          await pool.query(
            `UPDATE automation_jobs SET next_action_index=$1, locked_at=NOW() WHERE id=$2`,
            [i + 1, job.id]
          );
          const waMessageId = result?.key?.id || null;
          await pool.query(
            `INSERT INTO messages (lead_id, from_type, text, wa_msg_id)
             VALUES ($1,'me',$2,$3)
             ON CONFLICT (wa_msg_id) WHERE wa_msg_id IS NOT NULL
             DO UPDATE SET text=EXCLUDED.text`,
            [lead.id, text, waMessageId]
          );
        }

      } else if (action.type === 'move_stage') {
        if (action.stage) {
          await pool.query('UPDATE leads SET stage=$1 WHERE id=$2', [action.stage, lead.id]);
          await enqueueN8nEvent(job.company_id, 'stage_changed', {
            leadId: lead.id, previousStage: lead.stage, stage: action.stage, source: 'automation',
          });
          lead.stage = action.stage;
        }

      } else if (action.type === 'add_note') {
        await pool.query(
          "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
          [lead.id, `📝 ${action.note || ''}`]
        );
      }

      i++;
      // Checkpoint após cada ação: um restart retoma da próxima ação concluída.
      await pool.query(
        `UPDATE automation_jobs SET next_action_index=$1, locked_at=NOW() WHERE id=$2`,
        [i, job.id]
      );
    }

    // All actions completed
    await pool.query(
      "INSERT INTO messages (lead_id, from_type, text) VALUES ($1,'system',$2)",
      [lead.id, `🤖 Automação "${job.auto_name}" executada com sucesso`]
    );
    await pool.query(
      `UPDATE automation_jobs
       SET status='done', locked_at=NULL, completed_at=NOW(), last_error=NULL
       WHERE id=$1`,
      [job.id]
    );
    console.log(`[AutoEngine] Job ${job.id} concluído — lead ${lead.id}`);

  } catch (e) {
    console.error(`[AutoEngine] Job ${job.id} falhou (tentativa ${(job.attempts || 0) + 1}):`, e.message);
    const attempts = (job.attempts || 0) + 1;
    const errorMessage = String(e.message || e).slice(0, 500);
    if (e.retryable !== false && attempts < 3) {
      // Retry em 5 minutos
      await pool.query(
        `UPDATE automation_jobs
         SET status='pending', attempts=$1, run_at=NOW() + INTERVAL '5 minutes',
             locked_at=NULL, last_error=$3
         WHERE id=$2`,
        [attempts, job.id, errorMessage]
      );
      console.log(`[AutoEngine] Job ${job.id} reagendado para daqui 5min (tentativa ${attempts}/3)`);
    } else {
      await pool.query(
        `UPDATE automation_jobs
         SET status='failed', attempts=$1, locked_at=NULL, last_error=$3 WHERE id=$2`,
        [attempts, job.id, errorMessage]
      );
      console.log(`[AutoEngine] Job ${job.id} falhou definitivamente após 3 tentativas`);
    }
  }
}

// Verifica automações do tipo no_response: leads sem resposta do lead em X dias.
// Roda a cada ~1h para não sobrecarregar o banco.
async function checkNoResponseTriggers() {
  try {
    const { rows: automations } = await pool.query(
      `SELECT * FROM automations WHERE enabled=TRUE AND trigger_type='no_response'`
    );
    for (const automation of automations) {
      const days = Math.max(1, Number(automation.trigger_config?.days) || 3);
      const actions = Array.isArray(automation.actions) ? automation.actions : [];
      if (actions.length === 0) continue;

      const { rows: leads } = await pool.query(`
        SELECT l.id FROM leads l
        WHERE l.company_id = $1
          AND EXISTS (
            SELECT 1 FROM messages m WHERE m.lead_id = l.id AND m.from_type = 'lead'
          )
          AND (
            SELECT MAX(m.created_at) FROM messages m
            WHERE m.lead_id = l.id AND m.from_type = 'lead'
          ) < NOW() - ($2 * INTERVAL '1 day')
          AND NOT EXISTS (
            SELECT 1 FROM automation_jobs j
            WHERE j.automation_id = $3
              AND j.lead_id = l.id
              AND j.created_at > NOW() - ($2 * INTERVAL '1 day')
          )
      `, [automation.company_id, days, automation.id]);

      for (const lead of leads) {
        await pool.query(
          `INSERT INTO automation_jobs (automation_id, company_id, lead_id, next_action_index, run_at, status)
           VALUES ($1,$2,$3,0,NOW(),'pending')`,
          [automation.id, automation.company_id, lead.id]
        );
        console.log(`[AutoEngine] no_response job criado — automação "${automation.name}" lead ${lead.id}`);
      }
    }
  } catch (e) {
    console.error('[AutoEngine] checkNoResponseTriggers error:', e.message);
  }
}

function startJobProcessor() {
  const run = async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
      await processJobs();
      noResponseTickCount++;
      if (noResponseTickCount >= 120) {
        noResponseTickCount = 0;
        await checkNoResponseTriggers();
      }
    } finally { isProcessing = false; }
  };
  // Run no_response check immediately on startup too
  checkNoResponseTriggers().catch(console.error);
  run();
  setInterval(run, 30 * 1000);
  console.log('[AutoEngine] Job processor iniciado (intervalo: 30s)');
}

module.exports = { triggerAutomations, setWhatsAppSender, startJobProcessor };
