"use client";
import { useState } from "react";

type UserFormProps = {
  mode: "create" | "edit";
  initial?: { userId: string; name: string; email: string; role: string };
  onSave: () => void;
  onCancel: () => void;
};

export function UserForm({ mode, initial, onSave, onCancel }: UserFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(initial?.role ?? "buyer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const url = "/api/auth/users";
    const method = mode === "create" ? "POST" : "PUT";
    const body = mode === "create"
      ? { name, email, password, role }
      : { userId: initial?.userId, name, email, password: password || undefined, role };

    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao salvar."); return; }
      onSave();
    } catch { setError("Erro ao salvar."); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Nome</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue" placeholder="Nome completo" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue" placeholder="email@empresa.com" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Senha {mode === "edit" && <span className="text-slate-400">(deixe vazio para manter)</span>}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={mode === "create" ? 6 : undefined} required={mode === "create"} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue" placeholder="Min. 6 caracteres" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Perfil</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue">
            <option value="buyer">Comprador</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-full bg-brand-blue px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{saving ? "Salvando..." : mode === "create" ? "Criar usuario" : "Salvar alteracoes"}</button>
        <button type="button" onClick={onCancel} className="rounded-full bg-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-300">Cancelar</button>
      </div>
    </form>
  );
}
