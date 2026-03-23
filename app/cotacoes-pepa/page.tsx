"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { OperationFeedback } from "@/components/operation-feedback";
import { PageHeader } from "@/components/page-header";
import { PepaFlowOverview } from "@/components/pepa-flow-overview";
import { PepaUploadRoundSummary, getPepaWorkflowTotals } from "@/lib/pepa-quotation-domain";
import { usePepaSnapshot } from "@/lib/use-pepa-snapshot";

export default function CotacoesPepaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roundId = searchParams.get("roundId");
  const { snapshot, isLoading: isLoadingSnapshot, error: snapshotError } = usePepaSnapshot(roundId);
  const workflowTotals = getPepaWorkflowTotals();
  const uploadRef = useRef<HTMLDivElement | null>(null);
  const mirrorInputRef = useRef<HTMLInputElement | null>(null);
  const supplierInputRef = useRef<HTMLInputElement | null>(null);
  const [mirrorFile, setMirrorFile] = useState<File | null>(null);
  const [supplierFiles, setSupplierFiles] = useState<File[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rounds, setRounds] = useState<PepaUploadRoundSummary[]>([]);
  const [isTogglingRound, setIsTogglingRound] = useState(false);
  const [roundStatusMessage, setRoundStatusMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showOnlyDivergences, setShowOnlyDivergences] = useState(false);
  const [savingRowKey, setSavingRowKey] = useState<string | null>(null);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [adjustedPrice, setAdjustedPrice] = useState("");
  const [expandedOffersKey, setExpandedOffersKey] = useState<string | null>(null);

  async function saveSelection(sku: string, description: string, supplierName: string | null, unitPrice: number | null) {
    if (!snapshot.latestRound) return;
    const rowKey = `${sku}-${description}`;
    setSavingRowKey(rowKey);
    try {
      const res = await fetch("/api/pepa/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ roundId: snapshot.latestRound.id, sku, description, supplierName, unitPrice })
      });
      if (res.ok) {
        window.dispatchEvent(new Event("pepa-store-updated"));
      }
    } finally {
      setSavingRowKey(null);
      setEditingRowKey(null);
      setAdjustedPrice("");
    }
  }

  function forceLoginRedirect(message: string) {
    setStatusMessage({
      tone: "error",
      text: message
    });
    window.setTimeout(() => {
      window.location.assign("/login");
    }, 150);
  }

  useEffect(() => {
    let active = true;

    async function loadRounds() {
      if (active) {
        setHistoryError(null);
      }
      const response = await fetch("/api/pepa/history", {
        cache: "no-store",
        credentials: "same-origin"
      });
      if (response.status === 401) {
        if (active) {
          setHistoryError("Sua sessao expirou. Entre novamente para continuar.");
        }
        window.dispatchEvent(new Event("pepa-auth-expired"));
        return;
      }
      if (!response.ok) {
        if (active) {
          setHistoryError("Nao foi possivel carregar o historico de rodadas agora.");
        }
        return;
      }

      const payload = (await response.json()) as { rounds: PepaUploadRoundSummary[] };
      if (active) {
        setRounds(payload.rounds);
      }
    }

    loadRounds();
    const handleRefresh = () => {
      void loadRounds();
    };
    const handleAuthExpired = () => {
      forceLoginRedirect("Sua sessao expirou. Redirecionando para o login.");
    };
    window.addEventListener("pepa-store-updated", handleRefresh);
    window.addEventListener("pepa-auth-expired", handleAuthExpired);
    return () => {
      active = false;
      window.removeEventListener("pepa-store-updated", handleRefresh);
      window.removeEventListener("pepa-auth-expired", handleAuthExpired);
    };
  }, [router]);

  async function handleSubmit() {
    if (!mirrorFile || supplierFiles.length === 0) {
      setStatusMessage({
        tone: "error",
        text: "Selecione o arquivo-base do Flex e pelo menos um anexo de fornecedor."
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage({
      tone: "info",
      text: "Enviando arquivos, registrando a rodada e preparando a leitura inicial dos anexos."
    });

    const formData = new FormData();
    formData.append("mirrorFile", mirrorFile);
    supplierFiles.forEach((file) => formData.append("supplierFiles", file));

    const response = await fetch("/api/pepa/upload", {
      method: "POST",
      body: formData,
      credentials: "same-origin"
    });

    const payload = (await response.json()) as {
      error?: string;
      snapshot?: {
        latestRound: { requestedItemsCount: number; supplierFilesCount: number } | null;
        diagnostics: { parsedSuppliers: number; ocrSuppliers: number; manualReviewSuppliers: number; mirrorStructured: boolean; mirrorFormat: string | null; storedForReviewAttachments: number };
        totals: { attachmentsReceived: number };
      };
    };
    if (response.status === 401) {
      setIsSubmitting(false);
      forceLoginRedirect("Sua sessao expirou. Entre novamente antes de salvar a rodada.");
      return;
    }
    if (!response.ok) {
      setStatusMessage({
        tone: "error",
        text: payload.error ?? "Falha ao salvar a rodada de cotacao."
      });
      setIsSubmitting(false);
      return;
    }

    const requestedItemsCount = payload.snapshot?.latestRound?.requestedItemsCount ?? 0;
    const parsedSuppliers = payload.snapshot?.diagnostics?.parsedSuppliers ?? 0;
    const ocrSuppliers = payload.snapshot?.diagnostics?.ocrSuppliers ?? 0;
    const manualReviewSuppliers = payload.snapshot?.diagnostics?.manualReviewSuppliers ?? 0;
    const supplierFilesCount = payload.snapshot?.latestRound?.supplierFilesCount ?? supplierFiles.length;
    const attachmentsReceived = payload.snapshot?.totals?.attachmentsReceived ?? supplierFiles.length + (mirrorFile ? 1 : 0);
    const mirrorWasStructured = requestedItemsCount > 0;
    const storedForReviewAttachments = payload.snapshot?.diagnostics?.storedForReviewAttachments ?? 0;
    const supplierSummary =
      parsedSuppliers > 0
        ? `${parsedSuppliers} anexo(s) de fornecedor ja entraram na leitura automatica`
        : supplierFilesCount > 0
          ? "os anexos de fornecedor foram salvos, mas ainda nao entraram em leitura automatica"
          : "nenhum anexo de fornecedor foi associado";

    setStatusMessage({
      tone: "success",
      text: mirrorWasStructured
        ? `Rodada salva com sucesso. ${requestedItemsCount} item(ns) foram estruturado(s) a partir do arquivo-base, ${supplierSummary}, ${ocrSuppliers} arquivo(s) ficaram na fila OCR e ${manualReviewSuppliers} ficaram apenas para revisao manual.`
        : `Rodada salva com sucesso, mas o arquivo-base ainda nao gerou itens estruturados automaticamente. ${attachmentsReceived} arquivo(s) foram vinculados a esta rodada; ${storedForReviewAttachments} arquivo(s) ficaram apenas para revisao manual e o comparativo imediato continua dependendo de CSV, TXT ou XLSX estruturado.`
    });
    setMirrorFile(null);
    setSupplierFiles([]);
    if (mirrorInputRef.current) {
      mirrorInputRef.current.value = "";
    }
    if (supplierInputRef.current) {
      supplierInputRef.current.value = "";
    }
    window.dispatchEvent(new Event("pepa-store-updated"));
    setIsSubmitting(false);
  }

  async function handleRoundStatusChange(nextStatus: "open" | "closed") {
    if (!snapshot.latestRound) {
      return;
    }

    if (nextStatus === "closed") {
      const shouldClose = window.confirm(
        [
          "Fechar esta rodada agora?",
          `Itens ainda pendentes: ${snapshot.totals.requestedItems - snapshot.totals.quotedItems}`,
          `Fila OCR atual: ${snapshot.totals.ocrQueue}`,
          "Depois disso, validacao e ajustes ficam bloqueados ate a rodada ser reaberta."
        ].join("\n")
      );

      if (!shouldClose) {
        setRoundStatusMessage({
          tone: "info",
          text: "Fechamento cancelado. A rodada continua aberta para revisao."
        });
        return;
      }
    }

    setIsTogglingRound(true);
    setRoundStatusMessage({
      tone: "info",
      text: nextStatus === "closed" ? "Fechando rodada e congelando a trilha para auditoria." : "Reabrindo rodada para novas edicoes."
    });
    const response = await fetch("/api/pepa/round-status", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        roundId: snapshot.latestRound.id,
        status: nextStatus
      })
    });
    const payload = (await response.json()) as { error?: string };
    if (response.status === 401) {
      setIsTogglingRound(false);
      setRoundStatusMessage({
        tone: "error",
        text: "Sua sessao expirou. Entre novamente para alterar a rodada."
      });
      window.setTimeout(() => {
        window.location.assign("/login");
      }, 150);
      return;
    }
    if (!response.ok) {
      setRoundStatusMessage({
        tone: "error",
        text: payload.error ?? "Nao foi possivel atualizar o status da rodada."
      });
      setIsTogglingRound(false);
      return;
    }

    setRoundStatusMessage({
      tone: "success",
      text: nextStatus === "closed" ? "Rodada fechada com sucesso." : "Rodada reaberta com sucesso."
    });
    window.dispatchEvent(new Event("pepa-store-updated"));
    setIsTogglingRound(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Cotacoes PEPA"
        title="Comparativo automatico a partir do arquivo exportado do Flex"
        description="Agora o fluxo aceita uma rodada real com o arquivo-base do Flex e os anexos dos fornecedores no mesmo envio. O sistema salva os arquivos, registra a rodada e usa a ultima importacao para montar a tela."
        action="Nova rodada de upload"
        onAction={() => uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

      <PepaFlowOverview
        currentStep="cotacoes"
        totals={{
          ...workflowTotals,
          ocrQueue: snapshot.totals.ocrQueue
        }}
      />

      {isLoadingSnapshot ? (
        <div className="mb-6">
          <OperationFeedback
            tone="info"
            title="Atualizando rodada"
            message="Carregando snapshot, historico e diagnostico mais recentes da operacao."
          />
        </div>
      ) : null}

      {snapshotError ? (
        <div className="mb-6">
          <OperationFeedback tone="error" title="Falha ao carregar rodada" message={snapshotError} />
        </div>
      ) : null}

      <div className="mb-6">
        <OperationFeedback
          tone={
            !snapshot.latestRound
              ? "info"
              : snapshot.latestRound.status === "closed"
                ? "success"
                : snapshot.totals.ocrQueue > 0 || snapshot.totals.quotedItems < snapshot.totals.requestedItems
                  ? "warning"
                  : "success"
          }
          title={
            !snapshot.latestRound
              ? "Nenhuma rodada carregada"
              : snapshot.latestRound.status === "closed"
                ? "Rodada pronta para auditoria"
                : snapshot.totals.ocrQueue > 0 || snapshot.totals.quotedItems < snapshot.totals.requestedItems
                  ? "Proximo passo recomendado"
                  : "Rodada pronta para validacao"
          }
          message={
            !snapshot.latestRound
              ? "Suba o espelho do Flex e os anexos dos fornecedores para iniciar a primeira rodada real desta base."
              : snapshot.latestRound.status === "closed"
                ? "Esta rodada ja foi congelada para auditoria. Use o historico para revisar ou siga para exportacao do pedido final."
                : snapshot.totals.ocrQueue > 0 || snapshot.totals.quotedItems < snapshot.totals.requestedItems
                  ? "Antes de fechar, reduza o residual de OCR e confirme os itens ainda sem cobertura completa para evitar validacao cega."
                  : "Os anexos principais ja foram reconciliados. O proximo movimento natural e revisar fornecedor por item na validacao."
          }
        />
      </div>

      <section ref={uploadRef} className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <article className="rounded-[32px] bg-white p-6 shadow-panel">
          <p className="text-sm text-slate-500">Rodada real</p>
          <h3 className="mt-1 text-2xl font-semibold">Suba o espelho do Flex e os anexos juntos</h3>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            O sistema aceita arquivos mistos, mas nao trata tudo do mesmo jeito: CSV, TXT e XLSX entram no comparativo imediato; PDFs tentam leitura e podem cair em OCR; outros formatos ficam salvos para revisao manual sem prometer reconciliacao automatica.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="rounded-[28px] border border-dashed border-brand-blue/30 bg-brand-surface p-5">
              <span className="block text-sm font-medium text-brand-ink">Arquivo-base do Flex</span>
              <span className="mt-2 block text-sm text-slate-500">
                CSV, TXT ou XLSX com SKU, descricao e quantidade geram comparativo imediato. PDF pode ser salvo e tentar leitura; outros formatos ficam apenas para revisao manual.
              </span>
              <input
                ref={mirrorInputRef}
                className="mt-4 block w-full text-sm text-slate-600"
                type="file"
                onChange={(event) => setMirrorFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <label className="rounded-[28px] border border-dashed border-brand-blue/30 bg-brand-surface p-5">
              <span className="block text-sm font-medium text-brand-ink">Anexos dos fornecedores</span>
              <span className="mt-2 block text-sm text-slate-500">
                Pode enviar varios arquivos de uma vez. CSV, TXT e XLSX entram no parser tabular; PDFs tentam leitura e podem seguir para OCR; outros formatos ficam salvos para revisao manual. Limite atual: 20 anexos e 10 MB por arquivo.
              </span>
              <input
                ref={supplierInputRef}
                className="mt-4 block w-full text-sm text-slate-600"
                type="file"
                multiple
                onChange={(event) => setSupplierFiles(Array.from(event.target.files ?? []))}
              />
            </label>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <SummaryCard label="Arquivo-base" value={mirrorFile?.name ?? "Nao selecionado"} />
            <SummaryCard label="Anexos de fornecedor" value={String(supplierFiles.length)} />
          </div>

          {mirrorFile || supplierFiles.length > 0 ? (
            <div className="mt-4">
              <OperationFeedback
                tone={buildUploadPreviewTone(mirrorFile, supplierFiles)}
                title="Leitura prevista desta rodada"
                message={buildUploadPreviewMessage(mirrorFile, supplierFiles)}
              />
              <div className="mt-3 space-y-2">
                {buildUploadPreviewItems(mirrorFile, supplierFiles).map((item) => (
                  <div key={`${item.role}-${item.fileName}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-brand-surface px-4 py-3 text-sm text-slate-600">
                    <div>
                      <p className="font-medium text-brand-ink">{item.fileName}</p>
                      <p className="text-xs text-slate-500">{item.detail}</p>
                    </div>
                    <span className={uploadPreviewBadgeClasses(item.mode)}>{uploadPreviewBadgeLabel(item.mode)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <button
            className="mt-6 rounded-full bg-brand-blue px-5 py-3 text-sm font-medium text-white shadow-panel disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? "Salvando rodada..." : "Salvar rodada de cotacao"}
          </button>

          {statusMessage ? (
            <div className="mt-4">
              <OperationFeedback
                tone={statusMessage.tone}
                title={statusMessage.tone === "success" ? "Rodada processada" : statusMessage.tone === "error" ? "Falha no upload" : "Processando upload"}
                message={statusMessage.text}
              />
            </div>
          ) : null}
        </article>

        <article className="rounded-[32px] bg-white p-6 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Ultima rodada carregada</p>
              <h3 className="mt-1 text-xl font-semibold">
                {snapshot.latestRound ? snapshot.latestRound.mirrorFileName : "Nenhuma rodada carregada"}
              </h3>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                {snapshot.latestRound
                  ? `Rodada salva em ${formatDateTime(snapshot.latestRound.createdAt)} com ${snapshot.latestRound.supplierFilesCount} anexo(s) de fornecedor.`
                  : "Nenhuma rodada foi enviada ainda. Assim que voce salvar a primeira importacao, o comparativo real aparece aqui."}
              </p>
            </div>
            <span className="rounded-full bg-brand-surface px-4 py-2 text-sm text-slate-600">
              {snapshot.latestRound ? `${snapshot.latestRound.requestedItemsCount} item(ns) estruturado(s)` : "Sem rodada"}
            </span>
          </div>

          {snapshot.latestRound ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className={snapshot.latestRound.status === "closed" ? "rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white" : "rounded-full bg-brand-success/10 px-4 py-2 text-sm font-medium text-brand-success"}>
                {snapshot.latestRound.status === "closed" ? "Rodada fechada" : "Rodada aberta"}
              </span>
              <button
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
                disabled={isTogglingRound}
                onClick={() => handleRoundStatusChange(snapshot.latestRound?.status === "closed" ? "open" : "closed")}
              >
                {isTogglingRound
                  ? "Atualizando status..."
                  : snapshot.latestRound.status === "closed"
                    ? "Reabrir rodada"
                    : "Fechar rodada"}
              </button>
            </div>
          ) : null}

          {snapshot.latestRound && (snapshot.totals.ocrQueue > 0 || snapshot.totals.quotedItems < snapshot.totals.requestedItems) ? (
            <div className="mt-4">
              <OperationFeedback
                tone="warning"
                title="Fechamento com risco operacional"
                message={`Ainda existem ${snapshot.totals.ocrQueue} arquivo(s) na fila OCR e ${snapshot.totals.requestedItems - snapshot.totals.quotedItems} item(ns) sem cobertura completa. Feche a rodada so se esse residual estiver conscientemente aceito.`}
              />
            </div>
          ) : null}

          {roundStatusMessage ? (
            <div className="mt-4">
              <OperationFeedback
                tone={roundStatusMessage.tone}
                title={roundStatusMessage.tone === "success" ? "Status atualizado" : roundStatusMessage.tone === "error" ? "Falha ao atualizar status" : "Atualizando status da rodada"}
                message={roundStatusMessage.text}
              />
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <MetricCard
              label="Arquivos recebidos"
              value={String(snapshot.totals.attachmentsReceived)}
              detail={`${snapshot.totals.parsedAttachments} lidos sem OCR`}
            />
            <MetricCard
              label="Fila OCR"
              value={String(snapshot.totals.ocrQueue)}
              detail="PDFs escaneados ou sem parser"
            />
            <MetricCard
              label="Revisao manual"
              value={String(snapshot.diagnostics?.storedForReviewAttachments ?? 0)}
              detail="Formatos salvos sem parser automatico"
            />
            <MetricCard
              label="Itens estruturados"
              value={`${snapshot.totals.quotedItems}/${snapshot.totals.requestedItems}`}
              detail="Cobertura atual do comparativo"
            />
            <MetricCard
              label="Valor cotado"
              value={formatCurrency(snapshot.totals.quotedValue)}
              detail="Vai subir quando o parser por item entrar"
            />
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-[32px] bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Diagnostico do parser</p>
            <h3 className="mt-1 text-xl font-semibold">O que a rodada atual conseguiu ler</h3>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <MetricCard label="Fornecedores lidos" value={String(snapshot.diagnostics?.parsedSuppliers ?? 0)} detail="Entraram no parser atual" />
          <MetricCard label="Fila OCR" value={String(snapshot.diagnostics?.ocrSuppliers ?? 0)} detail="Ainda dependem de OCR" />
          <MetricCard label="Revisao manual" value={String(snapshot.diagnostics?.manualReviewSuppliers ?? 0)} detail="Nao entram no parser atual" />
          <MetricCard label="Termos detectados" value={String(snapshot.diagnostics?.commercialTermsDetected ?? 0)} detail="Pagamento + frete completos" />
        </div>

        <div className="mt-6 space-y-3">
          {(snapshot.diagnostics?.warnings ?? []).map((warning) => (
            <div key={warning} className="rounded-[24px] bg-amber-50 px-4 py-4 text-sm text-amber-800">
              {warning}
            </div>
          ))}
          {(snapshot.diagnostics?.warnings ?? []).length === 0 ? (
            <div className="rounded-[24px] bg-brand-success/10 px-4 py-4 text-sm text-brand-success">
              {snapshot.latestRound ? "Nenhum alerta estrutural na rodada atual." : "Ainda nao existem alertas porque nenhuma rodada foi importada."}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-[32px] bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Historico de rodadas</p>
            <h3 className="mt-1 text-xl font-semibold">Reabra uma rodada anterior para revisar ou exportar</h3>
          </div>
          {roundId ? (
            <Link className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600" href="/cotacoes-pepa">
              Voltar para a rodada mais recente
            </Link>
          ) : null}
        </div>

        <div className="mt-6 space-y-4">
          {historyError ? (
            <OperationFeedback tone="warning" title="Historico indisponivel" message={historyError} />
          ) : null}
          {rounds.map((round) => (
            <div key={round.id} className="rounded-[28px] border border-slate-100 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-brand-ink">{round.mirrorFileName}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatDateTime(round.createdAt)} · {round.supplierFilesCount} fornecedor(es) · {round.requestedItemsCount} item(ns)
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <span className={round.status === "closed" ? "rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white" : "rounded-full bg-brand-success/10 px-3 py-1 text-xs font-semibold text-brand-success"}>
                    {round.status === "closed" ? "Fechada" : "Aberta"}
                  </span>
                  <span className="rounded-full bg-brand-surface px-3 py-1 text-xs font-semibold text-slate-600">
                    {round.coverageRate ?? 0}% cobertura
                  </span>
                  <Link className="rounded-full bg-brand-blue px-4 py-2 text-sm font-medium text-white" href={`/cotacoes-pepa?roundId=${round.id}`}>
                    Abrir rodada
                  </Link>
                  <Link className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600" href={`/pedido-final-pepa?roundId=${round.id}`}>
                    Exportar
                  </Link>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>Itens cotados: {round.quotedItems ?? 0}</span>
                <span>Arquivos: {round.attachmentsReceived ?? 0}</span>
                {renderDiff(rounds, round.id)}
              </div>
            </div>
          ))}
          {rounds.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-200 p-5 text-sm text-slate-500">
              Nenhuma rodada salva ainda. Quando voce importar os primeiros arquivos, o historico aparece aqui.
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[32px] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Pipeline</p>
              <h3 className="mt-1 text-xl font-semibold">Estado atual dos anexos</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600">
              Arquivo base / respostas / comparacao
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.attachments.map((attachment) => (
              <div key={attachment.fileName} className="rounded-[28px] border border-slate-100 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-500">
                      {attachment.role === "mirror" ? "Arquivo-base do Flex" : "Retorno de fornecedor"}
                    </p>
                    <h4 className="mt-1 text-lg font-semibold text-brand-ink">{attachment.fileName}</h4>
                    <p className="mt-2 text-sm text-slate-500">
                      {attachment.supplierName ? `Fornecedor: ${attachment.supplierName}` : "Arquivo mestre que define a ordem da tela"}
                    </p>
                  </div>
                  <span className={attachmentStatusClasses(attachment.extractionStatus)}>
                    {attachmentStatusLabel(attachment.extractionStatus)}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{attachment.notes}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[32px] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Ranking por fornecedor</p>
              <h3 className="mt-1 text-xl font-semibold">Quem ja entrou na rodada</h3>
            </div>
            <span className="rounded-full bg-brand-blue/10 px-4 py-2 text-sm font-medium text-brand-blue">
              Fluxo inicial
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {snapshot.suppliers.map((supplier) => (
              <div key={supplier.supplierName} className="rounded-[28px] bg-brand-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-semibold text-brand-ink">{supplier.supplierName}</h4>
                    <p className="mt-1 text-sm text-slate-500">{supplier.sourceFile}</p>
                  </div>
                  <span className={attachmentStatusClasses(supplier.extractionStatus)}>
                    {attachmentStatusLabel(supplier.extractionStatus)}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <SupplierStat label="Cobertura" value={`${supplier.coverageCount} itens`} />
                  <SupplierStat
                    label="Valor lido"
                    value={supplier.totalValue === null ? "Pendente" : formatCurrency(supplier.totalValue)}
                  />
                  <SupplierStat label="Pagamento" value={supplier.paymentTerms} />
                  <SupplierStat label="Frete" value={supplier.freightTerms} />
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-600">{supplier.notes}</p>
              </div>
            ))}
            {snapshot.suppliers.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                Envie anexos de fornecedores para registrar a primeira rodada real.
              </div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="mt-6 rounded-[32px] bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Mapa comparativo</p>
            <h3 className="mt-1 text-xl font-semibold">Itens consolidados para decisao de compra</h3>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-500">
              Quando o arquivo-base vier estruturado, a grade abaixo passa a refletir os itens reais da ultima rodada. Se os anexos dos fornecedores vierem em formato tabular, o comparativo ja tenta preencher melhor oferta automaticamente.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {snapshot.comparisonRows.some(hasDivergence) && (
              <button
                type="button"
                onClick={() => setShowOnlyDivergences((prev) => !prev)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  showOnlyDivergences
                    ? "bg-red-600 text-white"
                    : "bg-red-50 text-red-700 hover:bg-red-100"
                }`}
              >
                {showOnlyDivergences
                  ? `Mostrando ${snapshot.comparisonRows.filter(hasDivergence).length} divergencia(s)`
                  : `Ver so divergencias (${snapshot.comparisonRows.filter(hasDivergence).length})`}
              </button>
            )}
            <div className="rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700">
              Ordem do arquivo-base preservada
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-brand-muted">
                <th className="px-4">SKU</th>
                <th className="px-4">Item</th>
                <th className="px-4">Qtd pedida</th>
                <th className="px-4">Unid.</th>
                <th className="px-4">Fornecedor</th>
                <th className="px-4">Preco Flex</th>
                <th className="px-4">Preco Cotado</th>
                <th className="px-4">Dif.</th>
                <th className="px-4">Total</th>
                <th className="px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.comparisonRows
                .filter((row) => !showOnlyDivergences || hasDivergence(row))
                .flatMap((row) => {
                  const priceDivergence = hasPriceDivergence(row);
                  const qtyDivergence = hasQuantityDivergence(row);
                  const anyDivergence = priceDivergence || qtyDivergence;
                  const offer = row.offers?.[0];
                  const rowKey = `${row.sku}-${row.description}`;
                  const rowBg = anyDivergence ? "bg-red-50" : "bg-brand-surface";
                  const hasMultipleOffers = (row.offers?.length ?? 0) > 1;
                  const isExpanded = expandedOffersKey === rowKey;
                  const mainRow = (
                    <tr key={rowKey} className={`rounded-[24px] ${rowBg} text-sm text-slate-600`}>
                      <td className="rounded-l-[24px] px-4 py-4 font-medium text-brand-ink">{row.sku}</td>
                      <td className="px-4 py-4">{row.description}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <span>{formatQuantity(row.requestedQuantity)} {row.unit}</span>
                          {qtyDivergence && offer?.quotedQuantity != null && (
                            <span className="inline-flex w-fit rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                              Cotado: {formatQuantity(offer.quotedQuantity)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">{row.unit}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <span>{row.bestSupplier ?? "Aguardando"}</span>
                          {hasMultipleOffers && (
                            <button
                              type="button"
                              onClick={() => setExpandedOffersKey(isExpanded ? null : rowKey)}
                              className="inline-flex w-fit items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              {isExpanded ? "▲ Recolher" : `▼ Ver ${(row.offers?.length ?? 0)} ofertas`}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {row.baseUnitPrice != null ? formatCurrency(row.baseUnitPrice) : "—"}
                      </td>
                      <td className={`px-4 py-4 font-medium ${priceDivergence ? "text-red-700" : "text-slate-700"}`}>
                        {row.bestUnitPrice === null ? "Pendente" : formatCurrency(row.bestUnitPrice)}
                      </td>
                      <td className="px-4 py-4">
                        {priceDivergence && row.baseUnitPrice != null && row.bestUnitPrice != null
                          ? formatPriceDiff(row.baseUnitPrice, row.bestUnitPrice)
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-4">
                        {row.bestTotal === null ? "Pendente" : formatCurrency(row.bestTotal)}
                      </td>
                      <td className="rounded-r-[24px] px-4 py-4">
                        <div className="flex flex-col gap-2">
                          <span className={comparisonStatusClasses(row.itemStatus)}>
                            {row.itemStatus === "quoted" ? "Cotado" : "Leitura pendente"}
                          </span>
                          {row.selectionMode === "manual" && anyDivergence && (
                            <span className="inline-flex w-fit rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                              Revisado
                            </span>
                          )}
                          <span className="text-xs text-slate-400">
                            {row.source === "inferred-from-quote" ? "Reordenado conforme o arquivo-base" : "Capturado do arquivo-base"}
                          </span>
                          {anyDivergence && row.selectionMode !== "manual" && snapshot.latestRound && (
                            <div className="mt-1 flex flex-col gap-1">
                              {editingRowKey === `${row.sku}-${row.description}` ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={adjustedPrice}
                                    onChange={(e) => setAdjustedPrice(e.target.value)}
                                    className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-blue"
                                    placeholder="Ex: 1,50"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const price = parseLocalCurrency(adjustedPrice);
                                      if (price > 0) {
                                        void saveSelection(row.sku, row.description, row.bestSupplier, price);
                                      }
                                    }}
                                    disabled={savingRowKey === `${row.sku}-${row.description}`}
                                    className="rounded-lg bg-brand-blue px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                  >
                                    Salvar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setEditingRowKey(null); setAdjustedPrice(""); }}
                                    className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void saveSelection(row.sku, row.description, row.bestSupplier, row.bestUnitPrice)}
                                    disabled={savingRowKey === `${row.sku}-${row.description}`}
                                    className="inline-flex w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200 disabled:opacity-50"
                                  >
                                    {savingRowKey === `${row.sku}-${row.description}` ? "Salvando..." : "Aceitar cotado"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setEditingRowKey(`${row.sku}-${row.description}`); setAdjustedPrice(""); }}
                                    className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                                  >
                                    Ajustar preço
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                  const expandedRow = isExpanded && hasMultipleOffers ? (
                    <tr key={`${rowKey}-offers`} className="text-sm">
                      <td colSpan={10} className="rounded-[24px] bg-blue-50 px-6 py-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-600">
                          Todas as ofertas para este item
                        </p>
                        <div className="flex flex-col gap-2">
                          {(row.offers ?? []).map((o) => (
                            <div key={o.supplierName} className="flex items-center gap-4 rounded-2xl bg-white px-4 py-3 shadow-sm">
                              <span className="min-w-[140px] font-medium text-brand-ink">{o.supplierName}</span>
                              <span className="min-w-[90px] text-slate-600">{formatCurrency(o.unitPrice)}/un</span>
                              {o.quotedQuantity != null && (
                                <span className="text-xs text-slate-400">Qtd cotada: {formatQuantity(o.quotedQuantity)}</span>
                              )}
                              {o.totalValue != null && (
                                <span className="text-xs text-slate-400">Total: {formatCurrency(o.totalValue)}</span>
                              )}
                              <div className="ml-auto flex items-center gap-2">
                                {o.supplierName === row.bestSupplier && (
                                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                                    Selecionado
                                  </span>
                                )}
                                {snapshot.latestRound && o.supplierName !== row.bestSupplier && (
                                  <button
                                    type="button"
                                    disabled={savingRowKey === rowKey}
                                    onClick={() => void saveSelection(row.sku, row.description, o.supplierName, o.unitPrice)}
                                    className="rounded-full bg-brand-blue px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    Escolher
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null;
                  return [mainRow, expandedRow].filter((r): r is React.JSX.Element => r !== null);
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
    <article className="rounded-[28px] bg-brand-surface p-5">
      <p className="text-sm text-slate-500">{props.label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-brand-ink">{props.value}</p>
      <p className="mt-3 text-sm font-medium text-brand-blue">{props.detail}</p>
    </article>
  );
}

function SummaryCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-[28px] bg-brand-surface p-5">
      <p className="text-sm text-slate-500">{props.label}</p>
      <p className="mt-3 text-sm font-medium text-brand-ink">{props.value}</p>
    </div>
  );
}

function SupplierStat(props: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] bg-white p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-brand-muted">{props.label}</p>
      <p className="mt-2 text-sm font-medium text-brand-ink">{props.value}</p>
    </div>
  );
}

function parseLocalCurrency(value: string): number {
  // Accepts "1.234,56" (BR) or "1234.56" (US/plain)
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasPriceDivergence(row: { baseUnitPrice?: number | null; bestUnitPrice: number | null }): boolean {
  if (row.baseUnitPrice == null || row.bestUnitPrice == null) return false;
  return Math.abs(row.bestUnitPrice - row.baseUnitPrice) > 0.001;
}

function hasQuantityDivergence(row: { requestedQuantity: number; offers?: { quotedQuantity?: number | null }[] }): boolean {
  const qty = row.offers?.[0]?.quotedQuantity;
  if (qty == null) return false;
  return qty !== row.requestedQuantity;
}

function hasDivergence(row: { baseUnitPrice?: number | null; bestUnitPrice: number | null; requestedQuantity: number; offers?: { quotedQuantity?: number | null }[] }): boolean {
  return hasPriceDivergence(row) || hasQuantityDivergence(row);
}

function formatPriceDiff(baseUnitPrice: number, bestUnitPrice: number) {
  const diff = ((bestUnitPrice - baseUnitPrice) / baseUnitPrice) * 100;
  const label = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${diff > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
      {label}
    </span>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function renderDiff(rounds: PepaUploadRoundSummary[], roundId: string) {
  const index = rounds.findIndex((round) => round.id === roundId);
  const previous = index >= 0 ? rounds[index + 1] : undefined;
  const current = index >= 0 ? rounds[index] : undefined;

  if (!current || !previous) {
    return null;
  }

  const quotedDelta = (current.quotedItems ?? 0) - (previous.quotedItems ?? 0);
  const coverageDelta = (current.coverageRate ?? 0) - (previous.coverageRate ?? 0);

  return (
    <>
      <span>Delta itens cotados: {quotedDelta >= 0 ? `+${quotedDelta}` : quotedDelta}</span>
      <span>Delta cobertura: {coverageDelta >= 0 ? `+${coverageDelta}` : coverageDelta} p.p.</span>
    </>
  );
}

function attachmentStatusLabel(status: "parsed" | "ocr-required" | "template-pending" | "manual-review"): string {
  if (status === "parsed") {
    return "Lido";
  }

  if (status === "ocr-required") {
    return "OCR";
  }

  if (status === "manual-review") {
    return "Revisao manual";
  }

  return "Parser pendente";
}

function attachmentStatusClasses(status: "parsed" | "ocr-required" | "template-pending" | "manual-review") {
  if (status === "parsed") {
    return "rounded-full bg-brand-success/10 px-3 py-1 text-xs font-semibold text-brand-success";
  }

  if (status === "ocr-required") {
    return "rounded-full bg-brand-attention/10 px-3 py-1 text-xs font-semibold text-brand-attention";
  }

  if (status === "manual-review") {
    return "rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700";
  }

  return "rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600";
}

function comparisonStatusClasses(status: "quoted" | "ocr-pending") {
  if (status === "quoted") {
    return "inline-flex rounded-full bg-brand-success/10 px-3 py-1 text-xs font-semibold text-brand-success";
  }

  return "inline-flex rounded-full bg-brand-attention/10 px-3 py-1 text-xs font-semibold text-brand-attention";
}

function detectSelectedFormat(file: File): "csv" | "txt" | "xlsx" | "xls" | "pdf" | "other" {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) return "csv";
  if (lowerName.endsWith(".txt")) return "txt";
  if (lowerName.endsWith(".xlsx")) return "xlsx";
  if (lowerName.endsWith(".xls")) return "xls";
  if (lowerName.endsWith(".pdf")) return "pdf";
  return "other";
}

function getSelectedProcessingMode(file: File): "immediate-comparison" | "ocr-queue" | "stored-for-review" {
  const format = detectSelectedFormat(file);
  if (format === "csv" || format === "txt" || format === "xlsx" || format === "xls") {
    return "immediate-comparison";
  }
  if (format === "pdf") {
    return "ocr-queue";
  }
  return "stored-for-review";
}

function describeSelectedFile(file: File, role: "mirror" | "supplier"): string {
  const format = detectSelectedFormat(file);
  if (format === "csv" || format === "txt" || format === "xlsx" || format === "xls") {
    return role === "mirror"
      ? `${file.name}: deve gerar comparativo imediato se vier com SKU, descricao e quantidade.`
      : `${file.name}: entra no parser tabular e pode reconciliar itens automaticamente.`;
  }

  if (format === "pdf") {
    return role === "mirror"
      ? `${file.name}: sera salvo e o PDF tentara leitura, mas comparativo imediato nao e garantido.`
      : `${file.name}: tentara leitura textual; se nao estruturar, vai para OCR.`;
  }

  return `${file.name}: sera salvo apenas para revisao manual porque este formato ainda nao entra no parser automatico.`;
}

function buildUploadPreviewTone(mirrorFile: File | null, supplierFiles: File[]): "success" | "warning" | "info" {
  const selectedFiles = [mirrorFile, ...supplierFiles].filter((file): file is File => file instanceof File);
  const hasManualReview = selectedFiles.some((file) => detectSelectedFormat(file) === "other");
  const mirrorNeedsCare = mirrorFile ? detectSelectedFormat(mirrorFile) === "pdf" || detectSelectedFormat(mirrorFile) === "other" : false;
  return hasManualReview || mirrorNeedsCare ? "warning" : "info";
}

function buildUploadPreviewMessage(mirrorFile: File | null, supplierFiles: File[]): string {
  const lines: string[] = [];
  if (mirrorFile) {
    lines.push(describeSelectedFile(mirrorFile, "mirror"));
  }
  if (supplierFiles.length > 0) {
    lines.push(
      ...supplierFiles.slice(0, 3).map((file) => describeSelectedFile(file, "supplier"))
    );
    if (supplierFiles.length > 3) {
      lines.push(`Mais ${supplierFiles.length - 3} anexo(s) seguem a mesma regra por formato.`);
    }
  }

  return lines.join(" ");
}

function buildUploadPreviewItems(mirrorFile: File | null, supplierFiles: File[]) {
  const items: Array<{
    role: "mirror" | "supplier";
    fileName: string;
    detail: string;
    mode: "immediate-comparison" | "ocr-queue" | "stored-for-review";
  }> = [];

  if (mirrorFile) {
    items.push({
      role: "mirror",
      fileName: mirrorFile.name,
      detail: "Arquivo-base da rodada",
      mode: getSelectedProcessingMode(mirrorFile)
    });
  }

  supplierFiles.forEach((file) => {
    items.push({
      role: "supplier",
      fileName: file.name,
      detail: "Anexo de fornecedor",
      mode: getSelectedProcessingMode(file)
    });
  });

  return items;
}

function uploadPreviewBadgeLabel(mode: "immediate-comparison" | "ocr-queue" | "stored-for-review") {
  if (mode === "immediate-comparison") {
    return "Comparativo imediato";
  }
  if (mode === "ocr-queue") {
    return "Tenta leitura / OCR";
  }
  return "Revisao manual";
}

function uploadPreviewBadgeClasses(mode: "immediate-comparison" | "ocr-queue" | "stored-for-review") {
  if (mode === "immediate-comparison") {
    return "rounded-full bg-brand-success/10 px-3 py-1 text-xs font-semibold text-brand-success";
  }
  if (mode === "ocr-queue") {
    return "rounded-full bg-brand-attention/10 px-3 py-1 text-xs font-semibold text-brand-attention";
  }
  return "rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700";
}
