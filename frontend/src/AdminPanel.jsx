import React, { useState, useEffect } from "react";
import { Plus, Trash2, Wifi, WifiOff, Loader2, X, Eye, EyeOff, Building2 } from "lucide-react";

const BG = "#08090C";
const SURFACE = "#0F1117";
const SURFACE2 = "#161821";
const PRIMARY = "#6366F1";
const TEXT = "#F1F5F9";
const MUTED = "#94A3B8";
const SUBTLE = "#475569";
const BORDER = "rgba(255,255,255,0.06)";

export default function AdminPanel({ token, apiUrl, onEntrarComoCliente }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ companyName: "", userName: "", email: "", password: "" });
  const [formErro, setFormErro] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [deletando, setDeletando] = useState(null);
  const [entrando, setEntrando] = useState(null);

  async function apiFetch(path, opts = {}) {
    const res = await fetch(apiUrl + path, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts.headers },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro interno");
    return data;
  }

  async function carregar() {
    try {
      setLoading(true); setErro(null);
      const data = await apiFetch("/companies");
      setCompanies(data.companies);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function criarEmpresa(e) {
    e.preventDefault(); setFormErro("");
    if (!form.companyName || !form.userName || !form.email || !form.password) { setFormErro("Preencha todos os campos."); return; }
    try {
      setFormLoading(true);
      await apiFetch("/companies", { method: "POST", body: JSON.stringify(form) });
      setShowForm(false); setForm({ companyName: "", userName: "", email: "", password: "" });
      await carregar();
    } catch (e) { setFormErro(e.message); } finally { setFormLoading(false); }
  }

  async function deletarEmpresa(id, nome) {
    if (!window.confirm(`Deletar "${nome}" e todos os dados? Isso é irreversível.`)) return;
    try {
      setDeletando(id);
      await apiFetch(`/companies/${id}`, { method: "DELETE" });
      await carregar();
    } catch (e) { alert("Erro ao deletar: " + e.message); } finally { setDeletando(null); }
  }

  async function entrarComoCliente(company) {
    try {
      setEntrando(company.id);
      const data = await apiFetch(`/companies/${company.id}/token`, { method: "POST" });
      onEntrarComoCliente(data.token, company);
    } catch (e) { alert("Erro ao entrar como cliente: " + e.message); } finally { setEntrando(null); }
  }

  function statusWa(status) {
    if (status === "open") return { cor: "#22C55E", label: "Conectado", icon: <Wifi size={11} strokeWidth={1.5} /> };
    if (status === "qr") return { cor: "#F59E0B", label: "Aguard. QR", icon: <Wifi size={11} strokeWidth={1.5} /> };
    if (status === "connecting") return { cor: "#38BDF8", label: "Conectando", icon: <Loader2 size={11} strokeWidth={1.5} className="animate-spin" /> };
    return { cor: SUBTLE, label: "Desconectado", icon: <WifiOff size={11} strokeWidth={1.5} /> };
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8, border: `1px solid ${BORDER}`,
    background: 'rgba(255,255,255,0.04)', color: TEXT, outline: 'none', boxSizing: 'border-box',
    fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'border-color 0.15s',
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 28, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: TEXT, margin: 0 }}>Clientes</h2>
            <p style={{ fontSize: 13, color: SUBTLE, margin: '4px 0 0' }}>Gerencie todas as empresas cadastradas na plataforma.</p>
          </div>
          <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: `linear-gradient(135deg, ${PRIMARY}, #818CF8)`, color: '#fff', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <Plus size={14} strokeWidth={2} /> Novo cliente
          </button>
        </div>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: SUBTLE, gap: 8, fontSize: 13 }}>
            <Loader2 size={18} className="animate-spin" /> Carregando...
          </div>
        )}
        {erro && <div style={{ color: '#F43F5E', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>{erro}</div>}

        {!loading && !erro && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {companies.length === 0 && (
              <div style={{ textAlign: 'center', padding: '64px 0', color: SUBTLE }}>
                <Building2 size={32} style={{ opacity: 0.2, marginBottom: 12 }} />
                <p style={{ fontSize: 13, margin: 0 }}>Nenhum cliente cadastrado ainda.</p>
              </div>
            )}
            {companies.map((c) => {
              const wa = statusWa(c.whatsapp_status);
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 18px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${PRIMARY}, #818CF8)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: TEXT }}>{c.name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 11, color: SUBTLE }}>
                      <span>{c.usuarios} usuário(s)</span>
                      <span>·</span>
                      <span>{c.leads} lead(s)</span>
                      <span>·</span>
                      <span>desde {new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: wa.cor + '18', color: wa.cor, flexShrink: 0 }}>
                    {wa.icon} {wa.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => entrarComoCliente(c)} disabled={entrando === c.id} style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7, border: `1px solid rgba(99,102,241,0.3)`, background: 'rgba(99,102,241,0.08)', color: '#818CF8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                      {entrando === c.id ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : "Entrar"}
                    </button>
                    <button onClick={() => deletarEmpresa(c.id, c.name)} disabled={deletando === c.id} style={{ width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: `1px solid ${BORDER}`, cursor: 'pointer', color: SUBTLE }} title="Deletar empresa">
                      {deletando === c.id ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" /> : <Trash2 size={13} strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Novo cliente */}
        {showForm && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={() => { setShowForm(false); setFormErro(""); }} />
            <div style={{ position: 'relative', background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, width: '100%', maxWidth: 400, margin: '0 16px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 64px rgba(0,0,0,0.6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: TEXT }}>Novo cliente</h3>
                <button onClick={() => { setShowForm(false); setFormErro(""); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: SUBTLE, padding: 4 }}><X size={16} strokeWidth={1.5} /></button>
              </div>
              <form onSubmit={criarEmpresa} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: SUBTLE, display: 'block', marginBottom: 5 }}>Nome da empresa</label>
                  <input style={inputStyle} placeholder="Ex: Clínica Saúde Total" value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: SUBTLE, display: 'block', marginBottom: 5 }}>Nome do usuário responsável</label>
                  <input style={inputStyle} placeholder="Ex: João Silva" value={form.userName} onChange={(e) => setForm((f) => ({ ...f, userName: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: SUBTLE, display: 'block', marginBottom: 5 }}>Email</label>
                  <input type="email" style={inputStyle} placeholder="cliente@empresa.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: SUBTLE, display: 'block', marginBottom: 5 }}>Senha inicial</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPass ? "text" : "password"} style={{ ...inputStyle, paddingRight: 38 }} placeholder="Mínimo 8 caracteres" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                    <button type="button" onClick={() => setShowPass((v) => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: SUBTLE, padding: 2 }}>
                      {showPass ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>
                {formErro && <p style={{ fontSize: 12, color: '#F43F5E', margin: 0 }}>{formErro}</p>}
                <button type="submit" disabled={formLoading} style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: `linear-gradient(135deg, ${PRIMARY}, #818CF8)`, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, opacity: formLoading ? 0.7 : 1, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {formLoading ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : "Criar cliente"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
