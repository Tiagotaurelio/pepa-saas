"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { OperationFeedback } from "@/components/operation-feedback";
import { PageHeader } from "@/components/page-header";
import { usePepaSnapshot } from "@/lib/use-pepa-snapshot";

export default function LogsPepaPage() {
  const searchParams = useSearchParams();
  const roundId = searchParams.get("roundId");
  const { snapshot } = usePepaSnapshot(roundId);

  return (
    <div>
      <PageHeader
        eyebrow="Auditoria"
        title="Trilha de alteracoes da rodada"
        description="Cada upload, ajuste manual, alteracao comercial e fechamento de rodada fica registrado aqui para consulta operacional."
      />

      {snapshot.latestRound ? (
        <div className="mb-6 flex flex-wrap gap-3">
          <span className="rounded-full bg-brand-surface px-4 py-2 text-sm text-slate-600">
            Rodada {snapshot.latestRound.id.slice(0, 8)}
          </span>
          <span className="rounded-full bg-brand-surface px-4 py-2 text-sm text-slate-600">
            {snapshot.latestRound.status === "closed" ? "Fechada" : "Aberta"}
          </span>
          <Link className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600" href={`/cotacoes-pepa${roundId ? `?roundId=${roundId}` : ""}`}>
            Abrir rodada
          </Link>
        </div>
      ) : null}

      <div className="mb-6">
        <OperationFeedback
          tone={snapshot.latestRound?.status === "closed" ? "success" : "info"}
          title={snapshot.latestRound ? "Auditoria da rodada selecionada" : "Auditoria em modo demonstracao"}
          message={
            snapshot.latestRound
              ? `${(snapshot.auditEvents ?? []).length} evento(s) registrados para consulta operacional nesta rodada.`
              : "Assim que uma rodada real for salva, uploads, overrides e fechamento passam a aparecer aqui com horario e motivo."
          }
        />
      </div>

      <section className="rounded-[32px] bg-white p-6 shadow-panel">
        <div className="space-y-4">
          {(snapshot.auditEvents ?? []).map((event) => (
            <div key={event.id} className="rounded-[24px] border border-slate-100 px-4 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-medium text-brand-ink">{event.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{event.description}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-brand-muted">{event.type}</p>
                </div>
                <p className="text-xs text-slate-500">{formatDateTime(event.occurredAt)}</p>
              </div>
            </div>
          ))}
          {(snapshot.auditEvents ?? []).length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
              Nenhum evento auditavel registrado ainda.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
