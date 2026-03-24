"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { OperationFeedback } from "@/components/operation-feedback";
import { derivePepaPurchaseValidationSnapshot } from "@/lib/pepa-quotation-domain";
import { usePepaSnapshot } from "@/lib/use-pepa-snapshot";

export default function ValidacaoCompraPepaPage() {
  const searchParams = useSearchParams();
  const roundId = searchParams.get("roundId");
  const { snapshot: pepaSnapshot, isLoading, error } = usePepaSnapshot(roundId);
  const snapshot = derivePepaPurchaseValidationSnapshot(pepaSnapshot);

  function hasPriceDivergence(item: (typeof snapshot.decisions)[0]) {
    return (
      item.baseUnitPrice != null &&
      Math.round(item.chosenUnitPrice * 100) !== Math.round(item.baseUnitPrice * 100)
    );
  }

  // Only show items that truly need attention:
  // - price differs from Flex AND the user has NOT manually accepted it in Cotações
  // - no supplier selected yet
  const divergentItems = snapshot.decisions.filter((item) => {
    const compRow = pepaSnapshot.comparisonRows.find(
      (r) => r.sku === item.sku && r.description === item.description
    );
    const wasAccepted = compRow?.selectionMode === "manual";
    if (wasAccepted) return false;

    return hasPriceDivergence(item) || item.chosenSupplier === "Aguardando definicao";
  });

  const flexTotal = snapshot.decisions.reduce((sum, item) => {
    return sum + (item.baseUnitPrice != null ? item.baseUnitPrice * item.requestedQuantity : item.chosenTotal);
  }, 0);
  const chosenTotal = snapshot.totals.totalValue;
  const totalDiff = chosenTotal - flexTotal;
  const totalDiffPct = flexTotal > 0 ? (totalDiff / flexTotal) * 100 : 0;

  return (
    <div>
      {/* Back button */}
      <div className="mb-6">
        <Link
          href="/cotacoes-pepa"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-brand-ink"
        >
          ← Voltar para Cotacoes
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
          <p className="mt-3 text-3xl font-semibold tracking-tight text-brand-ink">{formatCurrency(chosenTotal)}</p>
          <p className="mt-3 text-sm text-slate-500">Melhor oferta consolidada</p>
        </article>

        <article className={`rounded-[28px] p-5 shadow-panel ${totalDiff < 0 ? "bg-green-50" : totalDiff > 0 ? "bg-red-50" : "bg-white"}`}>
          <p className="text-sm text-slate-500">{totalDiff < 0 ? "Desconto obtido" : totalDiff > 0 ? "Acrescimo" : "Sem variacao"}</p>
          <p className={`mt-3 text-3xl font-semibold tracking-tight ${totalDiff < 0 ? "text-green-700" : totalDiff > 0 ? "text-red-700" : "text-brand-ink"}`}>
            {totalDiff >= 0 ? "+" : ""}{formatCurrency(totalDiff)}
          </p>
          <p className={`mt-3 text-sm font-medium ${totalDiff < 0 ? "text-green-600" : totalDiff > 0 ? "text-red-600" : "text-slate-500"}`}>
            {totalDiffPct >= 0 ? "+" : ""}{totalDiffPct.toFixed(2)}% em relacao ao Flex
          </p>
        </article>
      </section>

      {/* Price comparison chart */}
      {(() => {
        const chartData = pepaSnapshot.comparisonRows
          .filter((r) => r.baseUnitPrice != null && r.bestUnitPrice != null)
          .map((r) => ({
            name: r.sku,
            label: r.description.split(" ").slice(0, 3).join(" "),
            flex: r.baseUnitPrice!,
            cotado: r.bestUnitPrice!,
            diff: r.bestUnitPrice! - r.baseUnitPrice!
          }));
        if (chartData.length === 0) return null;
        return (
          <section className="mt-6 rounded-[32px] bg-white p-6 shadow-panel">
            <p className="text-sm text-slate-500">Comparativo visual</p>
            <h3 className="mt-1 mb-5 text-xl font-semibold">Preco Flex vs Cotado por item</h3>
            <div className="overflow-x-auto">
              <div style={{ width: Math.max(chartData.length * 60, 600), height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={2} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) =>
                        new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v)
                      }
                      width={68}
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value)),
                        name === "flex" ? "Preco Flex" : "Preco Cotado"
                      ]}
                      labelFormatter={(label) => {
                        const item = chartData.find((d) => d.name === label);
                        return item ? `${label} — ${item.label}` : label;
                      }}
                      contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 4px 24px rgba(0,0,0,0.10)", fontSize: 12 }}
                    />
                    <Bar dataKey="flex" name="flex" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="cotado" name="cotado" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.diff < -0.005 ? "#22c55e" : entry.diff > 0.005 ? "#ef4444" : "#3b82f6"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-5 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-300" /> Preco Flex</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" /> Cotado abaixo</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> Cotado acima</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" /> Preco igual</span>
            </div>
          </section>
        );
      })()}

      {/* Itens com pendencia */}
      <section className="mt-6 rounded-[32px] bg-white p-6 shadow-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Pendencias de validacao</p>
            <h3 className="mt-1 text-xl font-semibold">
              {divergentItems.length === 0
                ? "Nenhuma pendencia — tudo aprovado"
                : `${divergentItems.length} item(ns) com preco ou fornecedor pendente`}
            </h3>
          </div>
          {divergentItems.length === 0 && (
            <Link
              href="/pedido-final-pepa"
              className="rounded-full bg-brand-blue px-5 py-2.5 text-sm font-medium text-white shadow-panel hover:opacity-90"
            >
              Ir para Pedido Final →
            </Link>
          )}
        </div>

        {divergentItems.length === 0 ? (
          <div className="rounded-[24px] bg-green-50 px-6 py-8 text-center text-sm font-medium text-green-700">
            {pepaSnapshot.latestRound
              ? "Todos os itens foram validados. Pode prosseguir para o Pedido Final."
              : "Nenhuma rodada carregada ainda. Importe os arquivos na tela de Cotacoes."}
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-500">
              Volte para <Link href="/cotacoes-pepa" className="font-medium text-brand-blue hover:underline">Cotacoes</Link> para aceitar ou ajustar os itens abaixo.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.2em] text-brand-muted">
                    <th className="px-4">SKU</th>
                    <th className="px-4">Item</th>
                    <th className="px-4">Qtd</th>
                    <th className="px-4">Fornecedor</th>
                    <th className="px-4">Preco Flex</th>
                    <th className="px-4">Preco Cotado</th>
                    <th className="px-4">Dif.</th>
                    <th className="px-4">Total</th>
                    <th className="px-4">Situacao</th>
                  </tr>
                </thead>
                <tbody>
                  {divergentItems.map((item) => {
                    const priceDiv = hasPriceDivergence(item);
                    const noSupplier = item.chosenSupplier === "Aguardando definicao";
                    const diff =
                      item.baseUnitPrice != null && item.baseUnitPrice > 0
                        ? ((item.chosenUnitPrice - item.baseUnitPrice) / item.baseUnitPrice) * 100
                        : 0;
                    return (
                      <tr
                        key={`${item.sku}-${item.description}`}
                        className={`text-sm text-slate-600 ${noSupplier ? "bg-amber-50" : "bg-red-50"}`}
                      >
                        <td className="rounded-l-[24px] px-4 py-4 font-medium text-brand-ink">{item.sku}</td>
                        <td className="px-4 py-4">{item.description}</td>
                        <td className="px-4 py-4">{formatQuantity(item.requestedQuantity)}</td>
                        <td className="px-4 py-4">
                          {noSupplier ? (
                            <span className="text-amber-600">Aguardando definicao</span>
                          ) : (
                            <span>{item.chosenSupplier}</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-slate-500">
                          {item.baseUnitPrice != null ? formatCurrency(item.baseUnitPrice) : "—"}
                        </td>
                        <td className={`px-4 py-4 font-medium ${priceDiv ? "text-red-700" : "text-slate-700"}`}>
                          {formatCurrency(item.chosenUnitPrice)}
                        </td>
                        <td className="px-4 py-4">
                          {priceDiv ? (
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${diff > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                              {diff >= 0 ? "+" : ""}{diff.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4">{formatCurrency(item.chosenTotal)}</td>
                        <td className="rounded-r-[24px] px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            noSupplier
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                          }`}>
                            {noSupplier ? "Sem fornecedor" : "Preco divergente"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
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
