import { useState } from "react";
import {
  X, Send, Phone, Building2, MessageCircle,
  DollarSign, Edit2, Check, Trash2, FileText,
} from "lucide-react";
import {
  BG, SURFACE, SURFACE2, PRIMARY, SUCCESS, TEXT, SUBTLE, BORDER,
} from "../tokens";

function formatBRL(v) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function formatPhone(raw) {
  if (!raw) return "";
  const clean = raw.replace(/\D/g, "");
  if (clean.startsWith("55") && clean.length === 13)
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  if (clean.startsWith("55") && clean.length === 12)
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`;
  if (clean.length === 11)
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  if (clean.length === 10)
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return clean ? `+${clean}` : "";
}

function TagInput({ onAdd }) {
  const [value, setValue] = useState("");
  const [active, setActive] = useState(false);

  function submit() {
    const tag = value.trim();
    if (tag) {
      onAdd(tag);
      setValue("");
      setActive(false);
    }
  }

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        style={{
          fontSize: 10,
          color: SUBTLE,
          border: "1px dashed rgba(255,255,255,0.12)",
          background: "none",
          borderRadius: 99,
          padding: "2px 8px",
          cursor: "pointer",
        }}
      >
        + tag
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") {
          setValue("");
          setActive(false);
        }
      }}
      onBlur={submit}
      placeholder="nova tag"
      style={{
        fontSize: 11,
        border: "1px solid rgba(99,102,241,0.4)",
        borderRadius: 99,
        padding: "2px 8px",
        outline: "none",
        background: "rgba(99,102,241,0.1)",
        color: TEXT,
        width: 80,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    />
  );
}

/**
 * ChatPanel — Lead detail drawer with messages and send input.
 *
 * Props:
 *   lead          — the selected lead object (with .messages array)
 *   onClose       — () => void
 *   onSend        — (text: string) => Promise<void>  (handles API + state update in parent)
 *   onUpdate      — (fields: object) => Promise<void>
 *   onDelete      — () => Promise<void>
 *   templates     — array of { id, name, text }
 */
export default function ChatPanel({
  lead,
  onClose,
  onSend,
  onUpdate,
  onDelete,
  templates = [],
}) {
  const [chatInput, setChatInput] = useState("");
  const [editingLeadField, setEditingLeadField] = useState(null);
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);

  async function handleSend() {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput("");
    await onSend(text);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        style={{
          position: "relative",
          width: 380,
          height: "100%",
          background: SURFACE,
          borderLeft: `1px solid ${BORDER}`,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-24px 0 64px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: PRIMARY,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {lead.name
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: TEXT }}>
                  {lead.name}
                </p>
                {editingLeadField?.field === "phone" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <input
                      type="text"
                      autoFocus
                      className="pulso-input"
                      style={{ fontSize: 12, width: 140 }}
                      defaultValue={(lead.phone || "").replace(/@.*$/, "")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onUpdate({ phone: e.target.value });
                          setEditingLeadField(null);
                        }
                        if (e.key === "Escape") setEditingLeadField(null);
                      }}
                    />
                    <button
                      onClick={(e) => {
                        onUpdate({ phone: e.currentTarget.previousSibling.value });
                        setEditingLeadField(null);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: SUCCESS,
                      }}
                    >
                      <Check size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingLeadField({ field: "phone" })}
                    style={{
                      fontSize: 11,
                      color: SUBTLE,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      marginTop: 2,
                    }}
                  >
                    <Phone size={10} strokeWidth={1.5} />
                    {formatPhone(lead.phone) || "Sem telefone"}
                    <Edit2 size={9} strokeWidth={1.5} style={{ opacity: 0.5 }} />
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={onDelete}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: SUBTLE,
                  padding: 6,
                  borderRadius: 6,
                }}
                title="Excluir lead"
              >
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: SUBTLE,
                  padding: 6,
                  borderRadius: 6,
                }}
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Value row */}
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <DollarSign size={12} strokeWidth={1.5} style={{ color: SUBTLE }} />
            {editingLeadField?.field === "value" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                <input
                  type="number"
                  autoFocus
                  className="pulso-input"
                  style={{ flex: 1, fontSize: 13 }}
                  defaultValue={lead.value || 0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onUpdate({ value: Number(e.target.value) });
                      setEditingLeadField(null);
                    }
                    if (e.key === "Escape") setEditingLeadField(null);
                  }}
                />
                <button
                  onClick={(e) => {
                    const input = e.currentTarget.previousSibling;
                    onUpdate({ value: Number(input.value) });
                    setEditingLeadField(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: SUCCESS,
                  }}
                >
                  <Check size={14} strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <button
                onClick={() =>
                  setEditingLeadField({ field: "value", value: lead.value })
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <span
                  className="pulso-mono"
                  style={{ fontSize: 14, fontWeight: 700, color: PRIMARY }}
                >
                  {formatBRL(lead.value)}
                </span>
                <Edit2 size={10} strokeWidth={1.5} style={{ color: SUBTLE, opacity: 0.6 }} />
              </button>
            )}
          </div>
        </div>

        {/* Company & channel row */}
        <div
          style={{
            padding: "8px 16px",
            borderBottom: `1px solid ${BORDER}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: SUBTLE,
          }}
        >
          <Building2 size={11} strokeWidth={1.5} /> {lead.company_name}
          <span style={{ margin: "0 4px" }}>·</span>
          <MessageCircle size={11} strokeWidth={1.5} /> WhatsApp
        </div>

        {/* Tags */}
        <div
          style={{
            padding: "8px 16px",
            borderBottom: `1px solid ${BORDER}`,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
          }}
        >
          {(lead.tags || []).map((tag) => (
            <span
              key={tag}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 600,
                background: PRIMARY + "22",
                color: "#818CF8",
              }}
            >
              {tag}
              <button
                onClick={() =>
                  onUpdate({ tags: (lead.tags || []).filter((t) => t !== tag) })
                }
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
          <TagInput
            onAdd={(tag) => {
              const current = lead.tags || [];
              if (!current.includes(tag)) onUpdate({ tags: [...current, tag] });
            }}
          />
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: BG,
          }}
        >
          {(lead.messages || []).map((m) => {
            if (m.from_type === "system") {
              return (
                <div
                  key={m.id}
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    color: SUBTLE,
                    fontStyle: "italic",
                  }}
                >
                  {m.text}
                </div>
              );
            }
            const mine = m.from_type === "me";
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: mine ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "75%",
                    borderRadius: 12,
                    padding: "8px 12px",
                    fontSize: 13,
                    background: mine ? PRIMARY : SURFACE,
                    color: mine ? "#fff" : TEXT,
                    border: mine ? "none" : `1px solid ${BORDER}`,
                    borderBottomRightRadius: mine ? 3 : 12,
                    borderBottomLeftRadius: mine ? 12 : 3,
                  }}
                >
                  <p style={{ margin: 0 }}>{m.text}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Templates dropdown */}
        {templates.length > 0 && (
          <div
            style={{
              padding: "8px 12px 0",
              background: SURFACE,
              position: "relative",
            }}
          >
            <button
              onClick={() => setShowTemplatesDropdown((v) => !v)}
              style={{
                fontSize: 11,
                color: SUBTLE,
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <FileText size={11} strokeWidth={1.5} /> Templates{" "}
              {showTemplatesDropdown ? "▲" : "▼"}
            </button>
            {showTemplatesDropdown && (
              <div
                style={{
                  position: "absolute",
                  bottom: 32,
                  left: 12,
                  background: SURFACE2,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  zIndex: 10,
                  width: 280,
                  maxHeight: 180,
                  overflowY: "auto",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                }}
              >
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setChatInput(t.text);
                      setShowTemplatesDropdown(false);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      background: "none",
                      border: "none",
                      borderBottom: `1px solid ${BORDER}`,
                      cursor: "pointer",
                    }}
                  >
                    <p style={{ fontSize: 12, fontWeight: 600, color: TEXT, margin: 0 }}>
                      {t.name}
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: SUBTLE,
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.text}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div
          style={{
            padding: 12,
            borderTop: `1px solid ${BORDER}`,
            background: SURFACE,
            display: "flex",
            gap: 8,
          }}
        >
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Escreva uma mensagem..."
            className="pulso-input"
            style={{ flex: 1 }}
          />
          <button
            onClick={handleSend}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "none",
              background: PRIMARY,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Send size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
