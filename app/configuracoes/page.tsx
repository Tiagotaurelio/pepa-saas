"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ConfiguracoesPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/pepa/settings")
      .then((r) => r.json())
      .then((data: { name?: string }) => {
        setCompanyName(data.name ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch("/api/pepa/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName })
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Erro ao salvar.");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        window.dispatchEvent(new CustomEvent("company-name-updated", { detail: { name: companyName.trim() } }));
        router.refresh();
      }
    } catch {
      setError("Erro ao salvar.");
    } finally {
      setSaving(false);
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
    <div className="max-w-xl">
      <h2 className="mb-1 text-xl font-semibold">Configuracoes</h2>
      <p className="mb-8 text-sm text-slate-500">Gerencie as informacoes da sua empresa.</p>

      <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
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
    </div>
  );
}
