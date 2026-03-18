import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-start justify-center gap-6 px-6 py-16">
      <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
        PEPA
      </span>
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
          Pagina nao encontrada
        </h1>
        <p className="max-w-xl text-base text-slate-600">
          O caminho que voce tentou abrir nao existe ou nao esta mais disponivel nesta rodada.
        </p>
      </div>
      <Link
        href="/cotacoes-pepa"
        className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        Voltar para cotacoes
      </Link>
    </main>
  );
}
