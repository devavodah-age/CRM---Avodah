import React, { useState, useRef } from "react";
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
} from "lucide-react";

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
  return STAGES.find((s) => s.id === id);
}

function formatBRL(v) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function nowTime() {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AUTO_MESSAGES = {
  novo: (first) => `Olá ${first}! Obrigado pelo contato, sou da equipe comercial 🙌`,
  proposta: (first) => `Oi ${first}, tudo bem? Só confirmando se a proposta chegou certinho 📄`,
  negociacao: (first) => `${first}, vamos fechar? Fico à disposição para qualquer dúvida!`,
};

const AUTO_REPLIES = [
  "Perfeito, obrigado pelo retorno!",
  "Combinado, vou verificar e te aviso.",
  "Show, pode me mandar mais detalhes?",
  "Legal, vamos marcar uma call essa semana?",
  "Entendi, muito obrigado!",
];

const INITIAL_LEADS = [
  { id: 1, name: "Marina Duarte", company: "Rede Verde Alimentos", value: 8500, phone: "(71) 98123-4501", stage: "novo",
    messages: [{ id: 1, from: "lead", text: "Oi, vi o anúncio de vocês e queria saber mais.", time: "09:12" }] },
  { id: 2, name: "Rafael Bittencourt", company: "Bittencourt Advogados", value: 12000, phone: "(71) 99234-5602", stage: "novo",
    messages: [{ id: 1, from: "lead", text: "Bom dia, vocês atendem escritórios de advocacia?", time: "08:40" }] },
  { id: 3, name: "Camila Nogueira", company: "Studio Nogueira Design", value: 4200, phone: "(71) 98345-6703", stage: "qualificacao",
    messages: [
      { id: 1, from: "lead", text: "Olá! Queria um orçamento pro plano anual.", time: "Ontem" },
      { id: 2, from: "me", text: "Claro, Camila! Vou te enviar os detalhes.", time: "Ontem" },
    ] },
  { id: 4, name: "Eduardo Lima", company: "Lima Construções", value: 21000, phone: "(71) 99456-7804", stage: "qualificacao",
    messages: [{ id: 1, from: "lead", text: "Preciso de algo pra gerenciar uns 40 leads por mês.", time: "Ontem" }] },
  { id: 5, name: "Patrícia Alves", company: "Alves Contabilidade", value: 6300, phone: "(71) 98567-8905", stage: "proposta",
    messages: [
      { id: 1, from: "me", text: "Patrícia, segue a proposta em anexo 📎", time: "Seg" },
      { id: 2, from: "lead", text: "Recebido, vou analisar com o sócio.", time: "Seg" },
    ] },
  { id: 6, name: "Thiago Rocha", company: "Rocha Logística", value: 15800, phone: "(71) 99678-9006", stage: "proposta",
    messages: [{ id: 1, from: "me", text: "Thiago, a proposta ficou pronta, dá uma olhada.", time: "Seg" }] },
  { id: 7, name: "Juliana Costa", company: "Costa & Filhos", value: 9700, phone: "(71) 98789-0107", stage: "negociacao",
    messages: [
      { id: 1, from: "lead", text: "Consegue fechar por esse valor?", time: "Ter" },
      { id: 2, from: "me", text: "Consigo sim, fechamos hoje?", time: "Ter" },
    ] },
  { id: 8, name: "Bruno Martins", company: "Martins Tech", value: 18500, phone: "(71) 99890-1208", stage: "negociacao",
    messages: [{ id: 1, from: "lead", text: "Só preciso alinhar com meu time ainda.", time: "Ter" }] },
  { id: 9, name: "Fernanda Rezende", company: "Rezende Educação", value: 5400, phone: "(71) 98901-2309", stage: "novo",
    messages: [{ id: 1, from: "lead", text: "Vocês têm plano pra escolas?", time: "10:05" }] },
  { id: 10, name: "Diego Sales", company: "Sales Fitness", value: 7200, phone: "(71) 99012-3410", stage: "ganho",
    messages: [
      { id: 1, from: "lead", text: "Fechado, pode gerar o contrato.", time: "Qui" },
      { id: 2, from: "me", text: "Show, Diego! Contrato enviado 🎉", time: "Qui" },
    ] },
  { id: 11, name: "Larissa Pinto", company: "Pinto Móveis", value: 3100, phone: "(71) 98123-4511", stage: "perdido",
    messages: [{ id: 1, from: "lead", text: "Vamos ficar com o fornecedor atual, obrigada.", time: "Qua" }] },
];

const INITIAL_AUTOMATIONS = [
  { id: 1, name: "Boas-vindas ao novo lead", trigger: "novo", action: "Enviar mensagem de boas-vindas no WhatsApp", enabled: true },
  { id: 2, name: "Lembrete de proposta", trigger: "proposta", action: "Perguntar se o lead recebeu a proposta", enabled: true },
  { id: 3, name: "Empurrão na negociação", trigger: "negociacao", action: "Enviar mensagem de fechamento no WhatsApp", enabled: true },
];

export default function PulsoCRM() {
  const idRef = useRef(1000);
  const nextId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  const [leads, setLeads] = useState(INITIAL_LEADS);
  const [automations, setAutomations] = useState(INITIAL_AUTOMATIONS);
  const [view, setView] = useState("pipeline");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [toasts, setToasts] = useState([]);

  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ name: "", company: "", value: "", phone: "" });

  const [showNewAutomationModal, setShowNewAutomationModal] = useState(false);
  const [newAutomationForm, setNewAutomationForm] = useState({ name: "", trigger: "novo", actionText: "" });

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;

  function addToast(text) {
    const id = nextId();
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }

  function moveLead(leadId, stageId) {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: stageId } : l)));
    const matched = automations.find((a) => a.enabled && a.trigger === stageId);
    if (matched) {
      setTimeout(() => {
        setLeads((prev) =>
          prev.map((l) => {
            if (l.id !== leadId) return l;
            const sysMsg = { id: nextId(), from: "system", text: `🤖 Automação "${matched.name}" disparada`, time: nowTime() };
            const template = AUTO_MESSAGES[stageId];
            const first = l.name.split(" ")[0];
            const msgs = template
              ? [...l.messages, sysMsg, { id: nextId(), from: "me", text: template(first), time: nowTime() }]
              : [...l.messages, sysMsg];
            return { ...l, messages: msgs };
          })
        );
        addToast(`Automação executada: ${matched.name}`);
      }, 400);
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

  function sendMessage() {
    if (!chatInput.trim() || !selectedLeadId) return;
    const text = chatInput.trim();
    const targetId = selectedLeadId;
    setChatInput("");
    const myMsg = { id: nextId(), from: "me", text, time: nowTime() };
    setLeads((prev) => prev.map((l) => (l.id === targetId ? { ...l, messages: [...l.messages, myMsg] } : l)));
    setTimeout(() => {
      const reply = AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)];
      const replyMsg = { id: nextId(), from: "lead", text: reply, time: nowTime() };
      setLeads((prev) => prev.map((l) => (l.id === targetId ? { ...l, messages: [...l.messages, replyMsg] } : l)));
    }, 1200);
  }

  function addLead() {
    if (!newLeadForm.name.trim()) return;
    const lead = {
      id: nextId(),
      name: newLeadForm.name,
      company: newLeadForm.company || "Sem empresa",
      value: Number(newLeadForm.value) || 0,
      phone: newLeadForm.phone || "(00) 00000-0000",
      stage: "novo",
      messages: [{ id: nextId(), from: "system", text: "Lead criado manualmente", time: nowTime() }],
    };
    setLeads((prev) => [...prev, lead]);
    setNewLeadForm({ name: "", company: "", value: "", phone: "" });
    setShowNewLeadModal(false);
    addToast(`Lead "${lead.name}" criado`);
  }

  function addAutomation() {
    if (!newAutomationForm.name.trim() || !newAutomationForm.actionText.trim()) return;
    const auto = {
      id: nextId(),
      name: newAutomationForm.name,
      trigger: newAutomationForm.trigger,
      action: newAutomationForm.actionText,
      enabled: true,
    };
    setAutomations((prev) => [...prev, auto]);
    setNewAutomationForm({ name: "", trigger: "novo", actionText: "" });
    setShowNewAutomationModal(false);
    addToast(`Automação "${auto.name}" criada`);
  }

  function toggleAutomation(id) {
    setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  }

  function deleteAutomation(id) {
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  }

  const filteredLeads = leads.filter((l) => {
    const q = searchTerm.toLowerCase();
    return l.name.toLowerCase().includes(q) || l.company.toLowerCase().includes(q);
  });

  const titles = {
    pipeline: ["Pipeline de Vendas", "Arraste os cards entre as etapas do funil"],
    contatos: ["Contatos", "Todos os leads e clientes em um só lugar"],
    automacoes: ["Automações", "Regras que disparam ações sozinhas"],
  };

  return (
    <div className="w-full h-full flex bg-[#F5F6FA]" style={{ color: INK, fontFamily: "Inter, sans-serif", height: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');
        .pulso-mono { font-family: 'IBM Plex Mono', monospace; }
        .pulso-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .pulso-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
        @keyframes pulso-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

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
        </nav>
        <div className="mt-auto flex flex-col gap-4 items-center">
          <button title="Configurações" className="text-white/50 hover:text-white/90 transition-colors">
            <Settings size={19} />
          </button>
          <div className="w-8 h-8 rounded-full bg-white/10 text-white text-xs font-semibold flex items-center justify-center">VC</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
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
              <button
                onClick={() => setShowNewLeadModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold"
                style={{ backgroundColor: PRIMARY }}
              >
                <Plus size={15} /> Novo Lead
              </button>
            ) : (
              <button
                onClick={() => setShowNewAutomationModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold"
                style={{ backgroundColor: PRIMARY }}
              >
                <Plus size={15} /> Nova Automação
              </button>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-hidden">
          {view === "pipeline" && (
            <div className="h-full overflow-x-auto pulso-scroll p-5 flex gap-4">
              {STAGES.map((stage) => {
                const stageLeads = filteredLeads.filter((l) => l.stage === stage.id);
                const total = stageLeads.reduce((s, l) => s + l.value, 0);
                const color = stageColor(stage);
                return (
                  <div
                    key={stage.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, stage.id)}
                    className="w-72 flex-shrink-0 flex flex-col bg-white/70 rounded-xl border border-black/5"
                  >
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
                          <td className="px-4 py-3 text-gray-500">{lead.company}</td>
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
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === "automacoes" && (
            <div className="h-full overflow-y-auto pulso-scroll p-5 space-y-3">
              {automations.map((auto) => {
                const stage = stageById(auto.trigger);
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
                          Quando lead entra em <span className="font-medium" style={{ color }}>{stage.name}</span> → {auto.action}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleAutomation(auto.id)}
                        className={`w-10 h-6 rounded-full relative transition-colors ${auto.enabled ? "" : "bg-gray-200"}`}
                        style={auto.enabled ? { backgroundColor: PRIMARY } : {}}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${auto.enabled ? "left-4.5" : "left-0.5"}`} style={{ left: auto.enabled ? "18px" : "2px" }} />
                      </button>
                      <button onClick={() => deleteAutomation(auto.id)} className="text-gray-300 hover:text-rose-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
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
              <Building2 size={12} /> {selectedLead.company}
              <span className="mx-1">·</span>
              <MessageCircle size={12} /> WhatsApp
            </div>

            <div className="flex-1 overflow-y-auto pulso-scroll p-4 space-y-3 bg-[#F5F6FA]">
              {selectedLead.messages.map((m) => {
                if (m.from === "system") {
                  return (
                    <div key={m.id} className="text-center text-[11px] text-gray-400 italic">
                      {m.text}
                    </div>
                  );
                }
                const mine = m.from === "me";
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${mine ? "text-white rounded-br-sm" : "bg-white text-gray-800 rounded-bl-sm border border-gray-100"}`}
                      style={mine ? { backgroundColor: PRIMARY } : {}}
                    >
                      <p>{m.text}</p>
                      <p className={`text-[10px] mt-1 ${mine ? "text-white/60" : "text-gray-400"}`}>{m.time}</p>
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
            <input value={newLeadForm.company} onChange={(e) => setNewLeadForm({ ...newLeadForm, company: e.target.value })} className="pulso-input" placeholder="Empresa" />
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
            <select value={newAutomationForm.trigger} onChange={(e) => setNewAutomationForm({ ...newAutomationForm, trigger: e.target.value })} className="pulso-input">
              {STAGES.filter((s) => !s.color).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Ação">
            <input value={newAutomationForm.actionText} onChange={(e) => setNewAutomationForm({ ...newAutomationForm, actionText: e.target.value })} className="pulso-input" placeholder="Ex: Enviar mensagem no WhatsApp" />
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

      <style>{`.pulso-input { width: 100%; padding: 8px 12px; font-size: 14px; border-radius: 8px; border: 1px solid #E5E7EB; outline: none; } .pulso-input:focus { border-color: ${PRIMARY}; }`}</style>
    </div>
  );
}

function SideBtn({ active, onClick, icon, title }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
      style={{
        backgroundColor: active ? "rgba(255,255,255,0.12)" : "transparent",
        color: active ? "#FFFFFF" : "rgba(255,255,255,0.5)",
      }}
    >
      {icon}
    </button>
  );
}

function LeadCard({ lead, color, stage, onDragStart, onClick }) {
  const lastMsg = lead.messages[lead.messages.length - 1];
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      onClick={onClick}
      className="bg-white rounded-lg shadow-sm p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="flex items-start justify-between">
        <p className="font-semibold text-sm">{lead.name}</p>
        {stage.temp === 1 ? <Flame size={13} style={{ color }} /> : stage.temp === 0 ? <Snowflake size={13} style={{ color }} /> : null}
      </div>
      <p className="text-xs text-gray-400 mt-0.5">{lead.company}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs font-semibold pulso-mono" style={{ color }}>{formatBRL(lead.value)}</span>
        <span className="text-[10px] text-gray-300 pulso-mono">{lead.phone.slice(-9)}</span>
      </div>
      {lastMsg && (
        <p className="text-[11px] text-gray-400 mt-2 italic truncate border-t border-gray-50 pt-2">
          {lastMsg.from === "me" ? "Você: " : ""}{lastMsg.text}
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
