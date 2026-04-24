"use client";

import { useEffect, useState } from "react";
import type { TenantRow } from "@/lib/db";

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function NewTenantForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/super-admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, adminName, adminEmail, adminPassword }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Erro."); return; }
    setName(""); setAdminName(""); setAdminEmail(""); setAdminPassword("");
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[20px] border border-slate-200 bg-slate-50 p-5 space-y-4">
      <p className="text-sm font-semibold text-brand-ink">Nova empresa</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm text-slate-600">
          Nome da empresa
          <input className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            value={name} onChange={e => setName(e.target.value)} required />
        </label>
        <label className="block text-sm text-slate-600">
          Nome do admin
          <input className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            value={adminName} onChange={e => setAdminName(e.target.value)} required />
        </label>
        <label className="block text-sm text-slate-600">
          E-mail do admin
          <input type="email" className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required />
        </label>
        <label className="block text-sm text-slate-600">
          Senha inicial
          <input type="password" className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            value={adminPassword} onChange={e => setAdminPassword(e.target.value)} required minLength={6} />
        </label>
      </div>
      {error && <p className="text-sm text-brand-danger">{error}</p>}
      <button type="submit" disabled={saving}
        className="rounded-full bg-brand-blue px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
        {saving ? "Criando..." : "Criar empresa"}
      </button>
    </form>
  );
}

export default function SuperAdminPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/super-admin/tenants");
    if (res.ok) {
      const data = await res.json();
      setTenants(data.tenants ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(id: string) {
    setTogglingId(id);
    await fetch(`/api/super-admin/tenants/${id}/toggle`, { method: "POST" });
    await load();
    setTogglingId(null);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Super Admin</p>
          <h1 className="mt-1 text-2xl font-semibold text-brand-ink">Empresas</h1>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="rounded-full bg-brand-blue px-5 py-2 text-sm font-medium text-white">
          {showForm ? "Cancelar" : "+ Nova empresa"}
        </button>
      </div>

      {showForm && (
        <NewTenantForm onCreated={() => { setShowForm(false); load(); }} />
      )}

      <div className="rounded-[24px] bg-white p-6 shadow-panel">
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
          </div>
        ) : tenants.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Nenhuma empresa cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-brand-muted">
                  <th className="pb-3 pr-4">Empresa</th>
                  <th className="pb-3 pr-4">ID</th>
                  <th className="pb-3 pr-4 text-right">Usuarios</th>
                  <th className="pb-3 pr-4">Criada em</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 text-right">Acao</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id} className="border-b border-slate-100 transition hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium text-brand-ink">{t.name}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-400">{t.id.slice(0, 12)}…</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{t.userCount}</td>
                    <td className="py-3 pr-4 text-xs text-slate-400">{formatDate(t.createdAt)}</td>
                    <td className="py-3 pr-4">
                      {t.active ? (
                        <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Ativa</span>
                      ) : (
                        <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Inativa</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => toggleActive(t.id)}
                        disabled={togglingId === t.id}
                        className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                          t.active
                            ? "bg-red-50 text-red-600 hover:bg-red-100"
                            : "bg-green-50 text-green-700 hover:bg-green-100"
                        }`}
                      >
                        {togglingId === t.id ? "..." : t.active ? "Desativar" : "Ativar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
