import {
  BarChart2, LayoutGrid, Users, Zap, MessageSquare, Smartphone,
  Settings, Building2, LogOut,
} from "lucide-react";
import { PRIMARY, TEXT, MUTED, SUBTLE, BORDER } from "../tokens";

const NAV = [
  { id: "dashboard",     label: "Dashboard",     icon: BarChart2 },
  { id: "pipeline",      label: "Pipeline",       icon: LayoutGrid },
  { id: "contatos",      label: "Contatos",       icon: Users },
  { id: "automacoes",    label: "Automações",     icon: Zap },
  { id: "conversas",     label: "Conversas",      icon: MessageSquare },
  { id: "whatsapp",      label: "WhatsApp",       icon: Smartphone },
  { id: "configuracoes", label: "Configurações",  icon: Settings },
];

function SideBtn({ active, onClick, icon, title }) {
  return (
    <div style={{
      position: "relative", width: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "3px 0",
    }}>
      {active && (
        <span style={{
          position: "absolute", left: 0, top: "50%",
          transform: "translateY(-50%)",
          width: 3, height: 22, borderRadius: "0 3px 3px 0",
          background: PRIMARY,
        }} />
      )}
      <button
        title={title}
        onClick={onClick}
        style={{
          width: 36, height: 36, borderRadius: 9,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: active ? "rgba(99,102,241,0.14)" : "transparent",
          color: active ? "#818CF8" : "rgba(148,163,184,0.45)",
          border: "none", cursor: "pointer",
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={e => {
          if (!active) {
            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            e.currentTarget.style.color = "rgba(148,163,184,0.8)";
          }
        }}
        onMouseLeave={e => {
          if (!active) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "rgba(148,163,184,0.45)";
          }
        }}
      >
        {icon}
      </button>
    </div>
  );
}

export default function Sidebar({ view, setView, isAdmin, onLogout, companyName, onConversasClick }) {
  return (
    <aside style={{
      width: 56, flexShrink: 0,
      display: "flex", flexDirection: "column", alignItems: "center",
      paddingTop: 16, paddingBottom: 16,
      background: "#0A0B0F", borderRight: `1px solid ${BORDER}`,
      gap: 0,
    }}>
      {/* Logo */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: PRIMARY,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, fontWeight: 800, color: "#fff",
        position: "relative", marginBottom: 20,
        boxShadow: "0 0 16px rgba(99,102,241,0.35)", flexShrink: 0,
      }}>
        P
        <span style={{
          position: "absolute", top: -3, right: -3,
          width: 8, height: 8, borderRadius: "50%",
          background: "#FB923C",
          animation: "pulso-pulse 2s ease-in-out infinite",
          border: "1.5px solid #0A0B0F",
        }} />
      </div>

      {/* Nav items */}
      <nav style={{
        display: "flex", flexDirection: "column", gap: 2,
        width: "100%", alignItems: "center", flex: 1,
      }}>
        {NAV.map(({ id, label, icon: Icon }) => (
          <SideBtn
            key={id}
            active={view === id}
            onClick={() => {
              if (id === "conversas" && onConversasClick) {
                onConversasClick();
              } else {
                setView(id);
              }
            }}
            icon={<Icon size={18} strokeWidth={1.5} />}
            title={label}
          />
        ))}

        {isAdmin && (
          <SideBtn
            active={view === "clientes"}
            onClick={() => setView("clientes")}
            icon={<Building2 size={18} strokeWidth={1.5} />}
            title="Clientes (Admin)"
          />
        )}
      </nav>

      {/* Bottom actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <button
          title="Sair"
          onClick={onLogout}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: SUBTLE, padding: 6, borderRadius: 6,
            display: "flex", transition: "color 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = TEXT; }}
          onMouseLeave={e => { e.currentTarget.style.color = SUBTLE; }}
        >
          <LogOut size={16} strokeWidth={1.5} />
        </button>

        <div
          title={companyName}
          style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.3)",
            color: "#818CF8", fontSize: 10, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {(companyName || "?").slice(0, 2).toUpperCase()}
        </div>
      </div>
    </aside>
  );
}
