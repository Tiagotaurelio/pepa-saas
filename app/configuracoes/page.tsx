"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserForm } from "@/components/user-form";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "buyer";
  active: boolean;
  createdAt: string;
};

type Tab = "empresa" | "usuarios";

export default function ConfiguracoesPage() {
  const router = useRouter();

  // Session / role
  const [role, setRole] = useState<"admin" | "buyer" | "super_admin" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Active tab
  const [tab, setTab] = useState<Tab>("empresa");

  // Empresa tab
  const [companyName, setCompanyName] = useState("");
  const [saved, setSaved] = useState(false);
  const [empresaError, setEmpresaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Usuarios tab
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  // Load session and company name
  useEffect(() => {
    Promise.all([
      fetch("/api/auth/session").then((r) => r.json()),
      fetch("/api/pepa/settings").then((r) => r.json())
    ])
      .then(([sessionData, settingsData]: [{ session?: { userId?: string; role?: string } }, { name?: string }]) => {
        setRole((sessionData.session?.role as "admin" | "buyer" | "super_admin") ?? "buyer");
        setCurrentUserId(sessionData.session?.userId ?? null);
        setCompanyName(settingsData.name ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load users when switching to Usuarios tab
  useEffect(() => {
    if (tab === "usuarios" && (role === "admin" || role === "super_admin")) {
      loadUsers();
    }
  }, [tab, role]);

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/auth/users");
      const data = (await res.json()) as { users?: UserRow[] };
      setUsers(data.users ?? []);
    } catch {
      // ignore
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleSaveEmpresa(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setEmpresaError(null);
    setSaved(false);

    try {
      const res = await fetch("/api/pepa/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setEmpresaError(data.error ?? "Erro ao salvar.");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        window.dispatchEvent(new CustomEvent("company-name-updated", { detail: { name: companyName.trim() } }));
        router.refresh();
      }
    } catch {
      setEmpresaError("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(userId: string) {
    setToggleError(null);
    try {
      const res = await fetch("/api/auth/users/toggle-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
      const data = (await res.json()) as { active?: boolean; error?: string };
      if (!res.ok) {
        setToggleError(data.error ?? "Erro ao alterar status.");
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, active: data.active ?? !u.active } : u))
      );
    } catch {
      setToggleError("Erro ao alterar status.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-400">
        Carregando...
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h2 className="mb-1 text-xl font-semibold">Configuracoes</h2>
      <p className="mb-6 text-sm text-slate-500">Gerencie as informacoes da sua empresa e usuarios.</p>

      {/* Tab switcher */}
      <div className="mb-6 flex gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 w-fit">
        <button
          onClick={() => setTab("empresa")}
          className={`rounded-xl px-5 py-2 text-sm font-medium transition-colors ${
            tab === "empresa"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Empresa
        </button>
        {role === "admin" || role === "super_admin" && (
          <button
            onClick={() => setTab("usuarios")}
            className={`rounded-xl px-5 py-2 text-sm font-medium transition-colors ${
              tab === "usuarios"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Usuarios
          </button>
        )}
      </div>

      {/* Empresa tab */}
      {tab === "empresa" && (
        <form onSubmit={handleSaveEmpresa} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Empresa</h3>

          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="companyName">
              Nome da empresa
            </label>
            <input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
              placeholder="Nome da empresa"
            />
          </div>

          {empresaError && (
            <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{empresaError}</p>
          )}

          {saved && (
            <p className="mb-4 rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-700">
              Salvo com sucesso.
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !companyName.trim()}
            className="rounded-full bg-brand-blue px-6 py-2.5 text-sm font-medium text-white shadow-panel hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </form>
      )}

      {/* Usuarios tab */}
      {tab === "usuarios" && role === "admin" || role === "super_admin" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Usuarios</h3>
            {!showCreateForm && !editingUser && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="rounded-full bg-brand-blue px-5 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Novo usuario
              </button>
            )}
          </div>

          {showCreateForm && (
            <UserForm
              mode="create"
              onSave={() => {
                setShowCreateForm(false);
                loadUsers();
              }}
              onCancel={() => setShowCreateForm(false)}
            />
          )}

          {editingUser && (
            <UserForm
              mode="edit"
              initial={{ userId: editingUser.id, name: editingUser.name, email: editingUser.email, role: editingUser.role }}
              onSave={() => {
                setEditingUser(null);
                loadUsers();
              }}
              onCancel={() => setEditingUser(null)}
            />
          )}

          {toggleError && (
            <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{toggleError}</p>
          )}

          {usersLoading ? (
            <div className="py-10 text-center text-sm text-slate-400">Carregando usuarios...</div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-4 py-3 font-medium text-slate-500">Nome</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Email</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Perfil</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        Nenhum usuario encontrado.
                      </td>
                    </tr>
                  )}
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{user.name}</td>
                      <td className="px-4 py-3 text-slate-600">{user.email}</td>
                      <td className="px-4 py-3">
                        {user.role === "admin" || role === "super_admin" ? (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                            Administrador
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                            Comprador
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {user.active ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-600">
                            Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              setShowCreateForm(false);
                              setEditingUser(user);
                            }}
                            className="text-brand-blue hover:underline text-xs font-medium"
                          >
                            Editar
                          </button>
                          {user.id !== currentUserId && (
                            <button
                              onClick={() => handleToggleStatus(user.id)}
                              className={`text-xs font-medium hover:underline ${
                                user.active ? "text-red-500" : "text-green-600"
                              }`}
                            >
                              {user.active ? "Desativar" : "Reativar"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
