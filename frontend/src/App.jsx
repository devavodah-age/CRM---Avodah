import React, { useState, useEffect, useRef } from "react";
import {
  LayoutGrid,
  Users,
  Zap,
  Settings,
  Search,
  Plus,
  X,
  Send,
  Phone,
  Building2,
  Flame,
  Snowflake,
  Trash2,
  MessageCircle,
  LogOut,
  Loader2,
  Smartphone,
} from "lucide-react";

// URL do backend. Em desenvolvimento local o backend roda em localhost:3001.
// Quando você hospedar o backend de verdade (Railway, Render, etc.), troque
// esse valor pela URL pública dele.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// ---------- Design tokens ----------
const INK = "#14171F";
const SIDEBAR = "#241C57";
const PRIMARY = "#4F3CC9";
const SUCCESS = "#16A34A";
const DANGER = "#E11D48";

const STAGES = [
  { id: "novo", name: "Novo Lead", temp: 0 },
  { id: "qualificacao", name: "Qualificação", temp: 0.33 },
  { id: "proposta", name: "Proposta Enviada", temp: 0.66 },
  { id: "negociacao", name: "Negociação", temp: 1 },
  { id: "ganho", name: "Ganho", color: SUCCESS },
  { id: "perdido", name: "Perdido", color: DANGER },
];

function heatColor(t) {
  const from = [59, 130, 246];
  const to = [249, 115, 22];
  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  return `rgb(${r},${g},${b})`;
}

function stageColor(stage) {
  return stage.color || heatColor(stage.temp);
}

function stageById(id) {
  return STAGES.find((s) => s.id === id) || STAGES[0];
}

function formatBRL(v) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

const AUTO_REPLIES = [
  "Perfeito, obrigado pelo retorno!",
  "Combinado, vou verificar e te aviso.",
  "Show, pode me mandar mais detalhes?",
  "Legal, vamos marcar uma call essa semana?",
  "Entendi, muito obrigado!",
];

export default function PulsoCRM() {
  // ----- autenticação -----
  // O token fica só em memória (state). Ao recarregar a página, é preciso
  // logar de novo — isso é proposital enquanto o app roda dentro do preview
  // do Claude. Numa hospedagem de verdade, dá pra guardar em cookie seguro.
  const [token, setToken] = useState(null);
  const [company, setCompany] = useState(null);
  const [authMode, setAuthMode] = useState("login"); // 'login' | 'signup'
  const [authForm, setAuthForm] = useState({ companyName: "", userName: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // ----- dados do CRM -----
  const [leads, setLeads] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [view, setView] = useState("pipeline");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [toasts, setToasts] = useState([]);

  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ name: "", company_name: "", value: "", phone: "" });

  const [showNewAutomationModal, setShowNewAutomationModal] = useState(false);
  const [newAutomationForm, setNewAutomationForm] = useState({ name: "", trigger_stage: "novo", action_text: "" });

  const [waStatus, setWaStatus] = useState('disconnected'); // 'disconnected' | 'qr' | 'open'
  const [waQr, setWaQr] = useState(null);
  const [waPolling, setWaPolling] = useState(false);

  const idRef = useRef(1);
  const nextId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;

  function addToast(text) {
    const id = nextId();
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      data = {};
    }
    if (!res.ok) {
      throw new Error(data.error || "Erro ao falar com o servidor");
    }
    return data;
  }

  async function loadData() {
    setLoadingData(true);
    try {
      const [leadsData, automationsData] = await Promise.all([
        apiFetch("/leads"),
        apiFetch("/automations"),
      ]);
      setLeads(leadsData);
      setAutomations(automationsData);
    } catch (err) {
      addToast(`Não consegui carregar os dados: ${err.message}`);
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (token) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || !waPolling) return;
    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/whatsapp/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setWaStatus(data.status);
        setWaQr(data.qrDataUrl);
        if (data.status === 'open') setWaPolling(false);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [token, waPolling]);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const path = authMode === "login" ? "/auth/login" : "/auth/signup";
      const body =
        authMode === "login"
          ? { email: authForm.email, password: authForm.password }
          : authForm;
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível entrar");
      setToken(data.token);
      setCompany(data.company);
    } catch (err) {
      setAuthError(
        err.message === "Failed to fetch"
          ? "Não consegui falar com o backend. Ele está rodando em " + API_URL + " ?"
          : err.message
      );
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    setToken(null);
    setCompany(null);
    setLeads([]);
    setAutomations([]);
    setSelectedLeadId(null);
  }

  async function moveLead(leadId, stageId) {
    const previous = leads;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: stageId } : l)));
    try {
      const data = await apiFetch(`/leads/${leadId}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage: stageId }),
      });
      setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead : l)));
      if (data.automationTriggered) {
        addToast(`Automação executada: ${data.automationTriggered}`);
      }
    } catch (err) {
      setLeads(previous);
      addToast(`Não consegui mover o lead: ${err.message}`);
    }
  }

  function handleDragStart(e, leadId) {
    e.dataTransfer.setData("text/plain", String(leadId));
  }

  function handleDrop(e, stageId) {
    e.preventDefault();
    const leadId = Number(e.dataTransfer.getData("text/plain"));
    if (!leadId) return;
    moveLead(leadId, stageId);
  }

  async function sendMessage() {
    if (!chatInput.trim() || !selectedLeadId) return;
    const text = chatInput.trim();
    const targetId = selectedLeadId;
    setChatInput("");
    try {
      const message = await apiFetch(`/leads/${targetId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setLeads((prev) =>
        prev.map((l) => (l.id === targetId ? { ...l, messages: [...l.messages, message] } : l))
      );
      if (waStatus === 'open' && selectedLead?.phone) {
        sendWhatsAppMessage(selectedLead.id, selectedLead.phone, text).catch(() => {});
      }
      // Simula uma resposta do lead só na tela, pra dar vida ao protótipo.
      // Isso NÃO é salvo no banco ainda — vira real quando plugarmos o WhatsApp de verdade.
      setTimeout(() => {
        const reply = AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)];
        setLeads((prev) =>
          prev.map((l) =>
            l.id === targetId
              ? { ...l, messages: [...l.messages, { id: `local-${nextId()}`, from_type: "lead", text: reply, created_at: "" }] }
              : l
          )
        );
      }, 1200);
    } catch (err) {
      addToast(`Não consegui enviar a mensagem: ${err.message}`);
    }
  }

  async function addLead() {
    if (!newLeadForm.name.trim()) return;
    try {
      const lead = await apiFetch("/leads", {
        method: "POST",
        body: JSON.stringify({
          name: newLeadForm.name,
          company_name: newLeadForm.company_name,
          phone: newLeadForm.phone,
          value: Number(newLeadForm.value) || 0,
        }),
      });
      setLeads((prev) => [lead, ...prev]);
      setNewLeadForm({ name: "", company_name: "", value: "", phone: "" });
      setShowNewLeadModal(false);
      addToast(`Lead "${lead.name}" criado`);
    } catch (err) {
      addToast(`Não consegui criar o lead: ${err.message}`);
    }
  }

  async function addAutomation() {
    if (!newAutomationForm.name.trim() || !newAutomationForm.action_text.trim()) return;
    try {
      const auto = await apiFetch("/automations", {
        method: "POST",
        body: JSON.stringify(newAutomationForm),
      });
      setAutomations((prev) => [...prev, auto]);
      setNewAutomationForm({ name: "", trigger_stage: "novo", action_text: "" });
      setShowNewAutomationModal(false);
      addToast(`Automação "${auto.name}" criada`);
    } catch (err) {
      addToast(`Não consegui criar a automação: ${err.message}`);
    }
  }

  async function toggleAutomation(auto) {
    try {
      const updated = await apiFetch(`/automations/${auto.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !auto.enabled }),
      });
      setAutomations((prev) => prev.map((a) => (a.id === auto.id ? updated : a)));
    } catch (err) {
      addToast(`Não consegui atualizar a automação: ${err.message}`);
    }
  }

  async function deleteAutomation(id) {
    try {
      await apiFetch(`/automations/${id}`, { method: "DELETE" });
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      addToast(`Não consegui apagar a automação: ${err.message}`);
    }
  }

  async function connectWhatsApp() {
    try {
      await fetch(`${API_URL}/whatsapp/connect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setWaPolling(true);
    } catch (err) {
      addToast('Erro ao iniciar conexão WhatsApp');
    }
  }

  async function disconnectWhatsApp() {
    try {
      await fetch(`${API_URL}/whatsapp/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setWaStatus('disconnected');
      setWaQr(null);
      setWaPolling(false);
    } catch {}
  }

  async function sendWhatsAppMessage(leadId, phone, text) {
    try {
      const res = await fetch(`${API_URL}/whatsapp/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, phone, text }),
      });
      if (!res.ok) throw new Error('Falha ao enviar');
      addToast('Mensagem enviada!');
    } catch (err) {
      addToast(`Erro: ${err.message}`);
    }
  }

  const filteredLeads = leads.filter((l) => {
    const q = searchTerm.toLowerCase();
    return l.name.toLowerCase().includes(q) || (l.company_name || "").toLowerCase().includes(q);
  });

  const titles = {
    pipeline: ["Pipeline de Vendas", "Arraste os cards entre as etapas do funil"],
    contatos: ["Contatos", "Todos os leads e clientes em um só lugar"],
    automacoes: ["Automações", "Regras que disparam ações sozinhas"],
    whatsapp: ["WhatsApp", "Conecte e gerencie sua conta WhatsApp"],
  };

  const sharedStyle = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');
    .pulso-mono { font-family: 'IBM Plex Mono', monospace; }
    .pulso-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .pulso-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
    @keyframes pulso-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    .pulso-input { width: 100%; padding: 8px 12px; font-size: 14px; border-radius: 8px; border: 1px solid #E5E7EB; outline: none; }
    .pulso-input:focus { border-color: ${PRIMARY}; }
  `;

  // ---------- Tela de login / cadastro ----------
  if (!token) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#F5F6FA]" style={{ color: INK, fontFamily: "Inter, sans-serif", height: "100vh" }}>
        <style>{sharedStyle}</style>
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm relative mb-3" style={{ fontFamily: "Sora, sans-serif", backgroundColor: PRIMARY }}>
              P
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-400" style={{ animation: "pulso-pulse 2s ease-in-out infinite" }} />
            </div>
            <h1 className="text-lg font-bold" style={{ fontFamily: "Sora, sans-serif" }}>Pulso CRM</h1>
            <p className="text-xs text-gray-400 mt-1">{authMode === "login" ? "Entre na sua conta" : "Crie a conta da sua empresa"}</p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3">
            {authMode === "signup" && (
              <>
                <Field label="Nome da empresa">
                  <input required className="pulso-input" value={authForm.companyName} onChange={(e) => setAuthForm({ ...authForm, companyName: e.target.value })} />
                </Field>
                <Field label="Seu nome">
                  <input required className="pulso-input" value={authForm.userName} onChange={(e) => setAuthForm({ ...authForm, userName: e.target.value })} />
                </Field>
              </>
            )}
            <Field label="Email">
              <input required type="email" className="pulso-input" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} />
            </Field>
            <Field label="Senha">
              <input required type="password" className="pulso-input" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} />
            </Field>

            {authError && <p className="text-xs text-rose-500">{authError}</p>}

            <button disabled={authLoading} type="submit" className="w-full py-2.5 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2" style={{ backgroundColor: PRIMARY }}>
              {authLoading && <Loader2 size={14} className="animate-spin" />}
              {authMode === "login" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <button
            onClick={() => {
              setAuthMode(authMode === "login" ? "signup" : "login");
              setAuthError("");
            }}
            className="w-full text-center text-xs text-gray-400 mt-4 hover:text-gray-600"
          >
            {authMode === "login" ? "Não tem conta? Cadastre sua empresa" : "Já tem conta? Entrar"}
          </button>

          <p className="text-[11px] text-gray-300 text-center mt-4">
            Backend esperado em <span className="pulso-mono">{API_URL}</span>
          </p>
        </div>
      </div>
    );
  }

  // ---------- App principal ----------
  return (
    <div className="w-full h-full flex bg-[#F5F6FA]" style={{ color: INK, fontFamily: "Inter, sans-serif", height: "100vh" }}>
      <style>{sharedStyle}</style>

      {/* Sidebar */}
      <aside className="w-16 flex-shrink-0 flex flex-col items-center py-5 gap-6" style={{ backgroundColor: SIDEBAR }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm relative" style={{ fontFamily: "Sora, sans-serif", backgroundColor: PRIMARY }}>
          P
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-400" style={{ animation: "pulso-pulse 2s ease-in-out infinite" }} />
        </div>
        <nav className="flex flex-col gap-2 mt-4">
          <SideBtn active={view === "pipeline"} onClick={() => setView("pipeline")} icon={<LayoutGrid size={19} />} title="Pipeline" />
          <SideBtn active={view === "contatos"} onClick={() => setView("contatos")} icon={<Users size={19} />} title="Contatos" />
          <SideBtn active={view === "automacoes"} onClick={() => setView("automacoes")} icon={<Zap size={19} />} title="Automações" />
          <SideBtn active={view === "whatsapp"} onClick={() => setView("whatsapp")} icon={<Smartphone size={19} />} title="WhatsApp" />
        </nav>
        <div className="mt-auto flex flex-col gap-4 items-center">
          <button title="Configurações" className="text-white/50 hover:text-white/90 transition-colors">
            <Settings size={19} />
          </button>
          <button title="Sair" onClick={logout} className="text-white/50 hover:text-white/90 transition-colors">
            <LogOut size={17} />
          </button>
          <div title={company?.name} className="w-8 h-8 rounded-full bg-white/10 text-white text-xs font-semibold flex items-center justify-center">
            {(company?.name || "?").slice(0, 2).toUpperCase()}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-6 border-b border-black/5 bg-white flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold leading-tight" style={{ fontFamily: "Sora, sans-serif" }}>{titles[view][0]}</h1>
            <p className="text-xs text-gray-400">{titles[view][1]}</p>
          </div>
          <div className="flex items-center gap-3">
            {view !== "automacoes" && (
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar lead ou empresa..."
                  className="pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#4F3CC9] w-56"
                />
              </div>
            )}
            {view !== "automacoes" ? (
              <button onClick={() => setShowNewLeadModal(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold" style={{ backgroundColor: PRIMARY }}>
                <Plus size={15} /> Novo Lead
              </button>
            ) : (
              <button onClick={() => setShowNewAutomationModal(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold" style={{ backgroundColor: PRIMARY }}>
                <Plus size={15} /> Nova Automação
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-hidden relative">
          {loadingData && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
              <Loader2 size={22} className="animate-spin" style={{ color: PRIMARY }} />
            </div>
          )}

          {view === "pipeline" && (
            <div className="h-full overflow-x-auto pulso-scroll p-5 flex gap-4">
              {STAGES.map((stage) => {
                const stageLeads = filteredLeads.filter((l) => l.stage === stage.id);
                const total = stageLeads.reduce((s, l) => s + l.value, 0);
                const color = stageColor(stage);
                return (
                  <div key={stage.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, stage.id)} className="w-72 flex-shrink-0 flex flex-col bg-white/70 rounded-xl border border-black/5">
                    <div className="px-3 py-3 border-b border-black/5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-semibold text-sm">{stage.name}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">{stageLeads.length}</span>
                      </div>
                    </div>
                    <div className="px-3 pt-2 pb-1 text-xs text-gray-400 pulso-mono">{formatBRL(total)}</div>
                    <div className="flex-1 overflow-y-auto pulso-scroll p-2 space-y-2 min-h-[120px]">
                      {stageLeads.map((lead) => (
                        <LeadCard key={lead.id} lead={lead} color={color} stage={stage} onDragStart={handleDragStart} onClick={() => setSelectedLeadId(lead.id)} />
                      ))}
                      {stageLeads.length === 0 && (
                        <div className="text-xs text-gray-300 text-center py-6 border border-dashed border-gray-200 rounded-lg">Solte um lead aqui</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {view === "contatos" && (
            <div className="h-full overflow-y-auto pulso-scroll p-5">
              <div className="bg-white rounded-xl border border-black/5 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                      <th className="text-left font-semibold px-4 py-3">Nome</th>
                      <th className="text-left font-semibold px-4 py-3">Empresa</th>
                      <th className="text-left font-semibold px-4 py-3">Telefone</th>
                      <th className="text-left font-semibold px-4 py-3">Valor</th>
                      <th className="text-left font-semibold px-4 py-3">Etapa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => {
                      const stage = stageById(lead.stage);
                      const color = stageColor(stage);
                      return (
                        <tr key={lead.id} onClick={() => setSelectedLeadId(lead.id)} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer">
                          <td className="px-4 py-3 font-medium">{lead.name}</td>
                          <td className="px-4 py-3 text-gray-500">{lead.company_name}</td>
                          <td className="px-4 py-3 text-gray-500 pulso-mono">{lead.phone}</td>
                          <td className="px-4 py-3 pulso-mono">{formatBRL(lead.value)}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: color + "22", color }}>
                              {stage.name}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredLeads.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-gray-300 text-sm py-8">Nenhum lead ainda. Crie o primeiro com "Novo Lead".</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === "automacoes" && (
            <div className="h-full overflow-y-auto pulso-scroll p-5 space-y-3">
              {automations.map((auto) => {
                const stage = stageById(auto.trigger_stage);
                const color = stageColor(stage);
                return (
                  <div key={auto.id} className="bg-white rounded-xl border border-black/5 p-4 flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + "22" }}>
                        <Zap size={16} style={{ color }} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{auto.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Quando lead entra em <span className="font-medium" style={{ color }}>{stage.name}</span> → {auto.action_text}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleAutomation(auto)} className="w-10 h-6 rounded-full relative transition-colors" style={{ backgroundColor: auto.enabled ? PRIMARY : "#E5E7EB" }}>
                        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: auto.enabled ? "18px" : "2px" }} />
                      </button>
                      <button onClick={() => deleteAutomation(auto.id)} className="text-gray-300 hover:text-rose-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {automations.length === 0 && <p className="text-center text-gray-300 text-sm py-8">Nenhuma automação ainda.</p>}
            </div>
          )}

          {view === 'whatsapp' && (
            <div style={{ padding: '32px', maxWidth: 480, margin: '0 auto' }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: INK }}>WhatsApp</h2>
              <p style={{ color: '#6B7280', marginBottom: 24, fontSize: 14 }}>
                Conecte seu WhatsApp para enviar e receber mensagens dos leads diretamente no CRM.
              </p>

              {waStatus === 'disconnected' && (
                <button
                  onClick={connectWhatsApp}
                  style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <Smartphone size={18} /> Conectar WhatsApp
                </button>
              )}

              {waStatus === 'qr' && waQr && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ marginBottom: 12, fontWeight: 600, color: INK }}>Escaneie o QR Code com seu WhatsApp</p>
                  <img src={waQr} alt="QR Code WhatsApp" style={{ width: 260, height: 260, borderRadius: 12, border: '2px solid #e5e7eb' }} />
                  <p style={{ marginTop: 10, fontSize: 12, color: '#9CA3AF' }}>Atualizando automaticamente...</p>
                </div>
              )}

              {waStatus === 'connecting' && (
                <div style={{ color: '#6B7280', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={18} className="animate-spin" /> Conectando...
                </div>
              )}

              {waStatus === 'open' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                    <span style={{ fontWeight: 600, color: '#166534' }}>WhatsApp conectado!</span>
                  </div>
                  <button
                    onClick={disconnectWhatsApp}
                    style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Desconectar
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Chat drawer */}
      {selectedLead && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/20" onClick={() => setSelectedLeadId(null)} />
          <div className="relative w-96 h-full bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-black/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm" style={{ backgroundColor: PRIMARY }}>
                  {selectedLead.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <p className="font-semibold text-sm">{selectedLead.name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Phone size={11} /> {selectedLead.phone}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedLeadId(null)} className="text-gray-300 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="px-4 py-2 border-b border-black/5 flex items-center gap-2 text-xs text-gray-400">
              <Building2 size={12} /> {selectedLead.company_name}
              <span className="mx-1">·</span>
              <MessageCircle size={12} /> WhatsApp
            </div>

            <div className="flex-1 overflow-y-auto pulso-scroll p-4 space-y-3 bg-[#F5F6FA]">
              {selectedLead.messages.map((m) => {
                if (m.from_type === "system") {
                  return (
                    <div key={m.id} className="text-center text-[11px] text-gray-400 italic">
                      {m.text}
                    </div>
                  );
                }
                const mine = m.from_type === "me";
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${mine ? "text-white rounded-br-sm" : "bg-white text-gray-800 rounded-bl-sm border border-gray-100"}`} style={mine ? { backgroundColor: PRIMARY } : {}}>
                      <p>{m.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-black/5 flex items-center gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Escreva uma mensagem..."
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#4F3CC9]"
              />
              <button onClick={sendMessage} className="w-9 h-9 rounded-lg text-white flex items-center justify-center flex-shrink-0" style={{ backgroundColor: PRIMARY }}>
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Lead modal */}
      {showNewLeadModal && (
        <Modal onClose={() => setShowNewLeadModal(false)} title="Novo Lead">
          <Field label="Nome">
            <input value={newLeadForm.name} onChange={(e) => setNewLeadForm({ ...newLeadForm, name: e.target.value })} className="pulso-input" placeholder="Nome do lead" />
          </Field>
          <Field label="Empresa">
            <input value={newLeadForm.company_name} onChange={(e) => setNewLeadForm({ ...newLeadForm, company_name: e.target.value })} className="pulso-input" placeholder="Empresa" />
          </Field>
          <Field label="Telefone">
            <input value={newLeadForm.phone} onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })} className="pulso-input" placeholder="(00) 00000-0000" />
          </Field>
          <Field label="Valor estimado (R$)">
            <input value={newLeadForm.value} onChange={(e) => setNewLeadForm({ ...newLeadForm, value: e.target.value })} type="number" className="pulso-input" placeholder="0" />
          </Field>
          <button onClick={addLead} className="w-full mt-2 py-2.5 rounded-lg text-white text-sm font-semibold" style={{ backgroundColor: PRIMARY }}>
            Criar lead
          </button>
        </Modal>
      )}

      {/* New Automation modal */}
      {showNewAutomationModal && (
        <Modal onClose={() => setShowNewAutomationModal(false)} title="Nova Automação">
          <Field label="Nome da automação">
            <input value={newAutomationForm.name} onChange={(e) => setNewAutomationForm({ ...newAutomationForm, name: e.target.value })} className="pulso-input" placeholder="Ex: Follow-up automático" />
          </Field>
          <Field label="Quando o lead entrar em">
            <select value={newAutomationForm.trigger_stage} onChange={(e) => setNewAutomationForm({ ...newAutomationForm, trigger_stage: e.target.value })} className="pulso-input">
              {STAGES.filter((s) => !s.color).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Ação">
            <input value={newAutomationForm.action_text} onChange={(e) => setNewAutomationForm({ ...newAutomationForm, action_text: e.target.value })} className="pulso-input" placeholder="Ex: Enviar mensagem no WhatsApp" />
          </Field>
          <button onClick={addAutomation} className="w-full mt-2 py-2.5 rounded-lg text-white text-sm font-semibold" style={{ backgroundColor: PRIMARY }}>
            Criar automação
          </button>
        </Modal>
      )}

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <div key={t.id} className="bg-white rounded-lg shadow-lg border-l-4 px-4 py-3 text-sm flex items-center gap-2 max-w-xs" style={{ borderColor: PRIMARY }}>
            <Zap size={14} style={{ color: PRIMARY }} className="flex-shrink-0" />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function SideBtn({ active, onClick, icon, title }) {
  return (
    <button title={title} onClick={onClick} className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors" style={{ backgroundColor: active ? "rgba(255,255,255,0.12)" : "transparent", color: active ? "#FFFFFF" : "rgba(255,255,255,0.5)" }}>
      {icon}
    </button>
  );
}

function LeadCard({ lead, color, stage, onDragStart, onClick }) {
  const lastMsg = lead.messages[lead.messages.length - 1];
  return (
    <div draggable onDragStart={(e) => onDragStart(e, lead.id)} onClick={onClick} className="bg-white rounded-lg shadow-sm p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex items-start justify-between">
        <p className="font-semibold text-sm">{lead.name}</p>
        {stage.temp === 1 ? <Flame size={13} style={{ color }} /> : stage.temp === 0 ? <Snowflake size={13} style={{ color }} /> : null}
      </div>
      <p className="text-xs text-gray-400 mt-0.5">{lead.company_name}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs font-semibold pulso-mono" style={{ color }}>{formatBRL(lead.value)}</span>
        <span className="text-[10px] text-gray-300 pulso-mono">{(lead.phone || "").slice(-9)}</span>
      </div>
      {lastMsg && (
        <p className="text-[11px] text-gray-400 mt-2 italic truncate border-t border-gray-50 pt-2">
          {lastMsg.from_type === "me" ? "Você: " : ""}{lastMsg.text}
        </p>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl p-6 w-96 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base" style={{ fontFamily: "Sora, sans-serif" }}>{title}</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
