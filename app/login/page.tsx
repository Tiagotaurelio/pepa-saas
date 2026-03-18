"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@pepa.local");
  const [password, setPassword] = useState("demo123");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Falha de autenticacao.");
      setIsSubmitting(false);
      return;
    }

    router.push("/cotacoes-pepa");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-[36px] bg-white p-8 shadow-panel">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-muted">PEPA</p>
        <h1 className="mt-3 text-3xl font-semibold text-brand-ink">Entrar na operacao</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Acesso ao sistema de cotacao e gestao de pedidos de compra.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-slate-600">
            Email
            <input
              className="mt-2 w-full rounded-[20px] border border-slate-200 px-4 py-3 outline-none"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block text-sm text-slate-600">
            Senha
            <input
              className="mt-2 w-full rounded-[20px] border border-slate-200 px-4 py-3 outline-none"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error ? <p className="text-sm text-brand-danger">{error}</p> : null}

          <button
            className="w-full rounded-full bg-brand-blue px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-6 rounded-[24px] bg-brand-surface p-4 text-sm text-slate-600">
          <p className="font-medium text-brand-ink">Credenciais demo</p>
          <p className="mt-2">Email: admin@pepa.local</p>
          <p>Senha: demo123</p>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <Link className="font-medium text-brand-blue transition hover:opacity-80" href="/demo">
            Ver roteiro de demo
          </Link>
          <p className="text-slate-500">Healthcheck disponivel em /api/health</p>
        </div>
      </div>
    </div>
  );
}
