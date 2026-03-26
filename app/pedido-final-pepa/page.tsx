"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { OperationFeedback } from "@/components/operation-feedback";
import { derivePepaFinalPurchaseSnapshot } from "@/lib/pepa-quotation-domain";
import { usePepaSnapshot } from "@/lib/use-pepa-snapshot";

export default function PedidoFinalPepaPage() {
  const searchParams = useSearchParams();
  const roundId = searchParams.get("roundId");
  const { snapshot: pepaSnapshot, isLoading, error } = usePepaSnapshot(roundId);
  const snapshot = derivePepaFinalPurchaseSnapshot(pepaSnapshot);
  const isClosedRound = pepaSnapshot.latestRound?.status === "closed";
  const canExport = Boolean(pepaSnapshot.latestRound) && isClosedRound;

  const [exportState, setExportState] = useState<{ format: "csv" | "xlsx"; status: "idle" | "loading" } | null>(null);
  const [exportMessage, setExportMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [closingRound, setClosingRound] = useState(false);

  async function handleCloseRound() {
    if (!pepaSnapshot.latestRound) return;
    setClosingRound(true);
    const res = await fetch("/api/pepa/round-status", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId: pepaSnapshot.latestRound.id, status: "closed" })
    });
    if (res.ok) {
      window.dispatchEvent(new Event("pepa-store-updated"));
    }
    setClosingRound(false);
  }

  async function handleExport(format: "csv" | "xlsx") {
    if (!canExport) return;
    setExportState({ format, status: "loading" });
    setExportMessage({ tone: "info", text: `Gerando arquivo ${format.toUpperCase()}...` });

    const response = await fetch(`/api/pepa/export?format=${format}${roundId ? `&roundId=${roundId}` : ""}`);
    if (!response.ok) {
      let errorMessage = `Nao foi possivel gerar o arquivo ${format.toUpperCase()}.`;
      try {
        const payload = (await response.json()) as { error?: string };
        errorMessage = payload.error ?? errorMessage;
      } catch {}
      setExportMessage({ tone: "error", text: errorMessage });
      setExportState(null);
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${snapshot.orderNumber}.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setExportMessage({ tone: "success", text: `Arquivo ${format.toUpperCase()} gerado com sucesso.` });
    setExportState(null);
  }

  return (
    <div>
      {/* Back button */}
      <div className="mb-6 print:hidden">
        <Link
          href="/validacao-compra-pepa"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-brand-ink"
        >
          ← Voltar para Validação
        </Link>
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-muted">Pedido Final</div>
      <h1 className="mb-6 text-2xl font-semibold text-brand-ink">Exportação do pedido de compra</h1>

      {isLoading && (
        <div className="mb-6">
          <OperationFeedback tone="info" title="Carregando" message="Preparando pedido final..." />
        </div>
      )}
      {error && (
        <div className="mb-6">
          <OperationFeedback tone="error" title="Erro" message={error} />
        </div>
      )}

      {/* Bloqueio: rodada ainda aberta */}
      {pepaSnapshot.latestRound && !isClosedRound && (
        <div className="mb-6 rounded-[28px] border border-amber-200 bg-amber-50 p-5 print:hidden">
          <p className="font-semibold text-amber-800">Exportacao bloqueada — rodada ainda aberta</p>
          <p className="mt-1 text-sm text-amber-700">
            Para exportar o pedido final, feche a rodada de cotações. Isso congela os dados para auditoria.
          </p>
          <button
            onClick={() => void handleCloseRound()}
            disabled={closingRound}
            className="mt-4 rounded-full bg-amber-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {closingRound ? "Fechando..." : "Fechar rodada agora"}
          </button>
        </div>
      )}

      {/* Liberado */}
      {canExport && (
        <div className="mb-6 rounded-[28px] border border-green-200 bg-green-50 p-5">
          <p className="font-semibold text-green-800">Rodada fechada — exportacao liberada</p>
          <p className="mt-1 text-sm text-green-700">O pedido esta consolidado e pronto para exportacao.</p>
        </div>
      )}

      {exportMessage && (
        <div className="mb-6">
          <OperationFeedback
            tone={exportMessage.tone}
            title={exportMessage.tone === "success" ? "Exportacao concluida" : exportMessage.tone === "error" ? "Erro" : "Gerando"}
            message={exportMessage.text}
          />
        </div>
      )}

      {/* Resumo do pedido */}
      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <article className="rounded-[28px] bg-white p-5 shadow-panel">
          <p className="text-sm text-slate-500">Pedido</p>
          <p className="mt-2 text-xl font-semibold text-brand-ink">{snapshot.orderNumber}</p>
        </article>
        <article className="rounded-[28px] bg-white p-5 shadow-panel">
          <p className="text-sm text-slate-500">Fornecedor principal</p>
          <p className="mt-2 text-xl font-semibold text-brand-ink">{snapshot.supplierName}</p>
          <p className="mt-1 text-sm text-slate-500">{snapshot.paymentTerms}</p>
        </article>
        <article className="rounded-[28px] bg-white p-5 shadow-panel">
          <p className="text-sm text-slate-500">Total consolidado</p>
          <p className="mt-2 text-xl font-semibold text-brand-ink">{formatCurrency(snapshot.totals.totalValue)}</p>
          <p className="mt-1 text-sm text-slate-500">{snapshot.totals.items} itens</p>
        </article>
        <article className="rounded-[28px] bg-white p-5 shadow-panel">
          <p className="text-sm text-slate-500">Status</p>
          <p className={`mt-2 text-xl font-semibold ${isClosedRound ? "text-green-700" : "text-amber-600"}`}>
            {isClosedRound ? "Rodada fechada" : "Rodada aberta"}
          </p>
        </article>
      </section>

      {/* Grade final */}
      <section className="rounded-[32px] bg-white p-6 shadow-panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Linhas exportáveis</p>
            <h3 className="mt-1 text-xl font-semibold">Grade final para exportação</h3>
          </div>
          <div className="flex gap-3 print:hidden">
            <button
              className="rounded-full bg-brand-blue px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={exportState?.status === "loading" || !canExport}
              onClick={() => void handleExport("xlsx")}
            >
              {exportState?.status === "loading" && exportState.format === "xlsx" ? "Gerando..." : "Exportar XLSX"}
            </button>
            <button
              className="rounded-full bg-slate-100 px-5 py-2.5 text-sm font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={exportState?.status === "loading" || !canExport}
              onClick={() => void handleExport("csv")}
            >
              {exportState?.status === "loading" && exportState.format === "csv" ? "Gerando..." : "Exportar CSV"}
            </button>
            <button
              className="rounded-full bg-slate-700 px-5 py-2.5 text-sm font-medium text-white"
              onClick={() => window.print()}
            >
              Imprimir / PDF
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-brand-muted">
                <th className="px-4">SKU Pepa</th>
                <th className="px-4">SKU Forn.</th>
                <th className="px-4">Descrição</th>
                <th className="px-4">Qtd</th>
                <th className="px-4">Fornecedor</th>
                <th className="px-4">Preço unit.</th>
                <th className="px-4">Total</th>
                <th className="px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="rounded-[24px] bg-brand-surface px-4 py-8 text-center text-sm text-slate-500">
                    Nenhum item disponível. Importe os arquivos na tela de Cotações.
                  </td>
                </tr>
              ) : (
                snapshot.rows.map((row) => {
                  const compRow = pepaSnapshot.comparisonRows.find((r) => r.sku === row.sku && r.description === row.description);
                  return (
                  <tr key={`${row.sku}-${row.description}`} className="bg-brand-surface text-sm text-slate-600">
                    <td className="rounded-l-[24px] px-4 py-4 font-medium text-brand-ink">{row.sku}</td>
                    <td className="px-4 py-4 text-slate-500">{compRow?.supplierRef ?? "—"}</td>
                    <td className="px-4 py-4">{row.description}</td>
                    <td className="px-4 py-4">{formatQuantity(row.quantity)}</td>
                    <td className="px-4 py-4">{row.supplier}</td>
                    <td className="px-4 py-4">{formatCurrency(row.unitPrice)}</td>
                    <td className="px-4 py-4">{formatCurrency(row.total)}</td>
                    <td className="rounded-r-[24px] px-4 py-4">
                      <span className={row.status === "ready"
                        ? "inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"
                        : "inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"}>
                        {row.status === "ready" ? "Pronto" : "Pendente"}
                      </span>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}
