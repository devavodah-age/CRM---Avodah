import React, { useState, useEffect } from "react";
import { Plus, Trash2, Wifi, WifiOff, Loader2, X, Eye, EyeOff, Building2 } from "lucide-react";

const PRIMARY = "#4F3CC9";
const SIDEBAR = "#241C57";
const INK = "#14171F";

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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...opts.headers,
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro interno");
    return data;
  }

  async function carregar() {
    try {
      setLoading(true);
      setErro(null);
      const data = await apiFetch("/companies");
      setCompanies(data.companies);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function criarEmpresa(e) {
    e.preventDefault();
    setFormErro("");
    if (!form.companyName || !form.userName || !form.email || !form.password) {
      setFormErro("Preencha todos os campos.");
      return;
    }
    try {
      setFormLoading(true);
      await apiFetch("/companies", { method: "POST", body: JSON.stringify(form) });
      setShowForm(false);
      setForm({ companyName: "", userName: "", email: "", password: "" });
      await carregar();
    } catch (e) {
      setFormErro(e.message);
    } finally {
      setFormLoading(false);
    }
  }

  async function deletarEmpresa(id, nome) {
    if (!window.confirm(`Deletar "${nome}" e todos os dados? Isso é irreversível.`)) return;
    try {
      setDeletando(id);
      await apiFetch(`/companies/${id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      alert("Erro ao deletar: " + e.message);
    } finally {
      setDeletando(null);
    }
  }

  async function entrarComoCliente(company) {
    try {
      setEntrando(company.id);
      const data = await apiFetch(`/companies/${company.id}/token`, { method: "POST" });
      onEntrarComoCliente(data.token, company);
    } catch (e) {
      alert("Erro ao entrar como cliente: " + e.message);
    } finally {
      setEntrando(null);
    }
  }

  function statusWa(status) {
    if (status === "open") return { cor: "#16A34A", label: "Conectado", icon: <Wifi size={12} /> };
    if (status === "qr") return { cor: "#F59E0B", label: "Aguard. QR", icon: <Wifi size={12} /> };
    if (status === "connecting") return { cor: "#3B82F6", label: "Conectando", icon: <Loader2 size={12} className="animate-spin" /> };
    return { cor: "#9CA3AF", label: "Desconectado", icon: <WifiOff size={12} /> };
  }

  return (
    <div style={{ padding: "32px", maxWidth: 860, margin: "0 auto" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: INK, marginBottom: 4 }}>
            Clientes
          </h2>
          <p style={{ fontSize: 14, color: "#6B7280" }}>
            Gerencie todas as empresas cadastradas na plataforma.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: PRIMARY }}
        >
          <Plus size={15} /> Novo cliente
        </button>
      </div>

      {/* Estado de carga / erro */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 size={18} className="animate-spin" /> Carregando...
        </div>
      )}
      {erro && (
        <div className="text-red-500 text-sm text-center py-8">{erro}</div>
      )}

      {/* Lista de empresas */}
      {!loading && !erro && (
        <div className="flex flex-col gap-3">
          {companies.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Building2 size={32} className="mx-auto mb-3 opacity-30" />
              <p>Nenhum cliente cadastrado ainda.</p>
            </div>
          )}
          {companies.map((c) => {
            const wa = statusWa(c.whatsapp_status);
            return (
              <div
                key={c.id}
                className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm"
              >
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: SIDEBAR }}
                >
                  {c.name.slice(0, 2).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: INK }}>
                    {c.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{c.usuarios} usuário(s)</span>
                    <span>·</span>
                    <span>{c.leads} lead(s)</span>
                    <span>·</span>
                    <span>desde {new Date(c.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>

                {/* WhatsApp status */}
                <div
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: wa.cor + "18", color: wa.cor }}
                >
                  {wa.icon} {wa.label}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => entrarComoCliente(c)}
                    disabled={entrando === c.id}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:bg-indigo-50"
                    style={{ borderColor: PRIMARY, color: PRIMARY }}
                    title="Entrar no CRM deste cliente"
                  >
                    {entrando === c.id ? <Loader2 size={13} className="animate-spin" /> : "Entrar"}
                  </button>
                  <button
                    onClick={() => deletarEmpresa(c.id, c.name)}
                    disabled={deletando === c.id}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                    title="Deletar empresa"
                  >
                    {deletando === c.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Novo cliente */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg" style={{ color: INK }}>Novo cliente</h3>
              <button onClick={() => { setShowForm(false); setFormErro(""); }} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={criarEmpresa} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Nome da empresa</label>
                <input
                  className="pulso-input w-full border border-gray-200 rounded-lg text-sm"
                  placeholder="Ex: Clínica Saúde Total"
                  value={form.companyName}
                  onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Nome do usuário responsável</label>
                <input
                  className="pulso-input w-full border border-gray-200 rounded-lg text-sm"
                  placeholder="Ex: João Silva"
                  value={form.userName}
                  onChange={(e) => setForm((f) => ({ ...f, userName: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Email</label>
                <input
                  type="email"
                  className="pulso-input w-full border border-gray-200 rounded-lg text-sm"
                  placeholder="cliente@empresa.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Senha inicial</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    className="pulso-input w-full border border-gray-200 rounded-lg text-sm pr-10"
                    placeholder="Mínimo 8 caracteres"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              {formErro && <p className="text-red-500 text-xs">{formErro}</p>}
              <button
                type="submit"
                disabled={formLoading}
                className="w-full text-white rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 flex items-center justify-center gap-2 mt-1"
                style={{ backgroundColor: PRIMARY }}
              >
                {formLoading ? <Loader2 size={15} className="animate-spin" /> : "Criar cliente"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
