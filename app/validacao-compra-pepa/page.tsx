"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { OperationFeedback } from "@/components/operation-feedback";
import { PageHeader } from "@/components/page-header";
import { PepaFlowOverview } from "@/components/pepa-flow-overview";
import {
  derivePepaPurchaseValidationSnapshot,
  derivePepaWorkflowTotals
} from "@/lib/pepa-quotation-domain";
import { usePepaSnapshot } from "@/lib/use-pepa-snapshot";

export default function ValidacaoCompraPepaPage() {
  const searchParams = useSearchParams();
  const roundId = searchParams.get("roundId");
  const { snapshot: pepaSnapshot, isLoading, error } = usePepaSnapshot(roundId);
  const snapshot = derivePepaPurchaseValidationSnapshot(pepaSnapshot);
  const workflowTotals = derivePepaWorkflowTotals(pepaSnapshot);
  const isClosedRound = pepaSnapshot.latestRound?.status === "closed";
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [supplierDrafts, setSupplierDrafts] = useState<Record<string, { paymentTerms: string; freightTerms: string }>>({});
  const [operationMessage, setOperationMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  async function handleSupplierChange(sku: string, description: string, supplierName: string, unitPrice: number | null) {
    if (!pepaSnapshot.latestRound) {
      return;
    }

    const key = `${sku}-${description}`;
    setSavingKey(key);
    setOperationMessage({
      tone: "info",
      text: `Salvando decisao do item ${sku} e atualizando a consolidacao.`
    });

    const response = await fetch("/api/pepa/selection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
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
      setOperationMessage({
        tone: "error",
        text: payload.error ?? `Nao foi possivel salvar a decisao do item ${sku}.`
      });
      setSavingKey(null);
      return;
    }

    setOperationMessage({
      tone: "success",
      text: `Decisao do item ${sku} salva com sucesso.`
    });
    window.dispatchEvent(new Event("pepa-store-updated"));
    setSavingKey(null);
  }

  async function handleSupplierTermsSave(supplierName: string) {
    if (!pepaSnapshot.latestRound) {
      return;
    }

    const draft = supplierDrafts[supplierName];
    if (!draft) {
      return;
    }

    setSavingKey(`terms-${supplierName}`);
    setOperationMessage({
      tone: "info",
      text: `Salvando condicoes comerciais de ${supplierName}.`
    });
    const response = await fetch("/api/pepa/supplier-terms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        roundId: pepaSnapshot.latestRound.id,
        supplierName,
        paymentTerms: draft.paymentTerms,
        freightTerms: draft.freightTerms
      })
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setOperationMessage({
        tone: "error",
        text: payload.error ?? `Nao foi possivel salvar as condicoes de ${supplierName}.`
      });
      setSavingKey(null);
      return;
    }
    setOperationMessage({
      tone: "success",
      text: `Condicoes comerciais de ${supplierName} atualizadas com sucesso.`
    });
    window.dispatchEvent(new Event("pepa-store-updated"));
    setSavingKey(null);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Validacao PEPA"
        title="Etapa final antes da montagem do pedido de compra"
        description="A validacao agora consome a ultima rodada real de cotacao. O comprador revisa itens sem oferta, termos comerciais incompletos e a consolidacao final respeitando a ordem do arquivo-base."
        action="Fechar selecao"
        actionDisabled={isClosedRound}
        actionHint={isClosedRound ? "Rodada fechada: reabra na tela de cotacoes para editar." : undefined}
      />

      {isClosedRound ? (
        <div className="mb-6 rounded-[28px] bg-slate-900 px-5 py-4 text-sm text-white">
          Esta rodada esta fechada. A validacao permanece disponivel para consulta, mas sem edicao ate a rodada ser reaberta.
        </div>
      ) : null}

      {isLoading ? (
        <div className="mb-6">
          <OperationFeedback
            tone="info"
            title="Atualizando validacao"
            message="Carregando itens, fornecedores e regras da rodada atual."
          />
        </div>
      ) : null}

      {error ? (
        <div className="mb-6">
          <OperationFeedback tone="error" title="Falha ao carregar validacao" message={error} />
        </div>
      ) : null}

      {operationMessage ? (
        <div className="mb-6">
          <OperationFeedback
            tone={operationMessage.tone}
            title={
              operationMessage.tone === "success"
                ? "Alteracoes aplicadas"
                : operationMessage.tone === "error"
                  ? "Falha na validacao"
                  : "Salvando validacao"
            }
            message={operationMessage.text}
          />
        </div>
      ) : null}

      <div className="mb-6">
        <OperationFeedback
          tone={
            isClosedRound
              ? "info"
              : snapshot.totals.manualReviewCount > 0
                ? "warning"
                : "success"
          }
          title={
            isClosedRound
              ? "Rodada em modo consulta"
              : snapshot.totals.manualReviewCount > 0
                ? "Validacao ainda exige revisao"
                : "Validacao pronta para fechamento"
          }
          message={
            isClosedRound
              ? "Use esta tela para auditoria do fechamento atual. Para editar novamente, reabra a rodada em cotacoes."
              : snapshot.totals.manualReviewCount > 0
                ? `Ainda existem ${snapshot.totals.manualReviewCount} item(ns) em revisao manual ou sem decisao final clara.`
                : "Os itens principais ja estao consolidados. Se frete e pagamento estiverem corretos, voce pode seguir para fechar a rodada."
          }
        />
      </div>

      <PepaFlowOverview currentStep="validacao" totals={workflowTotals} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Itens selecionados" value={String(snapshot.totals.selectedItems)} detail="Prontos para consolidacao" />
        <MetricCard label="Fornecedores no pedido" value={String(snapshot.totals.suppliersInOrder)} detail="Consolidacao comercial" />
        <MetricCard label="Itens em revisao" value={String(snapshot.totals.manualReviewCount)} detail="Exigem checagem final" />
        <MetricCard label="Valor do pedido" value={formatCurrency(snapshot.totals.totalValue)} detail="Resumo da pre-compra" />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.84fr_1.16fr]">
        <article className="rounded-[32px] bg-white p-6 shadow-panel">
          <p className="text-sm text-slate-500">Checklist</p>
          <h3 className="mt-1 text-xl font-semibold">O que o comprador valida aqui</h3>

          <div className="mt-6 space-y-4">
            {snapshot.alerts.map((alert) => (
              <div key={alert.title} className={["rounded-[28px] p-5", alert.severity === "warning" ? "bg-amber-50" : "bg-sky-50"].join(" ")}>
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-lg font-semibold text-brand-ink">{alert.title}</h4>
                  <span className={alertBadgeClasses(alert.severity)}>{alert.severity === "warning" ? "Atencao" : "Info"}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{alert.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[28px] bg-brand-surface p-5">
            <p className="text-sm font-medium text-brand-ink">Procedimentos desta etapa</p>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <p>1. confirmar itens ainda sem cotacao reconciliada</p>
              <p>2. validar frete, prazo e condicao comercial detectados</p>
              <p>3. decidir se mantem ou troca fornecedor por item</p>
              <p>4. preservar a ordem final conforme o arquivo-base importado</p>
            </div>
          </div>
        </article>

        <article className="rounded-[32px] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Fechamento por fornecedor</p>
              <h3 className="mt-1 text-xl font-semibold">Resumo comercial antes do pedido</h3>
            </div>
            <span className="rounded-full bg-brand-blue/10 px-4 py-2 text-sm font-medium text-brand-blue">Pre-pedido</span>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.supplierSummaries.map((supplier) => (
              <div key={supplier.supplierName} className="rounded-[28px] bg-brand-surface p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-lg font-semibold text-brand-ink">{supplier.supplierName}</h4>
                    <p className="mt-1 text-sm text-slate-500">{supplier.notes}</p>
                  </div>
                  <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-brand-ink">{formatCurrency(supplier.totalValue)}</div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <SummaryStat label="Itens" value={String(supplier.itemsSelected)} />
                  <SummaryStat label="Pagamento" value={supplier.paymentTerms} />
                  <SummaryStat label="Frete" value={supplier.freightTerms} />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <input
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    placeholder="Pagamento manual"
                    value={supplierDrafts[supplier.supplierName]?.paymentTerms ?? supplier.paymentTerms}
                    disabled={isClosedRound}
                    onChange={(event) =>
                      setSupplierDrafts((current) => ({
                        ...current,
                        [supplier.supplierName]: {
                          paymentTerms: event.target.value,
                          freightTerms: current[supplier.supplierName]?.freightTerms ?? supplier.freightTerms
                        }
                      }))
                    }
                  />
                  <input
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    placeholder="Frete manual"
                    value={supplierDrafts[supplier.supplierName]?.freightTerms ?? supplier.freightTerms}
                    disabled={isClosedRound}
                    onChange={(event) =>
                      setSupplierDrafts((current) => ({
                        ...current,
                        [supplier.supplierName]: {
                          paymentTerms: current[supplier.supplierName]?.paymentTerms ?? supplier.paymentTerms,
                          freightTerms: event.target.value
                        }
                      }))
                    }
                  />
                  <button
                    className="rounded-full bg-slate-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                    disabled={!pepaSnapshot.latestRound || isClosedRound || savingKey === `terms-${supplier.supplierName}`}
                    onClick={() => handleSupplierTermsSave(supplier.supplierName)}
                  >
                    {savingKey === `terms-${supplier.supplierName}` ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-[32px] bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Selecao final por item</p>
            <h3 className="mt-1 text-xl font-semibold">Grade de validacao antes de gerar o pedido</h3>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-500">
              Esta grade agora nasce do comparativo real da ultima rodada. Itens sem oferta ou com condicao comercial incompleta permanecem em revisao antes da exportacao.
            </p>
          </div>
          <div className="rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700">Ordem final preservada</div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-brand-muted">
                <th className="px-4">SKU</th>
                <th className="px-4">Item</th>
                <th className="px-4">Qtd</th>
                <th className="px-4">Fornecedor escolhido</th>
                <th className="px-4">Preco Flex</th>
                <th className="px-4">Preco unit.</th>
                <th className="px-4">Dif.</th>
                <th className="px-4">Total</th>
                <th className="px-4">Motivo</th>
                <th className="px-4">Revisao</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.decisions.map((item) => {
                const hasPriceDiff = item.baseUnitPrice != null && Math.abs(item.chosenUnitPrice - item.baseUnitPrice) > 0.001;
                const rowBg = hasPriceDiff ? "bg-red-50" : "bg-brand-surface";
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
                      onChange={(event) => {
                        const value = event.target.value;
                        const row = pepaSnapshot.comparisonRows.find(
                          (candidate) => candidate.sku === item.sku && candidate.description === item.description
                        );
                        const offer = row?.offers?.find((candidate) => candidate.supplierName === value);
                        void handleSupplierChange(item.sku, item.description, value, offer?.unitPrice ?? null);
                      }}
                    >
                      <option value="__pending__">Aguardando definicao</option>
                      {(pepaSnapshot.comparisonRows.find(
                        (row) => row.sku === item.sku && row.description === item.description
                      )?.offers ?? []).map((offer) => (
                        <option key={`${item.sku}-${offer.supplierName}`} value={offer.supplierName}>
                          {offer.supplierName} · {formatCurrency(offer.unitPrice)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4 text-slate-500">
                    {item.baseUnitPrice != null ? formatCurrency(item.baseUnitPrice) : "—"}
                  </td>
                  <td className="px-4 py-4">
                    <input
                      className="w-28 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      defaultValue={String(item.chosenUnitPrice)}
                      disabled={!pepaSnapshot.latestRound || isClosedRound || savingKey === `${item.sku}-${item.description}`}
                      onBlur={(event) => {
                        const value = Number(event.target.value.replace(",", "."));
                        if (!Number.isFinite(value) || value <= 0) {
                          event.target.value = String(item.chosenUnitPrice);
                          return;
                        }

                        void handleSupplierChange(
                          item.sku,
                          item.description,
                          item.chosenSupplier === "Aguardando definicao" ? "__pending__" : item.chosenSupplier,
                          value
                        );
                      }}
                    />
                  </td>
                  <td className="px-4 py-4">
                    {hasPriceDiff && item.baseUnitPrice != null
                      ? formatPriceDiffBadge(item.baseUnitPrice, item.chosenUnitPrice)
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-4">{formatCurrency(item.chosenTotal)}</td>
                  <td className="px-4 py-4">{item.decisionReason}</td>
                  <td className="rounded-r-[24px] px-4 py-4">
                    <div className="flex flex-col gap-2">
                      <span className={reviewClasses(item.manualReview)}>{item.manualReview ? "Pendente" : "Aprovado"}</span>
                      {savingKey === `${item.sku}-${item.description}` ? (
                        <span className="text-xs text-slate-400">Salvando...</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricCard(props: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-[28px] bg-white p-5 shadow-panel">
      <p className="text-sm text-slate-500">{props.label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-brand-ink">{props.value}</p>
      <p className="mt-3 text-sm font-medium text-brand-blue">{props.detail}</p>
    </article>
  );
}

function SummaryStat(props: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] bg-white p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-brand-muted">{props.label}</p>
      <p className="mt-2 text-sm font-medium text-brand-ink">{props.value}</p>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatPriceDiffBadge(baseUnitPrice: number, chosenUnitPrice: number) {
  const diff = ((chosenUnitPrice - baseUnitPrice) / baseUnitPrice) * 100;
  const label = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${diff > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
      {label}
    </span>
  );
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function alertBadgeClasses(severity: "warning" | "info") {
  if (severity === "warning") {
    return "rounded-full bg-brand-attention/10 px-3 py-1 text-xs font-semibold text-brand-attention";
  }

  return "rounded-full bg-brand-blue/10 px-3 py-1 text-xs font-semibold text-brand-blue";
}

function reviewClasses(pending: boolean) {
  if (pending) {
    return "inline-flex rounded-full bg-brand-attention/10 px-3 py-1 text-xs font-semibold text-brand-attention";
  }

  return "inline-flex rounded-full bg-brand-success/10 px-3 py-1 text-xs font-semibold text-brand-success";
}
