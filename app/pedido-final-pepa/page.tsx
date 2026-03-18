"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { OperationFeedback } from "@/components/operation-feedback";
import { PageHeader } from "@/components/page-header";
import { PepaFlowOverview } from "@/components/pepa-flow-overview";
import {
  FinalPurchaseSnapshot,
  derivePepaFinalPurchaseSnapshot,
  derivePepaWorkflowTotals
} from "@/lib/pepa-quotation-domain";
import { usePepaSnapshot } from "@/lib/use-pepa-snapshot";

export default function PedidoFinalPepaPage() {
  const searchParams = useSearchParams();
  const roundId = searchParams.get("roundId");
  const { snapshot: pepaSnapshot, isLoading, error } = usePepaSnapshot(roundId);
  const snapshot = derivePepaFinalPurchaseSnapshot(pepaSnapshot);
  const workflowTotals = derivePepaWorkflowTotals(pepaSnapshot);
  const isClosedRound = pepaSnapshot.latestRound?.status === "closed";
  const hasCriticalGaps =
    snapshot.totals.pendingItems > 0 ||
    workflowTotals.ocrQueue > 0 ||
    workflowTotals.manualReviewCount > 0;
  const canExportFinal = Boolean(pepaSnapshot.latestRound) && isClosedRound && !hasCriticalGaps;
  const [exportState, setExportState] = useState<{ format: "csv" | "xlsx"; status: "idle" | "loading" } | null>(null);
  const [exportMessage, setExportMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  async function handleExport(format: "csv" | "xlsx") {
    if (!canExportFinal) {
      setExportMessage({
        tone: "error",
        text: !pepaSnapshot.latestRound
          ? "Nenhuma rodada ativa disponivel para exportacao."
          : !isClosedRound
            ? "Feche a rodada antes de liberar a exportacao final."
            : "Ainda existem pendencias criticas. Resolva OCR, revisoes manuais e itens pendentes antes da exportacao final."
      });
      return;
    }

    setExportState({ format, status: "loading" });
    setExportMessage({
      tone: "info",
      text: `Gerando arquivo ${format.toUpperCase()} da rodada atual.`
    });

    const response = await fetch(`/api/pepa/export?format=${format}${roundId ? `&roundId=${roundId}` : ""}`);
    if (!response.ok) {
      let errorMessage = `Nao foi possivel gerar o arquivo ${format.toUpperCase()}.`;
      try {
        const payload = (await response.json()) as { error?: string };
        errorMessage = payload.error ?? errorMessage;
      } catch {}
      setExportMessage({
        tone: "error",
        text: errorMessage
      });
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
    setExportMessage({
      tone: "success",
      text: `Arquivo ${format.toUpperCase()} gerado com sucesso.`
    });
    setExportState(null);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Pedido Final"
        title="Consolidado final pronto para exportacao do comprador"
        description="O pedido final agora nasce da ultima rodada real de cotacao, carregando fornecedor principal, termos comerciais e itens pendentes de revisao antes da exportacao."
        action="Exportar pedido"
      />

      {pepaSnapshot.latestRound ? (
        <div className="mb-6 rounded-[28px] bg-brand-surface px-5 py-4 text-sm text-slate-600">
          {isClosedRound
            ? "Rodada fechada: exportacao liberada com trilha congelada para auditoria."
            : "Rodada aberta: voce ainda pode voltar para a validacao e ajustar itens antes da exportacao final."}
        </div>
      ) : null}

      {pepaSnapshot.latestRound && !canExportFinal ? (
        <div className="mb-6">
          <OperationFeedback
            tone="warning"
            title="Exportacao final bloqueada"
            message={
              !isClosedRound
                ? "A rodada ainda esta aberta. Feche a rodada em cotacoes quando a validacao estiver concluida."
                : `Ainda ha ${snapshot.totals.pendingItems} item(ns) pendente(s), ${workflowTotals.manualReviewCount} revisao(oes) manual(is) e ${workflowTotals.ocrQueue} arquivo(s) em OCR.`
            }
          />
        </div>
      ) : null}

      {isLoading ? (
        <div className="mb-6">
          <OperationFeedback
            tone="info"
            title="Preparando pedido final"
            message="Carregando consolidacao, termos comerciais e arquivos disponiveis para exportacao."
          />
        </div>
      ) : null}

      {error ? (
        <div className="mb-6">
          <OperationFeedback tone="error" title="Falha ao carregar pedido final" message={error} />
        </div>
      ) : null}

      {canExportFinal ? (
        <div className="mb-6">
          <OperationFeedback
            tone="success"
            title="Pacote liberado para saida"
            message="A rodada esta fechada, sem lacunas criticas e pronta para gerar o arquivo final do comprador."
          />
        </div>
      ) : null}

      {exportMessage ? (
        <div className="mb-6">
          <OperationFeedback
            tone={exportMessage.tone}
            title={
              exportMessage.tone === "success"
                ? "Exportacao concluida"
                : exportMessage.tone === "error"
                  ? "Falha na exportacao"
                  : "Gerando arquivo"
            }
            message={exportMessage.text}
          />
        </div>
      ) : null}

      <PepaFlowOverview currentStep="pedido-final" totals={workflowTotals} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pedido" value={snapshot.orderNumber} detail={`Espelho ${snapshot.mirrorNumber}`} />
        <MetricCard label="Fornecedor principal" value={snapshot.supplierName} detail={snapshot.paymentTerms} />
        <MetricCard label="Total consolidado" value={formatCurrency(snapshot.totals.totalValue)} detail={`${snapshot.totals.items} itens no pacote`} />
        <MetricCard label="Status do lote" value={snapshot.totals.pendingItems === 0 ? "Liberado" : "Parcial"} detail={`${snapshot.totals.pendingItems} item(ns) ainda pendentes`} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <article className="rounded-[32px] bg-white p-6 shadow-panel">
          <p className="text-sm text-slate-500">Pacote de exportacao</p>
          <h3 className="mt-1 text-xl font-semibold">Como o comprador fecha esse lote</h3>

          <div className="mt-6 grid gap-4">
            <ConnectorCard mode="file" active={snapshot.connectorMode === "file"} />
            <ConnectorCard mode="review" active={snapshot.connectorMode === "review"} />
            <ConnectorCard mode="archive" active={snapshot.connectorMode === "archive"} />
          </div>

          <div className="mt-6 rounded-[28px] bg-brand-surface p-5">
            <p className="text-sm font-medium text-brand-ink">Observacoes do lote</p>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              {snapshot.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          </div>
        </article>

        <article className="rounded-[32px] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Cabecalho do pedido</p>
              <h3 className="mt-1 text-xl font-semibold">Pacote final para aprovacao e exportacao</h3>
            </div>
            <span className={statusClasses(snapshot.totals.pendingItems === 0 ? "ready" : "pending")}>
              {canExportFinal ? "Pronto para exportar" : "Aguardando liberacao total"}
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <SummaryBlock label="Comprador" value={snapshot.buyerName} />
            <SummaryBlock label="Fornecedor" value={snapshot.supplierName} />
            <SummaryBlock label="Pagamento" value={snapshot.paymentTerms} />
            <SummaryBlock label="Frete" value={snapshot.freightTerms} />
            <SummaryBlock label="Quantidade total" value={formatQuantity(snapshot.totals.totalQuantity)} />
            <SummaryBlock label="Modo de saida" value={canExportFinal ? connectorLabel(snapshot.connectorMode) : "Bloqueado ate liberacao"} />
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-[32px] bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Linhas exportaveis</p>
            <h3 className="mt-1 text-xl font-semibold">Grade final para exportacao do comprador</h3>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-500">
              Esta tabela representa o arquivo final do processo a partir da rodada mais recente. Os itens pendentes seguem visiveis para impedir exportacao cega com lacunas de cotacao ou de termos comerciais.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full bg-brand-blue/10 px-4 py-2 text-sm font-medium text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
              disabled={exportState?.status === "loading" || !canExportFinal}
              onClick={() => void handleExport("xlsx")}
            >
              {exportState?.status === "loading" && exportState.format === "xlsx" ? "Gerando XLSX..." : "Exportar XLSX"}
            </button>
            <button
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={exportState?.status === "loading" || !canExportFinal}
              onClick={() => void handleExport("csv")}
            >
              {exportState?.status === "loading" && exportState.format === "csv" ? "Gerando CSV..." : "Exportar CSV"}
            </button>
          </div>
        </div>

        {!canExportFinal ? (
          <div className="mt-4">
            <OperationFeedback
              tone="warning"
              title="Saida final ainda nao liberada"
              message="A exportacao final fica bloqueada enquanto existir rodada aberta ou alguma lacuna critica de OCR, revisao manual ou item pendente."
            />
          </div>
        ) : null}
        {canExportFinal ? (
          <div className="mt-4">
            <OperationFeedback
              tone="info"
              title="Escolha o formato final"
              message="Use XLSX quando o comprador precisar revisar e ajustar no Excel; use CSV quando o destino exigir ingestao direta ou importacao simples."
            />
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-brand-muted">
                <th className="px-4">SKU</th>
                <th className="px-4">Descricao</th>
                <th className="px-4">Qtd</th>
                <th className="px-4">Fornecedor</th>
                <th className="px-4">Preco unit.</th>
                <th className="px-4">Total</th>
                <th className="px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.rows.map((row) => (
                <tr key={`${row.sku}-${row.description}`} className="bg-brand-surface text-sm text-slate-600">
                  <td className="rounded-l-[24px] px-4 py-4 font-medium text-brand-ink">{row.sku}</td>
                  <td className="px-4 py-4">{row.description}</td>
                  <td className="px-4 py-4">{formatQuantity(row.quantity)}</td>
                  <td className="px-4 py-4">{row.supplier}</td>
                  <td className="px-4 py-4">{formatCurrency(row.unitPrice)}</td>
                  <td className="px-4 py-4">{formatCurrency(row.total)}</td>
                  <td className="rounded-r-[24px] px-4 py-4">
                    <span className={statusClasses(row.status)}>{row.status === "ready" ? "Pronto" : "Pendente"}</span>
                  </td>
                </tr>
              ))}
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

function SummaryBlock(props: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] bg-brand-surface p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-brand-muted">{props.label}</p>
      <p className="mt-2 text-sm font-medium text-brand-ink">{props.value}</p>
    </div>
  );
}

function ConnectorCard(props: { mode: FinalPurchaseSnapshot["connectorMode"]; active: boolean }) {
  const descriptions = {
    file: "Gera um pacote Excel ou CSV mantendo a ordem do arquivo-base importado do Flex.",
    review: "Gera uma visao final para conferencia do comprador antes do fechamento do pedido.",
    archive: "Mantem historico da rodada de cotacao, anexos recebidos e justificativas da decisao."
  };

  return (
    <div className={["rounded-[28px] border p-5", props.active ? "border-brand-blue bg-brand-blue/5" : "border-slate-100 bg-white"].join(" ")}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-lg font-semibold text-brand-ink">{connectorLabel(props.mode)}</h4>
        <span className={props.active ? statusClasses("ready") : "rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500"}>
          {props.active ? "Modo ativo" : "Disponivel"}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{descriptions[props.mode]}</p>
    </div>
  );
}

function connectorLabel(mode: FinalPurchaseSnapshot["connectorMode"]) {
  if (mode === "file") {
    return "Exportacao por arquivo";
  }
  if (mode === "review") {
    return "Revisao final";
  }
  return "Historico da rodada";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function statusClasses(status: "ready" | "pending") {
  if (status === "ready") {
    return "inline-flex rounded-full bg-brand-success/10 px-3 py-1 text-xs font-semibold text-brand-success";
  }
  return "inline-flex rounded-full bg-brand-attention/10 px-3 py-1 text-xs font-semibold text-brand-attention";
}
