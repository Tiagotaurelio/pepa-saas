"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { OperationFeedback } from "@/components/operation-feedback";
import { PageHeader } from "@/components/page-header";
import { PepaFlowOverview } from "@/components/pepa-flow-overview";
import { PepaUploadRoundSummary, getPepaWorkflowTotals } from "@/lib/pepa-quotation-domain";
import { usePepaSnapshot } from "@/lib/use-pepa-snapshot";

export default function CotacoesPepaPage() {
  const searchParams = useSearchParams();
  const roundId = searchParams.get("roundId");
  const { snapshot, isLoading: isLoadingSnapshot, error: snapshotError } = usePepaSnapshot(roundId);
  const workflowTotals = getPepaWorkflowTotals();
  const uploadRef = useRef<HTMLDivElement | null>(null);
  const [mirrorFile, setMirrorFile] = useState<File | null>(null);
  const [supplierFiles, setSupplierFiles] = useState<File[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rounds, setRounds] = useState<PepaUploadRoundSummary[]>([]);
  const [isTogglingRound, setIsTogglingRound] = useState(false);
  const [roundStatusMessage, setRoundStatusMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRounds() {
      if (active) {
        setHistoryError(null);
      }
      const response = await fetch("/api/pepa/history", { cache: "no-store" });
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
    window.addEventListener("pepa-store-updated", handleRefresh);
    return () => {
      active = false;
      window.removeEventListener("pepa-store-updated", handleRefresh);
    };
  }, []);

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
      body: formData
    });

    const payload = (await response.json()) as { error?: string; snapshot?: { latestRound: { requestedItemsCount: number } | null } };
    if (!response.ok) {
      setStatusMessage({
        tone: "error",
        text: payload.error ?? "Falha ao salvar a rodada de cotacao."
      });
      setIsSubmitting(false);
      return;
    }

    const requestedItemsCount = payload.snapshot?.latestRound?.requestedItemsCount ?? 0;
    setStatusMessage({
      tone: "success",
      text: `Rodada salva com sucesso. ${requestedItemsCount} item(ns) foram estruturado(s) a partir do arquivo-base e os anexos de fornecedores ja ficaram vinculados a esta rodada.`
    });
    setMirrorFile(null);
    setSupplierFiles([]);
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
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        roundId: snapshot.latestRound.id,
        status: nextStatus
      })
    });
    const payload = (await response.json()) as { error?: string };
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
              ? "Rodada piloto ativa"
              : snapshot.latestRound.status === "closed"
                ? "Rodada pronta para auditoria"
                : snapshot.totals.ocrQueue > 0 || snapshot.totals.quotedItems < snapshot.totals.requestedItems
                  ? "Proximo passo recomendado"
                  : "Rodada pronta para validacao"
          }
          message={
            !snapshot.latestRound
              ? "Suba o espelho do Flex e os anexos dos fornecedores para substituir a base demonstrativa por uma rodada real."
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
            Nesta primeira iteracao, o sistema salva os arquivos recebidos, reconhece o arquivo-base quando ele vem em CSV, TXT ou XLSX estruturado e tenta reconciliar anexos tabulares dos fornecedores antes de mandar o restante para OCR.
          </p>

          <div className="mt-6 grid gap-4">
            <label className="rounded-[28px] border border-dashed border-brand-blue/30 bg-brand-surface p-5">
              <span className="block text-sm font-medium text-brand-ink">Arquivo-base do Flex</span>
              <span className="mt-2 block text-sm text-slate-500">
                CSV, TXT ou XLSX com SKU, descricao e quantidade. Outros formatos ainda ficam salvos, mas sem leitura automatica dos itens.
              </span>
              <input
                className="mt-4 block w-full text-sm text-slate-600"
                type="file"
                accept=".csv,.txt,.xlsx,.xls,.pdf"
                onChange={(event) => setMirrorFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <label className="rounded-[28px] border border-dashed border-brand-blue/30 bg-brand-surface p-5">
              <span className="block text-sm font-medium text-brand-ink">Anexos dos fornecedores</span>
              <span className="mt-2 block text-sm text-slate-500">
                Pode enviar varios arquivos de uma vez. CSV, TXT e XLSX entram no parser tabular; PDFs seguem para OCR. Limite atual: 20 anexos e 10 MB por arquivo.
              </span>
              <input
                className="mt-4 block w-full text-sm text-slate-600"
                type="file"
                multiple
                accept=".pdf,.csv,.txt,.xlsx,.xls"
                onChange={(event) => setSupplierFiles(Array.from(event.target.files ?? []))}
              />
            </label>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <SummaryCard label="Arquivo-base" value={mirrorFile?.name ?? "Nao selecionado"} />
            <SummaryCard label="Anexos de fornecedor" value={String(supplierFiles.length)} />
          </div>

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
                {snapshot.latestRound ? snapshot.latestRound.mirrorFileName : "Modo demonstracao"}
              </h3>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                {snapshot.latestRound
                  ? `Rodada salva em ${formatDateTime(snapshot.latestRound.createdAt)} com ${snapshot.latestRound.supplierFilesCount} anexo(s) de fornecedor.`
                  : "Enquanto nenhuma rodada real for enviada, a tela continua usando o dataset piloto para demonstracao."}
              </p>
            </div>
            <span className="rounded-full bg-brand-surface px-4 py-2 text-sm text-slate-600">
              {snapshot.latestRound ? `${snapshot.latestRound.requestedItemsCount} item(ns) estruturado(s)` : "Base piloto"}
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

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <MetricCard label="Fornecedores lidos" value={String(snapshot.diagnostics?.parsedSuppliers ?? 0)} detail="Entraram no parser atual" />
          <MetricCard label="Fila OCR" value={String(snapshot.diagnostics?.ocrSuppliers ?? 0)} detail="Ainda dependem de OCR" />
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
              Nenhum alerta estrutural na rodada atual.
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
              Nenhuma rodada salva ainda.
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
          <div className="rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700">
            Ordem do arquivo-base preservada
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-brand-muted">
                <th className="px-4">SKU</th>
                <th className="px-4">Item</th>
                <th className="px-4">Qtd</th>
                <th className="px-4">Unidade</th>
                <th className="px-4">Melhor fornecedor</th>
                <th className="px-4">Preco unit.</th>
                <th className="px-4">Total</th>
                <th className="px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.comparisonRows.map((row) => (
                <tr key={`${row.sku}-${row.description}`} className="rounded-[24px] bg-brand-surface text-sm text-slate-600">
                  <td className="rounded-l-[24px] px-4 py-4 font-medium text-brand-ink">{row.sku}</td>
                  <td className="px-4 py-4">{row.description}</td>
                  <td className="px-4 py-4">{formatQuantity(row.requestedQuantity)}</td>
                  <td className="px-4 py-4">{row.unit}</td>
                  <td className="px-4 py-4">{row.bestSupplier ?? "Aguardando"}</td>
                  <td className="px-4 py-4">
                    {row.bestUnitPrice === null ? "Pendente" : formatCurrency(row.bestUnitPrice)}
                  </td>
                  <td className="px-4 py-4">
                    {row.bestTotal === null ? "Pendente" : formatCurrency(row.bestTotal)}
                  </td>
                  <td className="rounded-r-[24px] px-4 py-4">
                    <div className="flex flex-col gap-2">
                      <span className={comparisonStatusClasses(row.itemStatus)}>
                        {row.itemStatus === "quoted" ? "Cotado" : "Leitura pendente"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {row.source === "inferred-from-quote" ? "Reordenado conforme o arquivo-base" : "Capturado do arquivo-base"}
                      </span>
                    </div>
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

function attachmentStatusLabel(status: "parsed" | "ocr-required" | "template-pending"): string {
  if (status === "parsed") {
    return "Lido";
  }

  if (status === "ocr-required") {
    return "OCR";
  }

  return "Parser pendente";
}

function attachmentStatusClasses(status: "parsed" | "ocr-required" | "template-pending") {
  if (status === "parsed") {
    return "rounded-full bg-brand-success/10 px-3 py-1 text-xs font-semibold text-brand-success";
  }

  if (status === "ocr-required") {
    return "rounded-full bg-brand-attention/10 px-3 py-1 text-xs font-semibold text-brand-attention";
  }

  return "rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600";
}

function comparisonStatusClasses(status: "quoted" | "ocr-pending") {
  if (status === "quoted") {
    return "inline-flex rounded-full bg-brand-success/10 px-3 py-1 text-xs font-semibold text-brand-success";
  }

  return "inline-flex rounded-full bg-brand-attention/10 px-3 py-1 text-xs font-semibold text-brand-attention";
}
