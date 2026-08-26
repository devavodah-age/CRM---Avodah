import { Flame, Snowflake, MessageCircle, MessageSquare, Calendar } from "lucide-react";
import { TEXT, SUBTLE, BORDER, SUCCESS } from "../tokens";

function formatBRL(v) {
  const n = Number(v || 0);
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function LeadCard({ lead, color, stage, onDragStart, onClick, onOpenConv }) {
  const lastMsg = lead.messages[lead.messages.length - 1];
  const tags = lead.tags || [];
  const initials = lead.name.split(" ").map((p) => p[0]).slice(0, 2).join("");

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      onClick={onClick}
      className="pulso-lead-card"
      style={{ padding: 0, overflow: "hidden", borderLeft: `3px solid ${color}` }}
    >
      {/* Card body */}
      <div style={{ padding: "10px 12px 8px" }}>
        {/* Top row: avatar + name + temp icon */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: color + "28",
            display: "flex", alignItems: "center", justifyContent: "center",
            color, fontSize: 11, fontWeight: 800, flexShrink: 0,
            border: `1px solid ${color}44`,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
              <p style={{
                fontSize: 12, fontWeight: 700, margin: 0, color: TEXT,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3,
              }}>
                {lead.name}
              </p>
              {stage.temp === 1
                ? <Flame size={11} strokeWidth={1.5} style={{ color, flexShrink: 0 }} />
                : stage.temp === 0
                  ? <Snowflake size={11} strokeWidth={1.5} style={{ color, flexShrink: 0 }} />
                  : null}
            </div>
            {lead.company_name && (
              <p style={{
                fontSize: 10, color: SUBTLE, margin: "1px 0 0",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {lead.company_name}
              </p>
            )}
          </div>
        </div>

        {/* Value + date + WhatsApp */}
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="pulso-mono" style={{ fontSize: 13, fontWeight: 800, color, letterSpacing: "-0.02em" }}>
            {formatBRL(lead.value)}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {lead.created_at && (
              <span style={{ fontSize: 10, color: SUBTLE, display: "flex", alignItems: "center", gap: 3 }}>
                <Calendar size={9} strokeWidth={1.5} />
                {formatDate(lead.created_at)}
              </span>
            )}
            {lead.phone && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenConv && onOpenConv(); }}
                style={{
                  background: SUCCESS + "18",
                  border: `1px solid ${SUCCESS}33`,
                  borderRadius: 6, cursor: "pointer", color: SUCCESS,
                  padding: "3px 5px", display: "flex", alignItems: "center",
                }}
                title="Abrir conversa"
              >
                <MessageCircle size={11} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
            {tags.map((tag) => (
              <span key={tag} style={{
                padding: "1px 7px", borderRadius: 99, fontSize: 9, fontWeight: 700,
                background: color + "20", color,
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Last message footer */}
      {lastMsg && lastMsg.from_type !== "system" && (
        <div style={{
          padding: "6px 12px",
          borderTop: `1px solid ${BORDER}`,
          background: "rgba(255,255,255,0.02)",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <MessageSquare size={9} strokeWidth={1.5} style={{ color: SUBTLE, flexShrink: 0 }} />
          <p style={{
            fontSize: 10, color: SUBTLE, margin: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontStyle: "italic",
          }}>
            {lastMsg.from_type === "me" ? "Você: " : ""}
            {lastMsg.text}
          </p>
        </div>
      )}
    </div>
  );
}
