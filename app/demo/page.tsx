import Link from "next/link";

const highlights = [
  "Upload conjunto de espelho e anexos de fornecedor com parser real.",
  "Validacao com override manual, fechamento de rodada e bloqueios operacionais.",
  "Exportacao CSV/XLSX com auditoria, historico e cobertura automatizada."
];

const demoFlow = [
  "Entrar com o usuario demo e abrir /cotacoes-pepa.",
  "Mostrar o upload de rodada, diagnostico e comparativo por fornecedor.",
  "Ir para /validacao-compra-pepa e demonstrar revisao e overrides.",
  "Fechar em /pedido-final-pepa com exportacao e trilha em /logs-pepa."
];

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-brand-surface px-6 py-10 text-brand-ink">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[40px] bg-white p-8 shadow-panel md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-muted">
            PEPA Demo
          </p>
          <div className="mt-4 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">
                Cotacao e pedido final com roteiro pronto para piloto e apresentacao.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
                Esta rota publica organiza a historia do produto para demo comercial, treinamento
                interno e validacao rapida de ambiente.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  className="rounded-full bg-brand-blue px-5 py-3 text-sm font-medium text-white shadow-panel"
                  href="/login"
                >
                  Entrar no ambiente demo
                </Link>
                <a
                  className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-brand-ink"
                  href="/api/health"
                >
                  Abrir healthcheck
                </a>
              </div>
            </div>
            <section className="rounded-[32px] bg-slate-950 p-6 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">
                Credenciais demo
              </p>
              <div className="mt-4 space-y-2 text-sm text-slate-200">
                <p>Email: admin@pepa.local</p>
                <p>Senha: demo123</p>
                <p>Storage: SQLite local com uploads e historico por rodada</p>
              </div>
            </section>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-[32px] bg-white p-8 shadow-panel">
            <p className="text-sm font-semibold text-brand-ink">O que mostrar</p>
            <div className="mt-5 space-y-3">
              {highlights.map((item) => (
                <div key={item} className="rounded-[24px] border border-slate-100 px-4 py-4 text-sm text-slate-600">
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[32px] bg-white p-8 shadow-panel">
            <p className="text-sm font-semibold text-brand-ink">Roteiro sugerido</p>
            <ol className="mt-5 space-y-3 text-sm text-slate-600">
              {demoFlow.map((step, index) => (
                <li key={step} className="rounded-[24px] border border-slate-100 px-4 py-4">
                  <span className="mr-2 font-semibold text-brand-ink">{index + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </main>
  );
}
