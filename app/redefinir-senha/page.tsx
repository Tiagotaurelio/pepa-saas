"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) { setError("As senhas não coincidem."); return; }
    setIsSubmitting(true);
    setError("");

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    const data = await res.json();
    setIsSubmitting(false);

    if (!res.ok) { setError(data.error ?? "Erro ao redefinir senha."); return; }
    setDone(true);
  }

  if (!token) {
    return (
      <p className="mt-6 text-sm text-brand-danger">Link inválido. Solicite um novo link de recuperação.</p>
    );
  }

  if (done) {
    return (
      <div className="mt-6 rounded-2xl bg-green-50 p-5 text-sm text-green-700">
        <p className="font-medium">Senha redefinida com sucesso.</p>
        <p className="mt-2">
          <Link href="/login" className="text-brand-blue hover:underline">Entrar agora</Link>
        </p>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
      <label className="block text-sm text-slate-600">
        Nova senha
        <input
          className="mt-2 w-full rounded-[20px] border border-slate-200 px-4 py-3 outline-none"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
        />
      </label>
      <label className="block text-sm text-slate-600">
        Confirmar senha
        <input
          className="mt-2 w-full rounded-[20px] border border-slate-200 px-4 py-3 outline-none"
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          minLength={6}
        />
      </label>
      {error && <p className="text-sm text-brand-danger">{error}</p>}
      <button
        className="w-full rounded-full bg-brand-blue px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Salvando..." : "Redefinir senha"}
      </button>
    </form>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-[36px] bg-white p-8 shadow-panel">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-muted">PEPA</p>
        <h1 className="mt-3 text-3xl font-semibold text-brand-ink">Nova senha</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">Escolha uma nova senha para sua conta.</p>
        <Suspense fallback={<div className="mt-8 h-10 animate-pulse rounded-2xl bg-slate-100" />}>
          <ResetForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="text-brand-blue hover:underline">Voltar ao login</Link>
        </p>
      </div>
    </div>
  );
}
