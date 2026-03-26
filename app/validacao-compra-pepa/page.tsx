"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { OperationFeedback } from "@/components/operation-feedback";
import { usePepaSnapshot } from "@/lib/use-pepa-snapshot";

export default function ValidacaoCompraPepaPage() {
  const searchParams = useSearchParams();
  const roundId = searchParams.get("roundId");
  const { snapshot: pepaSnapshot, isLoading, error } = usePepaSnapshot(roundId);

  // Usa diretamente as comparisonRows como fonte de verdade
  const rows = pepaSnapshot.comparisonRows;

  function hasPriceDivergence(row: (typeof rows)[0]) {
    if (row.baseUnitPrice == null || row.bestUnitPrice == null) return false;
    return Math.round(row.bestUnitPrice * 100) !== Math.round(row.baseUnitPrice * 100);
  }

  function isRowDivergent(row: (typeof rows)[0]) {
    if (row.selectionMode === "manual") return false;
    return hasPriceDivergence(row);
  }

  const divergentCount = rows.filter(isRowDivergent).length;
  const singleSupplier = pepaSnapshot.suppliers.length === 1 ? pepaSnapshot.suppliers[0].supplierName : null;

  const flexTotal = rows.reduce((sum, row) => {
    return sum + (row.baseUnitPrice != null ? row.baseUnitPrice * row.requestedQuantity : 0);
  }, 0);
  const quotedTotal = rows.reduce((sum, row) => {
    return sum + (row.bestTotal ?? 0);
  }, 0);
  const totalDiff = quotedTotal - flexTotal;
  const totalDiffPct = flexTotal > 0 ? (totalDiff / flexTotal) * 100 : 0;

  return (
    <div>
      {/* Voltar */}
      <div className="mb-6">
        <Link
          href={`/cotacoes-pepa${divergentCount > 0 ? "?showDivergences=true" : ""}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-brand-ink"
        >
          ← Voltar para Cotações
        </Link>
      </div>

      {isLoading && (
        <div className="mb-6">
          <OperationFeedback tone="info" title="Carregando" message="Buscando dados da rodada atual..." />
        </div>
      )}
      {error && (
        <div className="mb-6">
          <OperationFeedback tone="error" title="Erro" message={error} />
        </div>
      )}

      {/* Resumo financeiro */}
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[28px] bg-white p-5 shadow-panel">
          <p className="text-sm text-slate-500">Total Flex (esperado)</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-brand-ink">{formatCurrency(flexTotal)}</p>
          <p className="mt-3 text-sm text-slate-500">Valor original do pedido</p>
        </article>

        <article className="rounded-[28px] bg-white p-5 shadow-panel">
          <p className="text-sm text-slate-500">Total cotado</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-brand-ink">{formatCurrency(quotedTotal)}</p>
          <p className="mt-3 text-sm text-slate-500">Melhor oferta consolidada</p>
        </article>

        <article className={`rounded-[28px] p-5 shadow-panel ${totalDiff < 0 ? "bg-green-50" : totalDiff > 0 ? "bg-red-50" : "bg-white"}`}>
          <p className="text-sm text-slate-500">{totalDiff < 0 ? "Desconto obtido" : totalDiff > 0 ? "Acréscimo" : "Sem variação"}</p>
          <p className={`mt-3 text-3xl font-semibold tracking-tight ${totalDiff < 0 ? "text-green-700" : totalDiff > 0 ? "text-red-700" : "text-brand-ink"}`}>
            {totalDiff >= 0 ? "+" : ""}{formatCurrency(totalDiff)}
          </p>
          <p className={`mt-3 text-sm font-medium ${totalDiff < 0 ? "text-green-600" : totalDiff > 0 ? "text-red-600" : "text-slate-500"}`}>
            {totalDiffPct >= 0 ? "+" : ""}{totalDiffPct.toFixed(2)}% em relação ao Flex
          </p>
        </article>
      </section>

      {/* Tabela de itens */}
      <section className="mt-6 rounded-[32px] bg-white p-6 shadow-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Comparativo de cotações</p>
            <h3 className="mt-1 text-xl font-semibold">
              {divergentCount === 0
                ? "Todos os itens validados — pronto para o Pedido Final"
                : `${divergentCount} item(ns) com divergência de preço`}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            {divergentCount > 0 && (
              <Link
                href="/cotacoes-pepa?showDivergences=true"
                className="rounded-full bg-amber-100 px-5 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-200"
              >
                Ajustar pendências →
              </Link>
            )}
            {divergentCount === 0 && pepaSnapshot.latestRound && (
              <Link
                href="/pedido-final-pepa"
                className="rounded-full bg-brand-blue px-5 py-2.5 text-sm font-medium text-white shadow-panel hover:opacity-90"
              >
                Ir para Pedido Final →
              </Link>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-[24px] bg-brand-surface px-6 py-8 text-center text-sm text-slate-500">
            {pepaSnapshot.latestRound
              ? "Nenhum item comparativo disponível nesta rodada."
              : "Nenhuma rodada carregada. Importe os arquivos na tela de Cotações."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-3">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-brand-muted">
                  <th className="px-4">SKU</th>
                  <th className="px-4">Item</th>
                  <th className="px-4">Qtd</th>
                  <th className="px-4">Fornecedor</th>
                  <th className="px-4">Preço Flex</th>
                  <th className="px-4">Preço Cotado</th>
                  <th className="px-4">Dif.</th>
                  <th className="px-4">Total</th>
                  <th className="px-4">Situação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const priceDiv = hasPriceDivergence(row);
                  const divergent = isRowDivergent(row);
                  const diff =
                    row.baseUnitPrice != null && row.baseUnitPrice > 0 && row.bestUnitPrice != null
                      ? ((row.bestUnitPrice - row.baseUnitPrice) / row.baseUnitPrice) * 100
                      : 0;
                  return (
                    <tr
                      key={`${row.sku}-${row.description}`}
                      className="text-sm text-slate-600"
                      style={{ backgroundColor: divergent ? "#fef2f2" : "#f5f7fa" }}
                    >
                      <td className="rounded-l-[24px] px-4 py-4 font-medium text-brand-ink">{row.sku}</td>
                      <td className="px-4 py-4">{row.description}</td>
                      <td className="px-4 py-4">{formatQuantity(row.requestedQuantity)}</td>
                      <td className="px-4 py-4">{row.bestSupplier ?? singleSupplier ?? "—"}</td>
                      <td className="px-4 py-4 text-slate-500">
                        {row.baseUnitPrice != null ? formatCurrency(row.baseUnitPrice) : "—"}
                      </td>
                      <td className={`px-4 py-4 font-medium ${divergent && priceDiv ? "text-red-700" : "text-slate-700"}`}>
                        {row.bestUnitPrice != null ? formatCurrency(row.bestUnitPrice) : "—"}
                      </td>
                      <td className="px-4 py-4">
                        {priceDiv ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${diff > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                            {diff >= 0 ? "+" : ""}{diff.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">{row.bestTotal != null ? formatCurrency(row.bestTotal) : "—"}</td>
                      <td className="rounded-r-[24px] px-4 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          divergent
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}>
                          {divergent ? "Divergente" : "Cotado"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}
