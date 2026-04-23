"use client";

import { useEffect, useState } from "react";
import type { RoundOverviewItem } from "@/app/api/pepa/rounds-overview/route";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }: { status: "open" | "closed" }) {
  if (status === "closed") {
    return (
      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
        Fechada
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      Em andamento
    </span>
  );
}

export function AdminRoundsOverview() {
  const [rounds, setRounds] = useState<RoundOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    fetch("/api/pepa/rounds-overview")
      .then((r) => r.json())
      .then((d) => { if (d.rounds) setRounds(d.rounds); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = showClosed ? rounds : rounds.filter((r) => r.status === "open");
  const openCount = rounds.filter((r) => r.status === "open").length;

  return (
    <div className="mb-8 rounded-[24px] bg-white p-6 shadow-panel">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-brand-muted">
            Visão do Administrador — Cotações em andamento
          </h3>
          {!loading && (
            <p className="mt-0.5 text-xs text-slate-400">
              {openCount} aberta{openCount !== 1 ? "s" : ""} · {rounds.length} no total
            </p>
          )}
        </div>
        <button
          onClick={() => setShowClosed((v) => !v)}
          className="text-xs text-brand-blue hover:underline"
        >
          {showClosed ? "Ocultar fechadas" : "Ver fechadas também"}
        </button>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-blue border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          {openCount === 0 ? "Nenhuma cotação em andamento." : "Nenhuma cotação para exibir."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-brand-muted">
                <th className="pb-3 pr-4">Rodada</th>
                <th className="pb-3 pr-4">Comprador</th>
                <th className="pb-3 pr-4">Marcas cotadas</th>
                <th className="pb-3 pr-4 text-right">Itens</th>
                <th className="pb-3 pr-4 text-right">Cotados</th>
                <th className="pb-3 pr-4 text-right">Cobertura</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 text-right">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 transition hover:bg-slate-50"
                >
                  <td className="py-3 pr-4">
                    <a
                      href={`/cotacoes-pepa?roundId=${r.id}`}
                      className="font-mono text-xs text-brand-blue hover:underline"
                    >
                      {r.mirrorFileName || r.id.slice(0, 8)}
                    </a>
                  </td>
                  <td className="py-3 pr-4 font-medium text-brand-ink">
                    {r.buyerName ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="py-3 pr-4">
                    {r.brands.length === 0 ? (
                      <span className="text-slate-400">Sem fornecedor</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.brands.map((b) => (
                          <span
                            key={b}
                            className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                    {r.requestedItemsCount}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
                    {r.quotedItems}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <span
                      className={[
                        "tabular-nums font-medium",
                        r.coverageRate >= 80
                          ? "text-green-600"
                          : r.coverageRate >= 50
                            ? "text-amber-600"
                            : "text-red-500",
                      ].join(" ")}
                    >
                      {r.coverageRate}%
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-3 text-right text-xs text-slate-400">
                    {formatDate(r.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
