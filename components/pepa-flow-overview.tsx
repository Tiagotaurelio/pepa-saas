import Link from "next/link";

type PepaFlowOverviewProps = {
  currentStep: "cotacoes" | "validacao" | "pedido-final";
  totals: {
    ocrQueue: number;
    manualReviewCount: number;
    pendingItems: number;
  };
};

const steps = [
  {
    id: "cotacoes",
    title: "Cotacoes",
    description: "Ler anexos, mandar OCR quando preciso e montar o comparativo.",
    href: "/cotacoes-pepa"
  },
  {
    id: "validacao",
    title: "Validacao",
    description: "Fechar excecoes, revisar fornecedor por item e consolidar a selecao.",
    href: "/validacao-compra-pepa"
  },
  {
    id: "pedido-final",
    title: "Pedido final",
    description: "Preparar o pacote exportavel mantendo a ordem do arquivo-base.",
    href: "/pedido-final-pepa"
  }
] as const;

export function PepaFlowOverview({ currentStep, totals }: PepaFlowOverviewProps) {
  const blockers = [
    totals.ocrQueue > 0 ? `${totals.ocrQueue} anexo(s) ainda na fila de OCR` : null,
    totals.manualReviewCount > 0 ? `${totals.manualReviewCount} item(ns) em revisao manual` : null,
    totals.pendingItems > 0 ? `${totals.pendingItems} item(ns) ainda pendente(s) no pacote final` : null
  ].filter(Boolean);

  return (
    <section className="mb-6 rounded-[32px] bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-slate-500">Fluxo PEPA</p>
          <h3 className="mt-1 text-xl font-semibold">Da cotacao ao pedido final sem perder a ordem do Flex</h3>
        </div>
        <div className="rounded-full bg-brand-surface px-4 py-2 text-sm text-slate-600">
          {blockers.length === 0 ? "Fluxo sem bloqueios" : `${blockers.length} ponto(s) de atencao`}
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {steps.map((step, index) => {
          const isCurrent = step.id === currentStep;
          const isCompleted = steps.findIndex((candidate) => candidate.id === currentStep) > index;

          return (
            <Link
              key={step.id}
              href={step.href}
              className={[
                "rounded-[28px] border p-5 transition-colors",
                isCurrent
                  ? "border-brand-blue bg-brand-blue/5"
                  : isCompleted
                    ? "border-brand-success/20 bg-brand-success/5"
                    : "border-slate-100 bg-brand-surface"
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-brand-ink">{step.title}</p>
                <span className={stepBadgeClasses(isCurrent, isCompleted)}>
                  {isCurrent ? "Etapa atual" : isCompleted ? "Concluida" : "Abrir"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{step.description}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {blockers.length === 0 ? (
          <span className="rounded-full bg-brand-success/10 px-4 py-2 text-sm font-medium text-brand-success">
            Nenhum bloqueio impedindo a exportacao
          </span>
        ) : (
          blockers.map((blocker) => (
            <span
              key={blocker}
              className="rounded-full bg-brand-attention/10 px-4 py-2 text-sm font-medium text-brand-attention"
            >
              {blocker}
            </span>
          ))
        )}
      </div>
    </section>
  );
}

function stepBadgeClasses(isCurrent: boolean, isCompleted: boolean) {
  if (isCurrent) {
    return "rounded-full bg-brand-blue px-3 py-1 text-xs font-semibold text-white";
  }

  if (isCompleted) {
    return "rounded-full bg-brand-success/10 px-3 py-1 text-xs font-semibold text-brand-success";
  }

  return "rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500";
}
