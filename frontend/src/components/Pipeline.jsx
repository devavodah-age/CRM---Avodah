import LeadCard from "./LeadCard";
import { TEXT, SUBTLE, BORDER, SURFACE, SUCCESS, DANGER } from "../tokens";

const STAGES = [
  { id: "novo", name: "Novo Lead", temp: 0 },
  { id: "qualificacao", name: "Qualificação", temp: 0.33 },
  { id: "proposta", name: "Proposta Enviada", temp: 0.66 },
  { id: "negociacao", name: "Negociação", temp: 1 },
  { id: "ganho", name: "Ganho", color: SUCCESS },
  { id: "perdido", name: "Perdido", color: DANGER },
];

function heatColor(t) {
  const from = [99, 102, 241];
  const to = [249, 115, 22];
  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  return `rgb(${r},${g},${b})`;
}

function stageColor(stage) {
  return stage.color || heatColor(stage.temp);
}

function formatBRL(v) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export default function Pipeline({ leads, onLeadClick, onOpenConv, onDragStart, onDrop }) {
  const pipelineTotal = leads.reduce((s, l) => s + Number(l.value || 0), 0);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Pipeline summary bar */}
      <div style={{
        padding: "8px 16px",
        borderBottom: `1px solid ${BORDER}`,
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexShrink: 0,
        background: SURFACE,
      }}>
        <span style={{ fontSize: 12, color: SUBTLE }}>
          <span style={{ color: TEXT, fontWeight: 700 }}>{leads.length}</span> leads
        </span>
        <span style={{ fontSize: 12, color: SUBTLE }}>
          Total:{" "}
          <span className="pulso-mono" style={{ color: TEXT, fontWeight: 700 }}>
            {formatBRL(pipelineTotal)}
          </span>
        </span>
        {/* Mini stage distribution bar */}
        <div style={{
          flex: 1,
          height: 4,
          borderRadius: 99,
          display: "flex",
          overflow: "hidden",
          gap: 1,
          maxWidth: 320,
        }}>
          {STAGES.map((s) => {
            const c = stageColor(s);
            const pct = leads.length > 0
              ? (leads.filter((l) => l.stage === s.id).length / leads.length) * 100
              : 0;
            return pct > 0 ? (
              <div
                key={s.id}
                style={{ height: "100%", background: c, width: `${pct}%`, transition: "width 0.4s ease" }}
                title={`${s.name}: ${Math.round(pct)}%`}
              />
            ) : null;
          })}
        </div>
      </div>

      {/* Columns */}
      <div style={{
        flex: 1,
        overflowX: "auto",
        padding: "12px 16px",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}>
        {STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.stage === stage.id);
          const total = stageLeads.reduce((s, l) => s + Number(l.value || 0), 0);
          const color = stageColor(stage);
          const pct = pipelineTotal > 0 ? (total / pipelineTotal) * 100 : 0;

          return (
            <div
              key={stage.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, stage.id)}
              style={{
                width: 272,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: 14,
                overflow: "hidden",
                maxHeight: "100%",
              }}
            >
              {/* Column header */}
              <div style={{ borderTop: `3px solid ${color}`, padding: "12px 14px 10px" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{stage.name}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: color + "22",
                    color,
                    borderRadius: 99,
                    padding: "2px 9px",
                    minWidth: 22,
                    textAlign: "center",
                  }}>
                    {stageLeads.length}
                  </span>
                </div>
                <p className="pulso-mono" style={{ fontSize: 16, fontWeight: 700, color: TEXT, margin: "0 0 6px" }}>
                  {formatBRL(total)}
                </p>
                {/* Value progress bar */}
                <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    background: color,
                    width: `${pct}%`,
                    borderRadius: 99,
                    transition: "width 0.5s ease",
                  }} />
                </div>
                <p style={{ fontSize: 10, color: SUBTLE, margin: "4px 0 0" }}>{Math.round(pct)}% do pipeline</p>
              </div>

              {/* Cards */}
              <div style={{
                flex: 1,
                overflowY: "auto",
                padding: "6px 10px 10px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minHeight: 80,
              }}>
                {stageLeads.map((lead, idx) => (
                  <div key={lead.id} className="pulso-fade-up" style={{ animationDelay: `${idx * 0.04}s` }}>
                    <LeadCard
                      lead={lead}
                      color={color}
                      stage={stage}
                      onDragStart={onDragStart}
                      onClick={() => onLeadClick(lead.id)}
                      onOpenConv={() => onOpenConv(lead.id)}
                    />
                  </div>
                ))}
                {stageLeads.length === 0 && (
                  <div style={{
                    fontSize: 11,
                    color: SUBTLE,
                    textAlign: "center",
                    padding: "24px 0",
                    border: "1px dashed rgba(255,255,255,0.07)",
                    borderRadius: 10,
                    marginTop: 2,
                  }}>
                    <div style={{ fontSize: 18, marginBottom: 4, opacity: 0.3 }}>↓</div>
                    Solte um lead aqui
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
