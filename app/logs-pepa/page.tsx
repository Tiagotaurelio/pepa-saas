"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { OperationFeedback } from "@/components/operation-feedback";
import { PageHeader } from "@/components/page-header";
import { usePepaSnapshot } from "@/lib/use-pepa-snapshot";

type DetailedRound = {
  id: string;
  createdAt: string;
  mirrorFileName: string;
  supplierNames: string[];
  requestedItemsCount: number;
  quotedItems: number;
  pendingDivergences: number;
  resolvedDivergences: number;
  totalSavings: number;
  detailedStatus: "open" | "validating" | "validated" | "closed";
  status: "open" | "closed";
};

type StatusFilter = "all" | "open" | "validating" | "validated" | "closed";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "Aberta", color: "bg-blue-100 text-blue-700" },
  validating: { label: "Em validação", color: "bg-amber-100 text-amber-700" },
  validated: { label: "Validada", color: "bg-green-100 text-green-700" },
  closed: { label: "Fechada", color: "bg-slate-200 text-slate-600" }
};

const FILTER_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "open", label: "Abertas" },
  { key: "validating", label: "Em validação" },
  { key: "validated", label: "Validadas" },
  { key: "closed", label: "Fechadas" }
];

export default function LogsPepaPage() {
  const searchParams = useSearchParams();
  const roundId = searchParams.get("roundId");
  const { snapshot } = usePepaSnapshot(roundId);

  const [rounds, setRounds] = useState<DetailedRound[]>([]);
  const [loadingRounds, setLoadingRounds] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(roundId);

  useEffect(() => {
    fetch("/api/pepa/history?detailed=true")
      .then((r) => r.json())
      .then((data: { rounds?: DetailedRound[] }) => {
        setRounds(data.rounds ?? []);
        setLoadingRounds(false);
      })
      .catch(() => setLoadingRounds(false));
  }, []);

  const filteredRounds = rounds.filter((r) => statusFilter === "all" || r.detailedStatus === statusFilter);

  const counts = {
    all: rounds.length,
    open: rounds.filter((r) => r.detailedStatus === "open").length,
    validating: rounds.filter((r) => r.detailedStatus === "validating").length,
    validated: rounds.filter((r) => r.detailedStatus === "validated").length,
    closed: rounds.filter((r) => r.detailedStatus === "closed").length
  };

  return (
    <div>
      <PageHeader
        eyebrow="Auditoria"
        title="Minhas cotações"
        description="Acompanhe todas as cotações realizadas, seus status e a trilha de alterações de cada rodada."
      />

      {/* Status filter cards */}
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === f.key
                ? "bg-brand-blue text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 shadow-sm"
            }`}
          >
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>

      {/* Rounds list */}
      <section className="mb-6 rounded-[32px] bg-white p-6 shadow-panel">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          {filteredRounds.length} cotação(ões)
        </h3>

        {loadingRounds ? (
          <p className="py-8 text-center text-sm text-slate-400">Carregando cotações...</p>
        ) : filteredRounds.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Nenhuma cotação encontrada para este filtro.</p>
        ) : (
          <div className="space-y-3">
            {filteredRounds.map((round) => {
              const isSelected = selectedRoundId === round.id;
              const statusInfo = STATUS_LABELS[round.detailedStatus] ?? STATUS_LABELS.open;

              return (
                <div
                  key={round.id}
                  className={`cursor-pointer rounded-[20px] border p-4 transition-all ${
                    isSelected
                      ? "border-brand-blue bg-blue-50/50 shadow-sm"
                      : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/50"
                  }`}
                  onClick={() => setSelectedRoundId(round.id)}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-brand-ink">
                          {round.mirrorFileName}
                        </p>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>{formatDate(round.createdAt)}</span>
                        <span>{round.requestedItemsCount} itens</span>
                        {round.supplierNames.length > 0 && (
                          <span>Fornecedor(es): {round.supplierNames.join(", ")}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {round.pendingDivergences > 0 && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                          {round.pendingDivergences} pendente(s)
                        </span>
                      )}
                      {round.resolvedDivergences > 0 && (
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                          {round.resolvedDivergences} resolvida(s)
                        </span>
                      )}
                      {round.totalSavings > 0 && (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          Economia: R$ {round.totalSavings.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      <Link
                        href={`/cotacoes-pepa?roundId=${round.id}`}
                        className="rounded-full bg-brand-blue px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Abrir
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Audit trail for selected round */}
      {selectedRoundId && (
        <section className="rounded-[32px] bg-white p-6 shadow-panel">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Trilha de auditoria
            </h3>
            {selectedRoundId && (
              <span className="text-xs text-slate-400">
                Rodada {selectedRoundId.slice(0, 8)}
              </span>
            )}
          </div>

          {snapshot.latestRound?.id === selectedRoundId ? (
            <div className="space-y-3">
              {(snapshot.auditEvents ?? []).length === 0 ? (
                <p className="rounded-[20px] border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                  Nenhum evento registrado ainda.
                </p>
              ) : (
                (snapshot.auditEvents ?? []).map((event) => (
                  <div key={event.id} className="rounded-[20px] border border-slate-100 px-4 py-3">
                    <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-brand-ink">{event.title}</p>
                        <p className="mt-0.5 text-sm text-slate-600">{event.description}</p>
                      </div>
                      <p className="text-xs text-slate-400 whitespace-nowrap">{formatDateTime(event.occurredAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Selecione uma rodada acima e{" "}
              <Link href={`/logs-pepa?roundId=${selectedRoundId}`} className="text-brand-blue hover:underline">
                clique aqui para carregar os eventos
              </Link>.
            </p>
          )}
        </section>
      )}

      {!selectedRoundId && !loadingRounds && rounds.length > 0 && (
        <OperationFeedback
          tone="info"
          title="Selecione uma cotação"
          message="Clique em uma cotação acima para ver a trilha de auditoria."
        />
      )}
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
