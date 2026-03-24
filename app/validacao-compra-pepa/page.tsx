"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { OperationFeedback } from "@/components/operation-feedback";
import { derivePepaPurchaseValidationSnapshot } from "@/lib/pepa-quotation-domain";
import { usePepaSnapshot } from "@/lib/use-pepa-snapshot";

export default function ValidacaoCompraPepaPage() {
  const searchParams = useSearchParams();
  const roundId = searchParams.get("roundId");
  const { snapshot: pepaSnapshot, isLoading, error } = usePepaSnapshot(roundId);
  const snapshot = derivePepaPurchaseValidationSnapshot(pepaSnapshot);
  const isClosedRound = pepaSnapshot.latestRound?.status === "closed";
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  function hasPriceDivergence(item: (typeof snapshot.decisions)[0]) {
    return (
      item.baseUnitPrice != null &&
      Math.round(item.chosenUnitPrice * 100) !== Math.round(item.baseUnitPrice * 100)
    );
  }

  function divergenceType(item: (typeof snapshot.decisions)[0]): string {
    const noSupplier = item.chosenSupplier === "Aguardando definicao";
    const priceDiv = hasPriceDivergence(item);
    if (noSupplier) return "Sem fornecedor";
    if (priceDiv) return "Preco divergente";
    return "Pendente";
  }

  const divergentItems = snapshot.decisions.filter(
    (item) => hasPriceDivergence(item) || item.chosenSupplier === "Aguardando definicao" || item.manualReview
  );

  const flexTotal = snapshot.decisions.reduce((sum, item) => {
    return sum + (item.baseUnitPrice != null ? item.baseUnitPrice * item.requestedQuantity : item.chosenTotal);
  }, 0);
  const chosenTotal = snapshot.totals.totalValue;
  const totalDiff = chosenTotal - flexTotal;
  const totalDiffPct = flexTotal > 0 ? (totalDiff / flexTotal) * 100 : 0;

  async function handleSupplierChange(sku: string, description: string, supplierName: string, unitPrice: number | null) {
    if (!pepaSnapshot.latestRound) return;
    const key = `${sku}-${description}`;
    setSavingKey(key);
    setOperationMessage({ tone: "info", text: `Salvando decisao do item ${sku}...` });
    const response = await fetch("/api/pepa/selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roundId: pepaSnapshot.latestRound.id,
        sku,
        description,
        supplierName: supplierName === "__pending__" ? null : supplierName,
        unitPrice
      })
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setOperationMessage({ tone: "error", text: payload.error ?? `Nao foi possivel salvar o item ${sku}.` });
      setSavingKey(null);
      return;
    }
    setOperationMessage({ tone: "success", text: `Item ${sku} atualizado.` });
    window.dispatchEvent(new Event("pepa-store-updated"));
    setSavingKey(null);
  }

  return (
    <div>
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
      {operationMessage && (
        <div className="mb-6">
          <OperationFeedback
            tone={operationMessage.tone}
            title={operationMessage.tone === "success" ? "Salvo" : operationMessage.tone === "error" ? "Erro" : "Salvando"}
            message={operationMessage.text}
          />
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

      {/* Itens com divergencia */}
      <section className="mt-6 rounded-[32px] bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Itens que precisam de atencao</p>
            <h3 className="mt-1 text-xl font-semibold">
              {divergentItems.length === 0
                ? "Nenhuma divergencia encontrada"
                : `${divergentItems.length} item(ns) com divergencia ou pendencia`}
            </h3>
          </div>
          {isClosedRound && (
            <span className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">Rodada fechada</span>
          )}
        </div>

        {divergentItems.length === 0 ? (
          <div className="mt-6 rounded-[24px] bg-brand-surface px-6 py-8 text-center text-sm text-slate-500">
            {pepaSnapshot.latestRound
              ? "Todos os precos estao alinhados com o arquivo-base do Flex."
              : "Nenhuma rodada carregada ainda. Importe os arquivos na tela de cotacoes."}
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
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
                  <th className="px-4">Total cotado</th>
                  <th className="px-4">Tipo</th>
                  <th className="px-4">Revisao</th>
                </tr>
              </thead>
              <tbody>
                {divergentItems.map((item) => {
                  const priceDiv = hasPriceDivergence(item);
                  const diff = item.baseUnitPrice != null && item.baseUnitPrice > 0
                    ? ((item.chosenUnitPrice - item.baseUnitPrice) / item.baseUnitPrice) * 100
                    : 0;
                  const tipo = divergenceType(item);
                  const rowBg = item.chosenSupplier === "Aguardando definicao"
                    ? "bg-amber-50"
                    : priceDiv
                    ? "bg-red-50"
                    : "bg-slate-50";
                  return (
                    <tr key={`${item.sku}-${item.description}`} className={`${rowBg} text-sm text-slate-600`}>
                      <td className="rounded-l-[24px] px-4 py-4 font-medium text-brand-ink">{item.sku}</td>
                      <td className="px-4 py-4">{item.description}</td>
                      <td className="px-4 py-4">{formatQuantity(item.requestedQuantity)}</td>
                      <td className="px-4 py-4">
                        <select
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          disabled={!pepaSnapshot.latestRound || isClosedRound || savingKey === `${item.sku}-${item.description}`}
                          value={item.chosenSupplier === "Aguardando definicao" ? "__pending__" : item.chosenSupplier}
                          onChange={(e) => {
                            const value = e.target.value;
                            const row = pepaSnapshot.comparisonRows.find(
                              (r) => r.sku === item.sku && r.description === item.description
                            );
                            const offer = row?.offers?.find((o) => o.supplierName === value);
                            void handleSupplierChange(item.sku, item.description, value, offer?.unitPrice ?? null);
                          }}
                        >
                          <option value="__pending__">Aguardando definicao</option>
                          {(pepaSnapshot.comparisonRows.find(
                            (r) => r.sku === item.sku && r.description === item.description
                          )?.offers ?? []).map((offer) => (
                            <option key={offer.supplierName} value={offer.supplierName}>
                              {offer.supplierName} · {formatCurrency(offer.unitPrice)}
                            </option>
                          ))}
                        </select>
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
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          tipo === "Sem fornecedor" ? "bg-amber-100 text-amber-700" :
                          tipo === "Preco divergente" ? "bg-red-100 text-red-700" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {tipo}
                        </span>
                      </td>
                      <td className="rounded-r-[24px] px-4 py-4">
                        <span className={item.manualReview
                          ? "inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
                          : "inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"}>
                          {item.manualReview ? "Pendente" : "Aprovado"}
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
