import React, { useState, useEffect, useRef } from "react";
import {
  Zap, Search, Plus, X, Send, Phone, Building2,
  Trash2, MessageCircle, Loader2, Smartphone,
  Pencil, DollarSign, Edit2, Check, BarChart2, TrendingUp, TrendingDown,
  Activity, MessageSquare, ChevronRight, Calendar, FileText,
} from "lucide-react";
import FlowCanvas from "./FlowCanvas";
import AdminPanel from "./AdminPanel";
import Sidebar from "./components/Sidebar";
import Pipeline from "./components/Pipeline";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// Design tokens
const BG = "#08090C";
const SURFACE = "#0F1117";
const SURFACE2 = "#161821";
const PRIMARY = "#6366F1";
const SUCCESS = "#22C55E";
const DANGER = "#F43F5E";
const TEXT = "#F1F5F9";
const MUTED = "#94A3B8";
const SUBTLE = "#475569";
const BORDER = "rgba(255,255,255,0.06)";
const INK = TEXT;

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

function stageColor(stage) { return stage.color || heatColor(stage.temp); }
function stageById(id) { return STAGES.find((s) => s.id === id) || STAGES[0]; }

function formatBRL(v) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatPhone(raw) {
  if (!raw) return '';
  const clean = raw.replace(/\D/g, '');
  if (clean.startsWith('55') && clean.length === 13) return `+55 (${clean.slice(2,4)}) ${clean.slice(4,9)}-${clean.slice(9)}`;
  if (clean.startsWith('55') && clean.length === 12) return `+55 (${clean.slice(2,4)}) ${clean.slice(4,8)}-${clean.slice(8)}`;
  if (clean.length === 11) return `(${clean.slice(0,2)}) ${clean.slice(2,7)}-${clean.slice(7)}`;
  if (clean.length === 10) return `(${clean.slice(0,2)}) ${clean.slice(2,6)}-${clean.slice(6)}`;
  return clean ? `+${clean}` : '';
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const AUTO_REPLIES = [
  "Perfeito, obrigado pelo retorno!",
  "Combinado, vou verificar e te aviso.",
  "Show, pode me mandar mais detalhes?",
  "Legal, vamos marcar uma call essa semana?",
  "Entendi, muito obrigado!",
];

const sharedStyle = `
  .pulso-mono { font-family: 'JetBrains Mono', monospace; }
  @keyframes pulso-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
  @keyframes pulso-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .pulso-input {
    width: 100%;
    padding: 9px 12px;
    font-size: 13.5px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04);
    color: #F1F5F9;
    outline: none;
    font-family: 'Plus Jakarta Sans', sans-serif;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .pulso-input::placeholder { color: #475569; }
  .pulso-input:focus { border-color: rgba(99,102,241,0.55); box-shadow: 0 0 0 3px rgba(99,102,241,0.10); }
  .pulso-btn-primary {
    background: ${PRIMARY};
    color: #fff;
    border: none;
    border-radius: 8px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, opacity 0.15s ease;
  }
  .pulso-btn-primary:hover { background: #4F46E5; }
  .pulso-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
  .pulso-card {
    background: ${SURFACE};
    border: 1px solid ${BORDER};
    border-radius: 12px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .pulso-lead-card {
    background: ${SURFACE2};
    border: 1px solid ${BORDER};
    border-radius: 10px;
    cursor: grab;
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .pulso-lead-card:hover {
    transform: scale(1.02);
    border-color: rgba(255,255,255,0.12);
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  }
  .pulso-lead-card:active { cursor: grabbing; transform: scale(0.99); }
  .pulso-fade-up { animation: pulso-fade-up 0.35s ease both; }
  @media (prefers-reduced-motion: reduce) {
    .pulso-fade-up { animation: none; }
    .pulso-lead-card:hover { transform: none; }
    .pulso-btn-primary { transition: none; }
  }
`;

export default function PulsoCRM() {
  const [token, setToken] = useState(null);
  const [company, setCompany] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem('pulso_token');
    const savedCompany = localStorage.getItem('pulso_company');
    const savedIsAdmin = localStorage.getItem('pulso_is_admin') === 'true';
    if (savedToken && savedCompany) {
      try { setToken(savedToken); setCompany(JSON.parse(savedCompany)); setIsAdmin(savedIsAdmin); } catch {}
    }
  }, []);

  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ companyName: "", userName: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

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
  const [flowEditorOpen, setFlowEditorOpen] = useState(false);
  const [editingAuto, setEditingAuto] = useState(null);
  const [autoForm, setAutoForm] = useState({ name: '', trigger_type: 'new_lead', trigger_config: {}, actions: [{ type: 'send_whatsapp', message: 'Olá {nome}! Como posso ajudar?' }] });
  const [waStatus, setWaStatus] = useState('disconnected');
  const [waQr, setWaQr] = useState(null);
  const [waPolling, setWaPolling] = useState(false);
  const [editingLeadField, setEditingLeadField] = useState(null);
  const [settings, setSettings] = useState({ pixel_id: '', capi_token_set: false });
  const [settingsForm, setSettingsForm] = useState({ pixel_id: '', capi_token: '' });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: '', text: '' });
  const [templateSaving, setTemplateSaving] = useState(false);
  const csvInputRef = useRef(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [convLeadId, setConvLeadId] = useState(null);
  const idRef = useRef(1);
  const nextId = () => { idRef.current += 1; return idRef.current; };
  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;

  function addToast(text) {
    const id = nextId();
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    });
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) throw new Error(data.error || "Erro ao falar com o servidor");
    return data;
  }

  async function loadData() {
    setLoadingData(true);
    try {
      const [leadsData, automationsData] = await Promise.all([apiFetch("/leads"), apiFetch("/automations")]);
      setLeads(leadsData);
      setAutomations(automationsData);
    } catch (err) {
      addToast(`Não consegui carregar os dados: ${err.message}`);
    } finally {
      setLoadingData(false);
    }
  }

  function loadFbPixel(pixelId) {
    if (!pixelId || window._fbPixelLoaded) return;
    window._fbPixelLoaded = true;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
  }

  useEffect(() => {
    if (!token) return;
    loadData();
    fetch(`${API_URL}/whatsapp/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(data => { setWaStatus(data.status); if (data.qrDataUrl) setWaQr(data.qrDataUrl); }).catch(() => {});
    fetch(`${API_URL}/settings`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(data => { setSettings(data); setSettingsForm({ pixel_id: data.pixel_id || '', capi_token: '' }); if (data.pixel_id) loadFbPixel(data.pixel_id); }).catch(() => {});
    fetch(`${API_URL}/templates`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(data => { if (Array.isArray(data)) setTemplates(data); }).catch(() => {});
    const pollId = setInterval(() => {
      fetch(`${API_URL}/leads`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(data => {
          if (Array.isArray(data)) setLeads(prev => data.map(newLead => { const existing = prev.find(l => l.id === newLead.id); return { ...newLead, messages: existing?.messages || [] }; }));
        }).catch(() => {});
    }, 20000);
    return () => clearInterval(pollId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const activeChatLeadId = selectedLeadId || convLeadId;
  useEffect(() => {
    if (!token || !activeChatLeadId) return;
    const pollMessages = () => {
      fetch(`${API_URL}/leads/${activeChatLeadId}/messages`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(msgs => { if (Array.isArray(msgs)) setLeads(prev => prev.map(l => l.id === activeChatLeadId ? { ...l, messages: msgs } : l)); }).catch(() => {});
    };
    pollMessages();
    const id = setInterval(pollMessages, 5000);
    return () => clearInterval(id);
  }, [token, activeChatLeadId]);

  useEffect(() => {
    if (!token || !waPolling) return;
    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/whatsapp/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setWaStatus(data.status === 'disconnected' ? 'connecting' : data.status);
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
      const body = authMode === "login" ? { email: authForm.email, password: authForm.password } : authForm;
      const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível entrar");
      setToken(data.token); setCompany(data.company); setIsAdmin(data.isAdmin === true);
      localStorage.setItem('pulso_token', data.token);
      localStorage.setItem('pulso_company', JSON.stringify(data.company));
      localStorage.setItem('pulso_is_admin', data.isAdmin === true ? 'true' : 'false');
    } catch (err) {
      setAuthError(err.message === "Failed to fetch" ? "Não consegui falar com o backend. Ele está rodando em " + API_URL + " ?" : err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    setToken(null); setCompany(null); setLeads([]); setAutomations([]); setSelectedLeadId(null);
    localStorage.removeItem('pulso_token'); localStorage.removeItem('pulso_company'); localStorage.removeItem('pulso_is_admin');
    setIsAdmin(false);
  }

  async function moveLead(leadId, stageId) {
    const previous = leads;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: stageId } : l)));
    try {
      const data = await apiFetch(`/leads/${leadId}/stage`, { method: "PATCH", body: JSON.stringify({ stage: stageId }) });
      setLeads((prev) => prev.map((l) => (l.id === leadId ? data.lead : l)));
      if (data.automationTriggered) addToast(`Automação executada: ${data.automationTriggered}`);
    } catch (err) {
      setLeads(previous);
      addToast(`Não consegui mover o lead: ${err.message}`);
    }
  }

  function handleDragStart(e, leadId) { e.dataTransfer.setData("text/plain", String(leadId)); }
  function handleDrop(e, stageId) { e.preventDefault(); const leadId = Number(e.dataTransfer.getData("text/plain")); if (!leadId) return; moveLead(leadId, stageId); }

  async function sendMessage() {
    if (!chatInput.trim() || !selectedLeadId) return;
    const text = chatInput.trim(); const targetId = selectedLeadId; setChatInput("");
    try {
      const message = await apiFetch(`/leads/${targetId}/messages`, { method: "POST", body: JSON.stringify({ text }) });
      setLeads((prev) => prev.map((l) => (l.id === targetId ? { ...l, messages: [...l.messages, message] } : l)));
    } catch (err) { addToast(`Não consegui enviar a mensagem: ${err.message}`); }
  }

  async function addLead() {
    if (!newLeadForm.name.trim()) return;
    try {
      const lead = await apiFetch("/leads", { method: "POST", body: JSON.stringify({ name: newLeadForm.name, company_name: newLeadForm.company_name, phone: newLeadForm.phone, value: Number(newLeadForm.value) || 0 }) });
      setLeads((prev) => [lead, ...prev]);
      setNewLeadForm({ name: "", company_name: "", value: "", phone: "" });
      setShowNewLeadModal(false);
      addToast(`Lead "${lead.name}" criado`);
      if (window.fbq) window.fbq('track', 'Lead');
    } catch (err) { addToast(`Não consegui criar o lead: ${err.message}`); }
  }

  async function toggleAutomation(auto) {
    try {
      const updated = await apiFetch(`/automations/${auto.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !auto.enabled }) });
      setAutomations((prev) => prev.map((a) => (a.id === auto.id ? updated : a)));
    } catch (err) { addToast(`Não consegui atualizar a automação: ${err.message}`); }
  }

  async function deleteAutomation(id) {
    try {
      await apiFetch(`/automations/${id}`, { method: "DELETE" });
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) { addToast(`Não consegui apagar a automação: ${err.message}`); }
  }

  async function connectWhatsApp() {
    try {
      await fetch(`${API_URL}/whatsapp/connect`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      setWaPolling(true);
    } catch (err) { addToast('Erro ao iniciar conexão WhatsApp'); }
  }

  async function disconnectWhatsApp() {
    try {
      await fetch(`${API_URL}/whatsapp/disconnect`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      setWaStatus('disconnected'); setWaQr(null); setWaPolling(false);
    } catch {}
  }

  async function updateLead(leadId, fields) {
    try {
      const updated = await apiFetch(`/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(fields) });
      setLeads(prev => prev.map(l => l.id === leadId ? updated : l));
      addToast('Lead atualizado');
    } catch (err) { addToast(`Erro: ${err.message}`); }
  }

  async function deleteLead(leadId) {
    if (!window.confirm('Excluir este lead? Todas as mensagens serão apagadas.')) return;
    try {
      await apiFetch(`/leads/${leadId}`, { method: 'DELETE' });
      setLeads(prev => prev.filter(l => l.id !== leadId));
      setSelectedLeadId(null);
      addToast('Lead excluído');
    } catch (err) { addToast(`Erro: ${err.message}`); }
  }

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    }).filter(r => r.name);
  }

  function handleCSVFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { const rows = parseCSV(ev.target.result); setImportPreview({ rows, fileName: file.name }); };
    reader.readAsText(file, 'UTF-8'); e.target.value = '';
  }

  async function confirmImport() {
    if (!importPreview) return;
    setImporting(true);
    try {
      const data = await apiFetch('/leads/import', { method: 'POST', body: JSON.stringify({ leads: importPreview.rows }) });
      addToast(`${data.imported} leads importados com sucesso!`);
      setImportPreview(null); await loadData();
    } catch (err) { addToast(`Erro na importação: ${err.message}`); } finally { setImporting(false); }
  }

  async function saveTemplate() {
    if (!templateForm.name.trim() || !templateForm.text.trim()) return;
    setTemplateSaving(true);
    try {
      const created = await apiFetch('/templates', { method: 'POST', body: JSON.stringify({ name: templateForm.name, text: templateForm.text }) });
      setTemplates(prev => [...prev, created]); setTemplateForm({ name: '', text: '' }); addToast('Template salvo!');
    } catch (err) { addToast(`Erro: ${err.message}`); } finally { setTemplateSaving(false); }
  }

  async function deleteTemplate(id) {
    try { await apiFetch(`/templates/${id}`, { method: 'DELETE' }); setTemplates(prev => prev.filter(t => t.id !== id)); }
    catch (err) { addToast(`Erro: ${err.message}`); }
  }

  function openNewAutomation() { setEditingAuto(null); setAutoForm({ name: '', trigger_type: 'new_lead', trigger_config: {}, actions: [] }); setFlowEditorOpen(true); }
  function openEditAutomation(auto) { setEditingAuto(auto); setAutoForm({ name: auto.name, trigger_type: auto.trigger_type, trigger_config: auto.trigger_config || {}, actions: auto.actions || [] }); setFlowEditorOpen(true); }

  const filteredLeads = leads.filter((l) => {
    const q = searchTerm.toLowerCase();
    return l.name.toLowerCase().includes(q) || (l.company_name || "").toLowerCase().includes(q);
  });

  const titles = {
    dashboard: ["Dashboard", "Visão geral do seu desempenho e atividades"],
    pipeline: ["Pipeline de Vendas", "Arraste os cards entre as etapas do funil"],
    contatos: ["Contatos", "Todos os leads e clientes em um só lugar"],
    automacoes: ["Automações", "Regras que disparam ações sozinhas"],
    conversas: ["Conversas", "Acompanhe as conversas com seus leads"],
    whatsapp: ["WhatsApp", "Conecte e gerencie sua conta WhatsApp"],
    configuracoes: ["Configurações", "Pixel, API de Conversões e outras integrações"],
    clientes: ["Clientes", "Gerencie todas as empresas da plataforma"],
  };

  // ---------- Login screen ----------
  if (!token) {
    return (
      <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <style>{sharedStyle}</style>

        {/* Ambient glow */}
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)' }} />
        </div>

        <div style={{ width: '100%', maxWidth: 380, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '36px 32px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 64px rgba(0,0,0,0.6)', position: 'relative' }}>
          {/* Logo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 12, boxShadow: 'none', position: 'relative' }}>
              P
              <span style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: '50%', background: '#FB923C', animation: 'pulso-pulse 2s ease-in-out infinite', border: `2px solid ${SURFACE}` }} />
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: 0 }}>Pulso CRM</h1>
            <p style={{ fontSize: 13, color: SUBTLE, margin: '4px 0 0' }}>{authMode === "login" ? "Entre na sua conta" : "Crie a conta da sua empresa"}</p>
          </div>

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {authMode === "signup" && (
              <>
                <Field label="Nome da empresa">
                  <input required className="pulso-input" placeholder="Ex: Agência Digital" value={authForm.companyName} onChange={(e) => setAuthForm({ ...authForm, companyName: e.target.value })} />
                </Field>
                <Field label="Seu nome">
                  <input required className="pulso-input" placeholder="João Silva" value={authForm.userName} onChange={(e) => setAuthForm({ ...authForm, userName: e.target.value })} />
                </Field>
              </>
            )}
            <Field label="Email">
              <input required type="email" className="pulso-input" placeholder="voce@empresa.com" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} />
            </Field>
            <Field label="Senha">
              <input required type="password" className="pulso-input" placeholder="••••••••" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} />
            </Field>

            {authError && <p style={{ fontSize: 12, color: DANGER, margin: 0 }}>{authError}</p>}

            <button disabled={authLoading} type="submit" style={{ marginTop: 4, width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 0 20px rgba(99,102,241,0.3)', opacity: authLoading ? 0.7 : 1, transition: 'opacity 0.15s' }}>
              {authLoading && <Loader2 size={14} className="animate-spin" />}
              {authMode === "login" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <button onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }} style={{ width: '100%', textAlign: 'center', fontSize: 12, color: SUBTLE, marginTop: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {authMode === "login" ? "Não tem conta? Cadastre sua empresa" : "Já tem conta? Entrar"}
          </button>

          <p style={{ fontSize: 11, color: '#334155', textAlign: 'center', marginTop: 12 }}>
            Backend em <span className="pulso-mono">{API_URL}</span>
          </p>
        </div>
      </div>
    );
  }

  // ---------- App principal ----------
  const currentTitle = titles[view] || ["", ""];

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', background: BG, color: TEXT, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{sharedStyle}</style>

      {/* Sidebar */}
      <Sidebar
        view={view}
        setView={setView}
        isAdmin={isAdmin}
        onLogout={logout}
        companyName={company?.name}
        onConversasClick={() => { setView("conversas"); setConvLeadId(null); }}
      />

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <header style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: `1px solid ${BORDER}`, background: SURFACE, flexShrink: 0 }}>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: TEXT }}>{currentTitle[0]}</h1>
            <p style={{ fontSize: 11, color: SUBTLE, margin: 0 }}>{currentTitle[1]}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!["automacoes","configuracoes","conversas","dashboard","clientes"].includes(view) && (
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: SUBTLE, pointerEvents: 'none' }} />
                <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar lead..." style={{ paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7, fontSize: 13, borderRadius: 8, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.04)', color: TEXT, outline: 'none', width: 200, fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
              </div>
            )}
            {(view === "pipeline" || view === "contatos") && (
              <>
                <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVFile} />
                <button onClick={() => csvInputRef.current?.click()} style={{ padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.04)', color: MUTED, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Importar CSV
                </button>
                <button onClick={() => setShowNewLeadModal(true)} style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Plus Jakarta Sans', sans-serif", boxShadow: 'none' }}>
                  <Plus size={14} strokeWidth={2} /> Novo Lead
                </button>
              </>
            )}
            {view === "automacoes" && (
              <button onClick={openNewAutomation} style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                <Plus size={14} strokeWidth={2} /> Nova Automação
              </button>
            )}
            {view === "conversas" && (
              <button onClick={() => setShowNewLeadModal(true)} style={{ padding: '7px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                <Plus size={14} strokeWidth={2} /> Novo Lead
              </button>
            )}
          </div>
        </header>

        <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {loadingData && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,9,12,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, backdropFilter: 'blur(4px)' }}>
              <Loader2 size={22} className="animate-spin" style={{ color: PRIMARY }} />
            </div>
          )}

          {/* Dashboard */}
          {view === "dashboard" && <Dashboard leads={leads} />}

          {/* Conversas */}
          {view === "conversas" && (
            <div style={{ height: '100%', display: 'flex' }}>
              {/* Lista */}
              <div style={{ width: 300, flexShrink: 0, borderRight: `1px solid ${BORDER}`, overflowY: 'auto', background: SURFACE }}>
                <div style={{ padding: 12, borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: SUBTLE }} />
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Pesquisar..." style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7, fontSize: 13, borderRadius: 8, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.04)', color: TEXT, outline: 'none', boxSizing: 'border-box', fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
                  </div>
                </div>
                {leads.filter(l => l.message_count > 0 && (!searchTerm || l.name.toLowerCase().includes(searchTerm.toLowerCase()))).sort((a, b) => (b.message_count || 0) - (a.message_count || 0)).map(lead => {
                  const stage = stageById(lead.stage);
                  const color = stageColor(stage);
                  const isActive = convLeadId === lead.id;
                  return (
                    <div key={lead.id} onClick={() => setConvLeadId(lead.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: `1px solid ${BORDER}`, borderLeft: `2px solid ${isActive ? PRIMARY : 'transparent'}`, background: isActive ? 'rgba(99,102,241,0.08)' : 'transparent', transition: 'background 0.15s' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0, background: color }}>
                        {lead.name.split(' ').map(p => p[0]).slice(0,2).join('')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <p style={{ fontSize: 13, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: TEXT }}>{lead.name}</p>
                          <span style={{ fontSize: 10, color: SUBTLE, flexShrink: 0, marginLeft: 4 }}>{formatDate(lead.created_at)}</span>
                        </div>
                        <p style={{ fontSize: 11, color: SUBTLE, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.last_message || 'Sem mensagens'}</p>
                        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: color + '22', color }}>{stage.name}</span>
                          <span style={{ fontSize: 10, color: '#334155' }}>{lead.message_count} msg</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {leads.filter(l => l.message_count > 0).length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 240, textAlign: 'center', padding: '0 24px' }}>
                    <MessageSquare size={32} style={{ color: SUBTLE, marginBottom: 12 }} />
                    <p style={{ fontSize: 13, fontWeight: 600, color: MUTED, margin: 0 }}>Sem conversas ainda</p>
                    <p style={{ fontSize: 12, color: SUBTLE, margin: '4px 0 0' }}>Conversas via WhatsApp aparecem aqui</p>
                  </div>
                )}
              </div>

              {/* Chat panel */}
              {convLeadId ? (() => {
                const lead = leads.find(l => l.id === convLeadId);
                if (!lead) return null;
                return (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, background: SURFACE, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                          {lead.name.split(' ').map(p => p[0]).slice(0,2).join('')}
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: TEXT }}>{lead.name}</p>
                          <p style={{ fontSize: 11, color: SUBTLE, margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Phone size={10} /> {formatPhone(lead.phone) || 'Sem telefone'}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, background: stageColor(stageById(lead.stage)) + '22', color: stageColor(stageById(lead.stage)) }}>{stageById(lead.stage).name}</span>
                        <button onClick={() => setSelectedLeadId(lead.id)} style={{ fontSize: 11, color: SUBTLE, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          Ver lead <ChevronRight size={11} />
                        </button>
                      </div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: BG }}>
                      {(lead.messages || []).map(m => {
                        if (m.from_type === 'system') return <div key={m.id} style={{ textAlign: 'center', fontSize: 11, color: SUBTLE, fontStyle: 'italic' }}>{m.text}</div>;
                        const mine = m.from_type === 'me';
                        return (
                          <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                            <div style={{ maxWidth: '70%', borderRadius: 12, padding: '8px 12px', fontSize: 13, background: mine ? PRIMARY : SURFACE, color: mine ? '#fff' : TEXT, border: mine ? 'none' : `1px solid ${BORDER}`, borderBottomRightRadius: mine ? 3 : 12, borderBottomLeftRadius: mine ? 12 : 3 }}>
                              <p style={{ margin: 0 }}>{m.text}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {templates.length > 0 && (
                      <div style={{ padding: '8px 12px 0', background: SURFACE, position: 'relative' }}>
                        <button onClick={() => setShowTemplatesDropdown(v => !v)} style={{ fontSize: 11, color: SUBTLE, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <FileText size={11} /> Templates {showTemplatesDropdown ? '▲' : '▼'}
                        </button>
                        {showTemplatesDropdown && (
                          <div style={{ position: 'absolute', bottom: 32, left: 12, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 10, zIndex: 10, width: 280, maxHeight: 180, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                            {templates.map(t => (
                              <button key={t.id} onClick={() => { setChatInput(t.text); setShowTemplatesDropdown(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer' }}>
                                <p style={{ fontSize: 12, fontWeight: 600, color: TEXT, margin: 0 }}>{t.name}</p>
                                <p style={{ fontSize: 11, color: SUBTLE, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.text}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ padding: 12, borderTop: `1px solid ${BORDER}`, background: SURFACE, display: 'flex', gap: 8 }}>
                      <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (!chatInput.trim() || !convLeadId) return;
                          const text = chatInput.trim(); setChatInput('');
                          apiFetch(`/leads/${convLeadId}/messages`, { method: 'POST', body: JSON.stringify({ text }) })
                            .then(msg => setLeads(prev => prev.map(l => l.id === convLeadId ? { ...l, messages: [...(l.messages || []), msg] } : l)))
                            .catch(err => addToast(`Erro: ${err.message}`));
                        }
                      }} placeholder="Escreva uma mensagem..." className="pulso-input" style={{ flex: 1 }} />
                      <button onClick={() => {
                        if (!chatInput.trim() || !convLeadId) return;
                        const text = chatInput.trim(); setChatInput('');
                        apiFetch(`/leads/${convLeadId}/messages`, { method: 'POST', body: JSON.stringify({ text }) })
                          .then(msg => setLeads(prev => prev.map(l => l.id === convLeadId ? { ...l, messages: [...(l.messages || []), msg] } : l)))
                          .catch(err => addToast(`Erro: ${err.message}`));
                      }} style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        <Send size={14} />
                      </button>
                    </div>
                  </div>
                );
              })() : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: BG, textAlign: 'center' }}>
                  <MessageSquare size={48} style={{ color: '#1E293B', marginBottom: 16 }} />
                  <p style={{ fontSize: 15, fontWeight: 700, color: MUTED, margin: 0 }}>Conversas</p>
                  <p style={{ fontSize: 13, color: SUBTLE, margin: '6px 0 0' }}>Selecione uma conversa para começar</p>
                </div>
              )}
            </div>
          )}

          {/* Pipeline */}
          {view === "pipeline" && (
            <Pipeline
              leads={filteredLeads}
              onLeadClick={(id) => setSelectedLeadId(id)}
              onOpenConv={(id) => { setConvLeadId(id); setView('conversas'); }}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
          )}

          {/* Contatos */}
          {view === "contatos" && (
            <div style={{ height: '100%', overflowY: 'auto', padding: 16 }}>
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.02)' }}>
                      {['Nome','Contato','Tags','Valor','Etapa','Criado'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: SUBTLE, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => {
                      const stage = stageById(lead.stage);
                      const color = stageColor(stage);
                      const initials = lead.name.split(' ').map(p => p[0]).slice(0,2).join('');
                      return (
                        <tr key={lead.id} onClick={() => setSelectedLeadId(lead.id)} style={{ borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', transition: 'background 0.1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 30, height: 30, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                              <div>
                                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: TEXT }}>{lead.name}</p>
                                <p style={{ fontSize: 11, color: SUBTLE, margin: 0 }}>Ticket: {formatBRL(lead.value)}</p>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', color: MUTED }} onClick={e => e.stopPropagation()}>
                            {editingLeadField?.field === 'phone' && editingLeadField?.id === lead.id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input type="text" autoFocus className="pulso-input" style={{ fontSize: 12, width: 160 }} defaultValue={(lead.phone || "").replace(/\D/g, '')}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { updateLead(lead.id, { phone: e.target.value }); setEditingLeadField(null); } if (e.key === 'Escape') setEditingLeadField(null); }} />
                                <button onClick={(e) => { updateLead(lead.id, { phone: e.currentTarget.previousSibling.value }); setEditingLeadField(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: SUCCESS }}><Check size={13} /></button>
                              </div>
                            ) : (
                              <span onClick={() => setEditingLeadField({ field: 'phone', id: lead.id })} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                <Phone size={12} style={{ color: SUBTLE }} />
                                {formatPhone(lead.phone) || <span style={{ color: SUBTLE, fontStyle: 'italic', fontSize: 11 }}>clique para editar</span>}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {(lead.tags || []).map(tag => <span key={tag} style={{ padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 600, background: color + '22', color }}>{tag}</span>)}
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px' }} className="pulso-mono">{formatBRL(lead.value)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: color + '22', color }}>{stage.name}</span>
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 11, color: SUBTLE }}>{formatDate(lead.created_at)}</td>
                        </tr>
                      );
                    })}
                    {filteredLeads.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: SUBTLE, fontSize: 13, padding: '32px 0' }}>Nenhum lead ainda. Crie o primeiro com "Novo Lead".</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Automações */}
          {view === "automacoes" && (
            <div style={{ height: '100%', overflowY: 'auto', padding: 20 }}>
              {automations.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, textAlign: 'center' }}>
                  <div style={{ width: 60, height: 60, borderRadius: 16, background: 'rgba(99,102,241,0.12)', border: `1px solid rgba(99,102,241,0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Zap size={26} strokeWidth={1.5} style={{ color: PRIMARY }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: TEXT, margin: 0 }}>Nenhuma automação ainda</p>
                    <p style={{ fontSize: 13, color: SUBTLE, margin: '4px 0 0' }}>Crie sua primeira automação para trabalhar no piloto automático</p>
                  </div>
                  <button onClick={openNewAutomation} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    <Plus size={14} /> Criar primeira automação
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                  {automations.map((auto) => <AutomationCard key={auto.id} auto={auto} onToggle={() => toggleAutomation(auto)} onDelete={() => deleteAutomation(auto.id)} onEdit={() => openEditAutomation(auto)} />)}
                </div>
              )}
            </div>
          )}

          {/* WhatsApp */}
          {view === 'whatsapp' && (
            <div style={{ padding: 32, maxWidth: 460, margin: '0 auto' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: TEXT }}>WhatsApp</h2>
              <p style={{ color: SUBTLE, marginBottom: 28, fontSize: 13 }}>Conecte seu WhatsApp para enviar e receber mensagens dos leads diretamente no CRM.</p>

              {waStatus === 'disconnected' && (
                <button onClick={connectWhatsApp} style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  <Smartphone size={16} /> Conectar WhatsApp
                </button>
              )}

              {waStatus === 'qr' && waQr && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ marginBottom: 14, fontWeight: 600, color: TEXT }}>Escaneie o QR Code com seu WhatsApp</p>
                  <img src={waQr} alt="QR Code WhatsApp" style={{ width: 240, height: 240, borderRadius: 12, border: `1px solid ${BORDER}` }} />
                  <p style={{ marginTop: 10, fontSize: 12, color: SUBTLE }}>Atualizando automaticamente...</p>
                </div>
              )}

              {waStatus === 'connecting' && (
                <div style={{ color: MUTED, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={18} className="animate-spin" /> Conectando...
                </div>
              )}

              {waStatus === 'open' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px 16px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: SUCCESS, display: 'inline-block', boxShadow: `0 0 8px ${SUCCESS}` }} />
                    <span style={{ fontWeight: 600, color: SUCCESS, fontSize: 14 }}>WhatsApp conectado!</span>
                  </div>
                  <button onClick={disconnectWhatsApp} style={{ background: 'rgba(244,63,94,0.1)', color: DANGER, border: `1px solid rgba(244,63,94,0.2)`, borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Desconectar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Configurações */}
          {view === 'configuracoes' && (
            <div style={{ padding: 28, maxWidth: 520, margin: '0 auto', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: TEXT }}>Configurações</h2>
              <p style={{ color: SUBTLE, marginBottom: 24, fontSize: 13 }}>Integre seu Pixel do Facebook para rastrear leads automaticamente.</p>

              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 22, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: TEXT }}>Meta Pixel + Conversions API</h3>
                <p style={{ fontSize: 12, color: SUBTLE, marginBottom: 18 }}>Quando um lead é criado (manual ou via WhatsApp), disparamos automaticamente um evento <strong style={{ color: MUTED }}>Lead</strong> para o seu Pixel.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Field label="Pixel ID">
                    <input type="text" placeholder="Ex: 1234567890123456" value={settingsForm.pixel_id} onChange={e => setSettingsForm(f => ({ ...f, pixel_id: e.target.value }))} className="pulso-input" />
                  </Field>
                  <Field label={<span>Token da API de Conversões {settings.capi_token_set && <span style={{ marginLeft: 8, color: SUCCESS, fontWeight: 400 }}>✓ configurado</span>}</span>}>
                    <input type="password" placeholder={settings.capi_token_set ? '••••••••••••• (deixe em branco para manter)' : 'Cole o token aqui'} value={settingsForm.capi_token} onChange={e => setSettingsForm(f => ({ ...f, capi_token: e.target.value }))} className="pulso-input" />
                    <p style={{ fontSize: 11, color: SUBTLE, marginTop: 4 }}>Encontre em: Gerenciador de Eventos → Configurações → API de Conversões → Gerar token de acesso</p>
                  </Field>
                  <button onClick={async () => {
                    setSettingsSaving(true);
                    try {
                      const body = { pixel_id: settingsForm.pixel_id };
                      if (settingsForm.capi_token) body.capi_token = settingsForm.capi_token;
                      const updated = await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(body) });
                      setSettings(updated); setSettingsForm(f => ({ ...f, capi_token: '' }));
                      if (updated.pixel_id) loadFbPixel(updated.pixel_id);
                      addToast('Configurações salvas!');
                    } catch (err) { addToast(`Erro: ${err.message}`); } finally { setSettingsSaving(false); }
                  }} disabled={settingsSaving} style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: settingsSaving ? 0.7 : 1, fontFamily: "'Plus Jakarta Sans', sans-serif", alignSelf: 'flex-start' }}>
                    {settingsSaving ? 'Salvando...' : 'Salvar configurações'}
                  </button>
                </div>
              </div>

              {settings.pixel_id && (
                <div style={{ marginTop: 12, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: SUCCESS }}>
                  ✓ Pixel <strong>{settings.pixel_id}</strong> ativo — eventos <code>Lead</code> sendo disparados ao criar contatos.
                </div>
              )}

              {/* Templates */}
              <div style={{ marginTop: 28 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: TEXT }}>Templates de Mensagem</h3>
                <p style={{ fontSize: 12, color: SUBTLE, marginBottom: 14 }}>Respostas rápidas disponíveis no chat de cada lead.</p>
                <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {templates.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: `1px solid ${BORDER}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: TEXT, marginBottom: 2 }}>{t.name}</p>
                        <p style={{ fontSize: 11, color: SUBTLE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.text}</p>
                      </div>
                      <button onClick={() => deleteTemplate(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: SUBTLE, flexShrink: 0 }}><X size={14} /></button>
                    </div>
                  ))}
                  {templates.length === 0 && <p style={{ fontSize: 12, color: SUBTLE, textAlign: 'center' }}>Nenhum template ainda.</p>}
                  <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input placeholder="Nome do template" value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} className="pulso-input" />
                    <textarea placeholder="Texto da mensagem... use {nome}, {empresa}" value={templateForm.text} onChange={e => setTemplateForm(f => ({ ...f, text: e.target.value }))} rows={3} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', resize: 'vertical', background: 'rgba(255,255,255,0.04)', color: TEXT, fontFamily: "'Plus Jakarta Sans', sans-serif" }} />
                    <button onClick={saveTemplate} disabled={templateSaving || !templateForm.name || !templateForm.text} style={{ background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (templateSaving || !templateForm.name || !templateForm.text) ? 0.5 : 1, alignSelf: 'flex-start', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      {templateSaving ? 'Salvando...' : '+ Adicionar template'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Lead drawer */}
      {selectedLead && view !== 'conversas' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setSelectedLeadId(null)} />
          <div style={{ position: 'relative', width: 380, height: '100%', background: SURFACE, borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', boxShadow: '-24px 0 64px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                    {selectedLead.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: TEXT }}>{selectedLead.name}</p>
                    {editingLeadField?.field === 'phone' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <input type="text" autoFocus className="pulso-input" style={{ fontSize: 12, width: 140 }} defaultValue={(selectedLead.phone || "").replace(/@.*$/, "")}
                          onKeyDown={(e) => { if (e.key === 'Enter') { updateLead(selectedLead.id, { phone: e.target.value }); setEditingLeadField(null); } if (e.key === 'Escape') setEditingLeadField(null); }} />
                        <button onClick={(e) => { updateLead(selectedLead.id, { phone: e.currentTarget.previousSibling.value }); setEditingLeadField(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: SUCCESS }}><Check size={13} /></button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingLeadField({ field: 'phone' })} style={{ fontSize: 11, color: SUBTLE, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}>
                        <Phone size={10} /> {formatPhone(selectedLead.phone) || 'Sem telefone'}
                        <Edit2 size={9} style={{ opacity: 0.5 }} />
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => deleteLead(selectedLead.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: SUBTLE, padding: 6, borderRadius: 6 }} title="Excluir lead">
                    <Trash2 size={14} />
                  </button>
                  <button onClick={() => setSelectedLeadId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: SUBTLE, padding: 6, borderRadius: 6 }}>
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <DollarSign size={12} style={{ color: SUBTLE }} />
                {editingLeadField?.field === 'value' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    <input type="number" autoFocus className="pulso-input" style={{ flex: 1, fontSize: 13 }} defaultValue={selectedLead.value || 0}
                      onKeyDown={(e) => { if (e.key === 'Enter') { updateLead(selectedLead.id, { value: Number(e.target.value) }); setEditingLeadField(null); } if (e.key === 'Escape') setEditingLeadField(null); }} />
                    <button onClick={(e) => { const input = e.currentTarget.previousSibling; updateLead(selectedLead.id, { value: Number(input.value) }); setEditingLeadField(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: SUCCESS }}><Check size={14} /></button>
                  </div>
                ) : (
                  <button onClick={() => setEditingLeadField({ field: 'value', value: selectedLead.value })} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <span className="pulso-mono" style={{ fontSize: 14, fontWeight: 700, color: PRIMARY }}>{formatBRL(selectedLead.value)}</span>
                    <Edit2 size={10} style={{ color: SUBTLE, opacity: 0.6 }} />
                  </button>
                )}
              </div>
            </div>

            <div style={{ padding: '8px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: SUBTLE }}>
              <Building2 size={11} /> {selectedLead.company_name}
              <span style={{ margin: '0 4px' }}>·</span>
              <MessageCircle size={11} /> WhatsApp
            </div>

            {/* Tags */}
            <div style={{ padding: '8px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {(selectedLead.tags || []).map(tag => (
                <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: PRIMARY + '22', color: '#818CF8' }}>
                  {tag}
                  <button onClick={() => updateLead(selectedLead.id, { tags: (selectedLead.tags || []).filter(t => t !== tag) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}>×</button>
                </span>
              ))}
              <TagInput onAdd={tag => { const current = selectedLead.tags || []; if (!current.includes(tag)) updateLead(selectedLead.id, { tags: [...current, tag] }); }} />
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: BG }}>
              {selectedLead.messages.map((m) => {
                if (m.from_type === "system") return <div key={m.id} style={{ textAlign: 'center', fontSize: 11, color: SUBTLE, fontStyle: 'italic' }}>{m.text}</div>;
                const mine = m.from_type === "me";
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '75%', borderRadius: 12, padding: '8px 12px', fontSize: 13, background: mine ? PRIMARY : SURFACE, color: mine ? '#fff' : TEXT, border: mine ? 'none' : `1px solid ${BORDER}`, borderBottomRightRadius: mine ? 3 : 12, borderBottomLeftRadius: mine ? 12 : 3 }}>
                      <p style={{ margin: 0 }}>{m.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Templates */}
            {templates.length > 0 && (
              <div style={{ padding: '8px 12px 0', background: SURFACE, position: 'relative' }}>
                <button onClick={() => setShowTemplatesDropdown(v => !v)} style={{ fontSize: 11, color: SUBTLE, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FileText size={11} /> Templates {showTemplatesDropdown ? '▲' : '▼'}
                </button>
                {showTemplatesDropdown && (
                  <div style={{ position: 'absolute', bottom: 32, left: 12, background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 10, zIndex: 10, width: 280, maxHeight: 180, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                    {templates.map(t => (
                      <button key={t.id} onClick={() => { setChatInput(t.text); setShowTemplatesDropdown(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer' }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: TEXT, margin: 0 }}>{t.name}</p>
                        <p style={{ fontSize: 11, color: SUBTLE, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.text}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ padding: 12, borderTop: `1px solid ${BORDER}`, background: SURFACE, display: 'flex', gap: 8 }}>
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Escreva uma mensagem..." className="pulso-input" style={{ flex: 1 }} />
              <button onClick={sendMessage} style={{ width: 36, height: 36, borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <Send size={14} />
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
          <button onClick={addLead} style={{ width: '100%', marginTop: 6, padding: '10px 0', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Criar lead
          </button>
        </Modal>
      )}

      {/* CSV preview modal */}
      {importPreview && (
        <Modal onClose={() => setImportPreview(null)} title={`Importar CSV — ${importPreview.fileName}`}>
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>{importPreview.rows.length} leads encontrados. Colunas aceitas: <span className="pulso-mono" style={{ fontSize: 12 }}>name, company_name, phone, value</span></p>
          <div style={{ maxHeight: 160, overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            {importPreview.rows.slice(0, 8).map((r, i) => (
              <div key={i} style={{ padding: '6px 10px', fontSize: 12, color: TEXT, display: 'flex', gap: 12, borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontWeight: 600, width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={{ color: SUBTLE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.phone}</span>
              </div>
            ))}
            {importPreview.rows.length > 8 && <p style={{ padding: '6px 10px', fontSize: 12, color: SUBTLE, margin: 0 }}>... e mais {importPreview.rows.length - 8}</p>}
          </div>
          <button onClick={confirmImport} disabled={importing} style={{ width: '100%', marginTop: 6, padding: '10px 0', borderRadius: 8, border: 'none', background: PRIMARY, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: importing ? 0.7 : 1, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {importing && <Loader2 size={14} className="animate-spin" />}
            {importing ? 'Importando...' : `Importar ${importPreview.rows.length} leads`}
          </button>
        </Modal>
      )}

      {/* Flow Editor */}
      {flowEditorOpen && (
        <FlowCanvas
          name={autoForm.name}
          onNameChange={name => setAutoForm(f => ({ ...f, name }))}
          initialNodes={editingAuto?.flow_nodes || []}
          initialEdges={editingAuto?.flow_edges || []}
          onSave={async ({ trigger_type, trigger_config, actions, nodes, edges }) => {
            const autoData = { name: autoForm.name || 'Nova automação', trigger_type, trigger_config, actions, flow_nodes: nodes, flow_edges: edges };
            try {
              if (editingAuto) {
                const updated = await apiFetch(`/automations/${editingAuto.id}`, { method: 'PUT', body: JSON.stringify(autoData) });
                setAutomations(prev => prev.map(a => a.id === editingAuto.id ? updated : a));
                setFlowEditorOpen(false); addToast(`Automação "${updated.name}" atualizada`);
              } else {
                const auto = await apiFetch('/automations', { method: 'POST', body: JSON.stringify(autoData) });
                setAutomations(prev => [...prev, auto]);
                setFlowEditorOpen(false); addToast(`Automação "${auto.name}" criada`);
              }
            } catch (err) { addToast(`Erro: ${err.message}`); }
          }}
          onClose={() => setFlowEditorOpen(false)}
        />
      )}

      {/* Admin: Clientes */}
      {view === 'clientes' && isAdmin && (
        <AdminPanel
          token={token}
          apiUrl={API_URL}
          onEntrarComoCliente={(clienteToken, clienteCompany) => {
            setToken(clienteToken); setCompany(clienteCompany); setIsAdmin(false);
            localStorage.setItem('pulso_token', clienteToken);
            localStorage.setItem('pulso_company', JSON.stringify(clienteCompany));
            localStorage.setItem('pulso_is_admin', 'false');
            setView('pipeline');
          }}
        />
      )}

      {/* Toasts */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 50 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${PRIMARY}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, maxWidth: 300, color: TEXT, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            <Zap size={13} style={{ color: PRIMARY, flexShrink: 0 }} />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard({ leads }) {
  const SUCCESS_D = "#22C55E";
  const DANGER_D = "#F43F5E";
  const total = leads.reduce((s, l) => s + Number(l.value || 0), 0);
  const ganhos = leads.filter(l => l.stage === 'ganho');
  const perdidos = leads.filter(l => l.stage === 'perdido');
  const abertos = leads.filter(l => !['ganho','perdido'].includes(l.stage));
  const totalGanho = ganhos.reduce((s, l) => s + Number(l.value || 0), 0);
  const totalPerdido = perdidos.reduce((s, l) => s + Number(l.value || 0), 0);
  const totalAberto = abertos.reduce((s, l) => s + Number(l.value || 0), 0);

  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
  const dayData = days.map(d => {
    const ds = d.toISOString().slice(0, 10);
    const count = leads.filter(l => l.created_at && l.created_at.slice(0, 10) === ds).length;
    const value = leads.filter(l => l.created_at && l.created_at.slice(0, 10) === ds).reduce((s, l) => s + Number(l.value || 0), 0);
    return { label: `${d.getDate()}/${d.getMonth() + 1}`, count, value };
  });
  const maxVal = Math.max(...dayData.map(d => d.value), 1);
  const W = 480, H = 120, PAD = 10;
  const pts = dayData.map((d, i) => ({ x: PAD + (i / (dayData.length - 1)) * (W - PAD * 2), y: H - PAD - (d.value / maxVal) * (H - PAD * 2) }));
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const kpis = [
    { label: 'Total criados', value: formatBRL(total), sub: `${leads.length} negócios`, color: PRIMARY, icon: <Activity size={18} strokeWidth={1.5} style={{ color: PRIMARY }} /> },
    { label: 'Total ganhos', value: formatBRL(totalGanho), sub: `${ganhos.length} negócios`, color: SUCCESS_D, icon: <TrendingUp size={18} strokeWidth={1.5} style={{ color: SUCCESS_D }} /> },
    { label: 'Total perdidos', value: formatBRL(totalPerdido), sub: `${perdidos.length} negócios`, color: DANGER_D, icon: <TrendingDown size={18} strokeWidth={1.5} style={{ color: DANGER_D }} /> },
    { label: 'Total em aberto', value: formatBRL(totalAberto), sub: `${abertos.length} negócios`, color: '#F59E0B', icon: <Activity size={18} strokeWidth={1.5} style={{ color: '#F59E0B' }} /> },
    { label: 'Total negócios', value: formatBRL(total), sub: `${leads.length} negócios`, color: '#38BDF8', icon: <BarChart2 size={18} strokeWidth={1.5} style={{ color: '#38BDF8' }} /> },
  ];

  const topLeads = [...leads].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 5);

  const convRate = leads.length > 0 ? Math.round((ganhos.length / leads.length) * 100) : 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 20 }}>
      {/* Bento grid */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(4, 1fr)', gridAutoRows: 'auto', marginBottom: 12 }}>
        {kpis.slice(0,4).map((k, i) => (
          <div key={i} className="pulso-card pulso-fade-up" style={{ padding: '16px', animationDelay: `${i * 0.06}s`, borderTop: `2px solid ${k.color}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 11, color: SUBTLE, fontWeight: 500, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</p>
              {k.icon}
            </div>
            <p className="pulso-mono" style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 2px', color: TEXT }}>{k.value}</p>
            <p style={{ fontSize: 11, color: SUBTLE, margin: 0 }}>{k.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr minmax(220px, 280px)' }}>
        {/* Gráfico de linha */}
        <div className="pulso-card pulso-fade-up" style={{ padding: 18, animationDelay: '0.25s' }}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: TEXT }}>Dados diários</p>
          <p style={{ fontSize: 11, color: SUBTLE, margin: '0 0 14px' }}>Valor de leads — últimos 7 dias</p>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 100 }}>
            {[0.25, 0.5, 0.75, 1].map(f => (
              <line key={f} x1={PAD} y1={H - PAD - f * (H - PAD * 2)} x2={W - PAD} y2={H - PAD - f * (H - PAD * 2)} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            ))}
            <path d={`${pathD} L${pts[pts.length-1].x},${H - PAD} L${pts[0].x},${H - PAD} Z`} fill={PRIMARY + '14'} />
            <path d={pathD} fill="none" stroke={PRIMARY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill={PRIMARY} stroke={SURFACE} strokeWidth="1.5" />)}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, padding: '0 6px' }}>
            {dayData.map((d, i) => <span key={i} style={{ fontSize: 9, color: SUBTLE }}>{d.label}</span>)}
          </div>
        </div>

        {/* Taxa de conversão */}
        <div className="pulso-card pulso-fade-up" style={{ padding: 18, animationDelay: '0.3s', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: TEXT }}>Taxa de conversão</p>
            <p style={{ fontSize: 11, color: SUBTLE, margin: '0 0 16px' }}>Leads ganhos / total criados</p>
          </div>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p className="pulso-mono" style={{ fontSize: 48, fontWeight: 700, margin: 0, color: convRate >= 20 ? SUCCESS_D : convRate >= 10 ? '#F59E0B' : TEXT, lineHeight: 1 }}>{convRate}%</p>
            <p style={{ fontSize: 11, color: SUBTLE, margin: '8px 0 0' }}>{ganhos.length} ganhos de {leads.length} leads</p>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', marginTop: 16 }}>
            <div style={{ height: '100%', width: `${convRate}%`, background: convRate >= 20 ? SUCCESS_D : PRIMARY, borderRadius: 99, transition: 'width 0.6s ease' }} />
          </div>
        </div>

        {/* Top leads */}
        <div className="pulso-card pulso-fade-up" style={{ padding: 18, animationDelay: '0.35s' }}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 14px', color: TEXT }}>Top leads por valor</p>
          {topLeads.length === 0 && <p style={{ fontSize: 12, color: SUBTLE, textAlign: 'center', padding: '24px 0' }}>Nenhum dado</p>}
          {topLeads.map((l, i) => {
            const color = stageColor(stageById(l.stage));
            const pct = total > 0 ? (Number(l.value) / total) * 100 : 0;
            return (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 10, color: SUBTLE, width: 12, flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: TEXT }}>{l.name}</p>
                    <p className="pulso-mono" style={{ fontSize: 10, fontWeight: 600, marginLeft: 6, flexShrink: 0, color }}>{formatBRL(l.value)}</p>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 99, background: color, width: `${pct}%`, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TagInput({ onAdd }) {
  const [value, setValue] = useState('');
  const [active, setActive] = useState(false);
  function submit() { const tag = value.trim(); if (tag) { onAdd(tag); setValue(''); setActive(false); } }
  if (!active) {
    return (
      <button onClick={() => setActive(true)} style={{ fontSize: 10, color: SUBTLE, border: `1px dashed rgba(255,255,255,0.12)`, background: 'none', borderRadius: 99, padding: '2px 8px', cursor: 'pointer' }}>
        + tag
      </button>
    );
  }
  return (
    <input autoFocus value={value} onChange={e => setValue(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setValue(''); setActive(false); } }}
      onBlur={submit}
      placeholder="nova tag"
      style={{ fontSize: 11, border: `1px solid rgba(99,102,241,0.4)`, borderRadius: 99, padding: '2px 8px', outline: 'none', background: 'rgba(99,102,241,0.1)', color: TEXT, width: 80, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    />
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, width: 380, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 64px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: TEXT }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: SUBTLE, padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: SUBTLE, display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const TRIGGER_TYPES = [
  { id: 'new_lead', label: 'Novo lead criado', icon: '🆕', color: '#22C55E', bg: 'rgba(34,197,94,0.08)' },
  { id: 'stage_changed', label: 'Lead muda de etapa', icon: '📊', color: '#38BDF8', bg: 'rgba(56,189,248,0.08)' },
  { id: 'message_received', label: 'Mensagem recebida', icon: '💬', color: '#A78BFA', bg: 'rgba(167,139,250,0.08)' },
  { id: 'no_response', label: 'Sem resposta', icon: '⏰', color: '#F43F5E', bg: 'rgba(244,63,94,0.08)' },
];

const ACTION_TYPES = [
  { id: 'send_whatsapp', label: 'Enviar WhatsApp', icon: '💬', color: '#22C55E' },
  { id: 'wait', label: 'Aguardar', icon: '⏱', color: '#F59E0B' },
  { id: 'move_stage', label: 'Mover de etapa', icon: '📦', color: '#38BDF8' },
  { id: 'add_note', label: 'Adicionar nota', icon: '📝', color: '#94A3B8' },
];

const STAGES_PIPELINE = ['novo', 'qualificacao', 'proposta', 'negociacao', 'ganho', 'perdido'];
const STAGE_LABELS = { novo: 'Novo Lead', qualificacao: 'Qualificação', proposta: 'Proposta Enviada', negociacao: 'Negociação', ganho: 'Ganho', perdido: 'Perdido' };

function AutomationCard({ auto, onToggle, onDelete, onEdit }) {
  const trigger = TRIGGER_TYPES.find(t => t.id === auto.trigger_type) || TRIGGER_TYPES[0];
  const actions = Array.isArray(auto.actions) ? auto.actions : [];
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
      <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: TEXT }}>{auto.name}</p>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600, background: auto.enabled ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)', color: auto.enabled ? '#22C55E' : SUBTLE }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: auto.enabled ? '#22C55E' : '#334155', display: 'inline-block' }} />
            {auto.enabled ? 'Ativa' : 'Inativa'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button onClick={onToggle} style={{ width: 34, height: 18, borderRadius: 99, position: 'relative', background: auto.enabled ? PRIMARY : 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}>
            <span style={{ position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s', left: auto.enabled ? '17px' : '2px' }} />
          </button>
          <button onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: SUBTLE, padding: 3 }} title="Editar"><Pencil size={13} strokeWidth={1.5} /></button>
          <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: SUBTLE, padding: 3 }} title="Excluir"><Trash2 size={13} strokeWidth={1.5} /></button>
        </div>
      </div>

      <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: trigger.bg, color: trigger.color, border: `1px solid ${trigger.color}22` }}>
          <span>{trigger.icon}</span>
          <span>{trigger.label}</span>
          {auto.trigger_type === 'stage_changed' && auto.trigger_config?.stage && (
            <span style={{ marginLeft: 'auto', opacity: 0.7 }}>→ {STAGE_LABELS[auto.trigger_config.stage] || auto.trigger_config.stage}</span>
          )}
        </div>

        {actions.map((action, i) => {
          const at = ACTION_TYPES.find(a => a.id === action.type) || ACTION_TYPES[0];
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <div style={{ width: 1, height: 10, background: BORDER, marginLeft: 16 }} />
              <div style={{ width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 12, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ color: at.color }}>{at.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: at.color }}>{at.label}</span>
                  {action.type === 'send_whatsapp' && action.message && <p style={{ color: SUBTLE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px 0 0', fontSize: 11 }}>"{action.message}"</p>}
                  {action.type === 'wait' && <span style={{ color: SUBTLE, marginLeft: 6 }}>{action.minutes || 1} min</span>}
                  {action.type === 'move_stage' && action.stage && <span style={{ color: SUBTLE, marginLeft: 6 }}>→ {STAGE_LABELS[action.stage] || action.stage}</span>}
                  {action.type === 'add_note' && action.note && <p style={{ color: SUBTLE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px 0 0', fontSize: 11 }}>"{action.note}"</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
