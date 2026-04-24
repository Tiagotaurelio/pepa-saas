"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    setIsSubmitting(false);

    if (!res.ok) {
      setError(data.error ?? "Erro ao enviar e-mail.");
      return;
    }

    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-[36px] bg-white p-8 shadow-panel">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-muted">PEPA</p>
        <h1 className="mt-3 text-3xl font-semibold text-brand-ink">Recuperar senha</h1>

        {sent ? (
          <div className="mt-6 rounded-2xl bg-green-50 p-5 text-sm text-green-700">
            <p className="font-medium">E-mail enviado.</p>
            <p className="mt-1">Se este endereço estiver cadastrado, você receberá um link para redefinir sua senha em instantes.</p>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Informe seu e-mail cadastrado e enviaremos um link para redefinir sua senha.
            </p>
            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              <label className="block text-sm text-slate-600">
                E-mail
                <input
                  className="mt-2 w-full rounded-[20px] border border-slate-200 px-4 py-3 outline-none"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </label>
              {error && <p className="text-sm text-brand-danger">{error}</p>}
              <button
                className="w-full rounded-full bg-brand-blue px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Enviando..." : "Enviar link"}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="text-brand-blue hover:underline">
            Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  );
}
