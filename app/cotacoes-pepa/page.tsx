"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { OperationFeedback } from "@/components/operation-feedback";
import { usePepaSnapshot } from "@/lib/use-pepa-snapshot";

export default function CotacoesPepaPage() {
  const searchParams = useSearchParams();
  const roundId = searchParams.get("roundId");
  const { snapshot, isLoading: isLoadingSnapshot, error: snapshotError } = usePepaSnapshot(roundId);
  const isClosedRound = snapshot.latestRound?.status === "closed";
  const mirrorInputRef = useRef<HTMLInputElement | null>(null);
  const supplierInputRef = useRef<HTMLInputElement | null>(null);
  const [mirrorFile, setMirrorFile] = useState<File | null>(null);
  const [supplierFiles, setSupplierFiles] = useState<File[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTogglingRound, setIsTogglingRound] = useState(false);
  const [roundStatusMessage, setRoundStatusMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [showOnlyDivergences, setShowOnlyDivergences] = useState(searchParams.get("showDivergences") === "true");
  const [savingRowKey, setSavingRowKey] = useState<string | null>(null);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [adjustedPrice, setAdjustedPrice] = useState("");
  const [expandedOffersKey, setExpandedOffersKey] = useState<string | null>(null);
  const [editingQtyKey, setEditingQtyKey] = useState<string | null>(null);
  const [adjustedQty, setAdjustedQty] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [locallyAcceptedDesc, setLocallyAcceptedDesc] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleAuthExpired = () => {
      window.setTimeout(() => window.location.assign("/login"), 150);
    };
    window.addEventListener("pepa-auth-expired", handleAuthExpired);
    return () => window.removeEventListener("pepa-auth-expired", handleAuthExpired);
  }, []);

  async function saveSelection(sku: string, description: string, supplierName: string | null, unitPrice: number | null, quantity?: number | null) {
    if (!snapshot.latestRound) return;
    const rowKey = `${sku}-${description}`;
    setSavingRowKey(rowKey);
    try {
      const res = await fetch("/api/pepa/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ roundId: snapshot.latestRound.id, sku, description, supplierName, unitPrice, quantity })
      });
      if (res.ok) window.dispatchEvent(new Event("pepa-store-updated"));
    } finally {
      setSavingRowKey(null);
      setEditingRowKey(null);
      setAdjustedPrice("");
      setEditingQtyKey(null);
      setAdjustedQty("");
    }
  }

  async function handleSubmit() {
    if (!mirrorFile || supplierFiles.length === 0) {
      setStatusMessage({ tone: "error", text: "Selecione o arquivo-base do Flex e pelo menos um anexo de fornecedor." });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage({ tone: "info", text: "Enviando arquivos e registrando a rodada..." });

    const formData = new FormData();
    formData.append("mirrorFile", mirrorFile);
    supplierFiles.forEach((file) => formData.append("supplierFiles", file));

    const response = await fetch("/api/pepa/upload", { method: "POST", body: formData, credentials: "same-origin" });
    const payload = (await response.json()) as {
      error?: string;
      snapshot?: {
        latestRound: { requestedItemsCount: number; supplierFilesCount: number } | null;
        diagnostics: { parsedSuppliers: number; ocrSuppliers: number; manualReviewSuppliers: number; storedForReviewAttachments: number };
        totals: { attachmentsReceived: number };
      };
    };

    if (response.status === 401) {
      setIsSubmitting(false);
      window.setTimeout(() => window.location.assign("/login"), 150);
      return;
    }
    if (!response.ok) {
      setStatusMessage({ tone: "error", text: payload.error ?? "Falha ao salvar a rodada." });
      setIsSubmitting(false);
      return;
    }

    const requestedItemsCount = payload.snapshot?.latestRound?.requestedItemsCount ?? 0;
    const parsedSuppliers = payload.snapshot?.diagnostics?.parsedSuppliers ?? 0;
    setStatusMessage({
      tone: "success",
      text: `Rodada salva. ${requestedItemsCount} item(ns) estruturado(s), ${parsedSuppliers} fornecedor(es) lido(s).`
    });
    setMirrorFile(null);
    setSupplierFiles([]);
    if (mirrorInputRef.current) mirrorInputRef.current.value = "";
    if (supplierInputRef.current) supplierInputRef.current.value = "";
    window.dispatchEvent(new Event("pepa-store-updated"));
    setIsSubmitting(false);
  }

  async function handleRoundStatusChange(nextStatus: "open" | "closed") {
    if (!snapshot.latestRound) return;

    if (nextStatus === "closed") {
      const shouldClose = window.confirm(
        `Fechar esta rodada?\n\nItens pendentes: ${snapshot.totals.requestedItems - snapshot.totals.quotedItems}\nFila OCR: ${snapshot.totals.ocrQueue}\n\nApos fechar, a validacao fica bloqueada ate reabrir.`
      );
      if (!shouldClose) return;
    }

    setIsTogglingRound(true);
    const response = await fetch("/api/pepa/round-status", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId: snapshot.latestRound.id, status: nextStatus })
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setRoundStatusMessage({ tone: "error", text: payload.error ?? "Nao foi possivel atualizar o status da rodada." });
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

  function toggleRow(key: string) {
    setSelectedRows((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }

  const visibleRows = snapshot.comparisonRows.filter((row) => !showOnlyDivergences || hasDivergence(row));
  const singleSupplier = snapshot.suppliers.length === 1 ? snapshot.suppliers[0].supplierName : null;
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((r) => selectedRows.has(`${r.sku}-${r.description}`));
  const selectedRowsData = snapshot.comparisonRows.filter((row) => {
    if (!selectedRows.has(`${row.sku}-${row.description}`)) return false;
    // Itens aceitos via "Aceitar descrição" (sem divergencia de preco ou qtd) nao vao para o PDF de negociacao
    if (row.selectionMode === "manual" && !hasPriceDivergence(row) && !hasQuantityDivergence(row)) return false;
    return true;
  });

  return (
    <div>
      <div id="pepa-screen-content">
      {/* Upload */}
      <section className="rounded-[32px] bg-white p-6 shadow-panel">
        <h2 className="text-xl font-semibold text-brand-ink">Importar arquivos</h2>
        <p className="mt-1 text-sm text-slate-500">Suba o espelho do Flex e os anexos dos fornecedores para iniciar ou atualizar o comparativo.</p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="rounded-[24px] border border-dashed border-brand-blue/30 bg-brand-surface p-4">
            <span className="block text-sm font-medium text-brand-ink">Arquivo-base do Flex</span>
            <input
              ref={mirrorInputRef}
              className="mt-3 block w-full text-sm text-slate-600"
              type="file"
              onChange={(e) => setMirrorFile(e.target.files?.[0] ?? null)}
            />
            {mirrorFile && <p className="mt-2 text-xs text-brand-blue">{mirrorFile.name}</p>}
          </label>

          <label className="rounded-[24px] border border-dashed border-brand-blue/30 bg-brand-surface p-4">
            <span className="block text-sm font-medium text-brand-ink">Anexos dos fornecedores</span>
            <input
              ref={supplierInputRef}
              className="mt-3 block w-full text-sm text-slate-600"
              type="file"
              multiple
              onChange={(e) => setSupplierFiles(Array.from(e.target.files ?? []))}
            />
            {supplierFiles.length > 0 && <p className="mt-2 text-xs text-brand-blue">{supplierFiles.length} arquivo(s) selecionado(s)</p>}
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded-full bg-brand-blue px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            disabled={isSubmitting || !mirrorFile || supplierFiles.length === 0}
            onClick={handleSubmit}
          >
            {isSubmitting ? "Salvando..." : "Salvar rodada"}
          </button>

          {snapshot.latestRound && (
            <>
              <span className="text-sm text-slate-500">
                Rodada atual: <strong className="text-brand-ink">{snapshot.latestRound.mirrorFileName}</strong>
              </span>
              <span className={snapshot.latestRound.status === "closed"
                ? "rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                : "rounded-full bg-brand-success/10 px-3 py-1 text-xs font-medium text-brand-success"}>
                {snapshot.latestRound.status === "closed" ? "Fechada" : "Aberta"}
              </span>
              <button
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 disabled:opacity-50"
                disabled={isTogglingRound}
                onClick={() => handleRoundStatusChange(snapshot.latestRound?.status === "closed" ? "open" : "closed")}
              >
                {isTogglingRound ? "Atualizando..." : snapshot.latestRound.status === "closed" ? "Reabrir" : "Fechar rodada"}
              </button>
            </>
          )}
        </div>

        {statusMessage && (
          <div className="mt-4">
            <OperationFeedback
              tone={statusMessage.tone}
              title={statusMessage.tone === "success" ? "Rodada processada" : statusMessage.tone === "error" ? "Erro" : "Processando"}
              message={statusMessage.text}
            />
          </div>
        )}
        {roundStatusMessage && (
          <div className="mt-3">
            <OperationFeedback
              tone={roundStatusMessage.tone}
              title="Status da rodada"
              message={roundStatusMessage.text}
            />
          </div>
        )}
        {isLoadingSnapshot && (
          <div className="mt-3">
            <OperationFeedback tone="info" title="Carregando" message="Atualizando o comparativo..." />
          </div>
        )}
        {snapshotError && (
          <div className="mt-3">
            <OperationFeedback tone="error" title="Erro" message={snapshotError} />
          </div>
        )}
      </section>

      {/* Mapa comparativo — oculto quando rodada fechada */}
      {isClosedRound ? (
        <section className="mt-6 rounded-[32px] bg-white p-6 shadow-panel">
          <p className="text-sm text-slate-500">Rodada anterior encerrada</p>
          <p className="mt-1 text-slate-600">Importe novos arquivos acima para iniciar uma nova rodada de cotação.</p>
        </section>
      ) : null}
      {!isClosedRound && <section className="mt-6 rounded-[32px] bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Mapa comparativo</p>
            <h3 className="mt-1 text-xl font-semibold">Itens consolidados para decisão de compra</h3>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {snapshot.comparisonRows.some(hasDivergence) && (
              <button
                type="button"
                onClick={() => setShowOnlyDivergences((prev) => !prev)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  showOnlyDivergences ? "bg-red-600 text-white" : "bg-red-50 text-red-700 hover:bg-red-100"
                }`}
              >
                {showOnlyDivergences
                  ? `Mostrando ${snapshot.comparisonRows.filter(hasDivergence).length} divergência(s)`
                  : `Ver só divergências (${snapshot.comparisonRows.filter(hasDivergence).length})`}
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-brand-muted">
                <th className="px-4 py-1">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => {
                      if (allVisibleSelected) { setSelectedRows(new Set()); }
                      else { setSelectedRows(new Set(visibleRows.map((r) => `${r.sku}-${r.description}`))); }
                    }}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </th>
                <th className="px-4">SKU Pepa</th>
                <th className="px-4">SKU Forn.</th>
                <th className="px-4">Item</th>
                <th className="px-4">Qtd pedida</th>
                <th className="px-4">Unid.</th>
                <th className="px-4">Fornecedor</th>
                <th className="px-4">Preço Flex</th>
                <th className="px-4">Preço Cotado</th>
                <th className="px-4">Dif.</th>
                <th className="px-4">Total</th>
                <th className="px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.comparisonRows.length === 0 && (
                <tr>
                  <td colSpan={12} className="rounded-[24px] bg-brand-surface px-4 py-8 text-center text-sm text-slate-500">
                    Nenhum item ainda. Importe o arquivo-base do Flex para iniciar o comparativo.
                  </td>
                </tr>
              )}
              <AnimatePresence initial={false}>
              {snapshot.comparisonRows
                .filter((row) => !showOnlyDivergences || hasDivergence(row))
                .flatMap((row) => {
                  const priceDivergence = hasPriceDivergence(row);
                  // Usa a offer do fornecedor selecionado para garantir qtd correta
                  const offer =
                    row.offers?.find((o) => o.supplierName === row.bestSupplier) ??
                    row.offers?.[0] ??
                    null;
                  const qtyDivergence = hasQuantityDivergence(row);
                  const rowKey = `${row.sku}-${row.description}`;
                  const effectiveDescMismatch = row.descriptionMismatch === true && !locallyAcceptedDesc.has(rowKey);
                  const hasAnyRawDivergence = priceDivergence || qtyDivergence || effectiveDescMismatch;
                  const anyDivergence = hasAnyRawDivergence && row.selectionMode !== "manual";
                  const rowBg = anyDivergence ? "bg-red-50" : "bg-brand-surface";
                  const rowStyle = { backgroundColor: anyDivergence ? "#fef2f2" : "#f5f7fa" };
                  // Quando há fornecedor único e o item não foi extraído pelo parser,
                  // usa o preço do Flex como preço cotado (fornecedor confirmado pelo usuário)
                  const effectiveUnitPrice = row.bestUnitPrice ?? (singleSupplier ? row.baseUnitPrice : null);
                  const effectiveTotal = row.bestTotal ?? (singleSupplier && row.baseUnitPrice != null ? roundDisplay(row.baseUnitPrice * row.requestedQuantity) : null);
                  const hasMultipleOffers = (row.offers?.length ?? 0) > 1;
                  const isExpanded = expandedOffersKey === rowKey;

                  const mainRow = (
                    <motion.tr
                      key={rowKey}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.25 } }}
                      transition={{ duration: 0.2 }}
                      className={`rounded-[24px] ${rowBg} text-sm text-slate-600`}
                      style={rowStyle}
                    >
                      <td className="rounded-l-[24px] px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedRows.has(rowKey)}
                          onChange={() => toggleRow(rowKey)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="px-4 py-4 font-medium text-brand-ink">{row.sku}</td>
                      <td className="px-4 py-4 text-xs text-slate-500">{row.supplierRef ?? "—"}</td>
                      <td className={`px-4 py-4 ${row.descriptionMismatch ? "bg-yellow-50" : ""}`}>
                        <div className="flex flex-col gap-0.5">
                          <span>{row.description}</span>
                          {row.descriptionMismatch && row.supplierDescription && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              <span className="font-semibold">Forn.:</span> {row.supplierDescription}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {qtyDivergence && snapshot.latestRound && !isClosedRound && editingQtyKey === rowKey ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={adjustedQty}
                              onChange={(e) => setAdjustedQty(e.target.value)}
                              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-blue"
                              placeholder="Qtd"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const qty = Number(adjustedQty);
                                if (qty > 0) void saveSelection(row.sku, row.description, row.bestSupplier, row.bestUnitPrice, qty);
                              }}
                              disabled={savingRowKey === rowKey}
                              className="rounded-lg bg-brand-blue px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingQtyKey(null); setAdjustedQty(""); }}
                              className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span>{formatQuantity(row.requestedQuantity)} {row.unit}</span>
                            {qtyDivergence && offer?.quotedQuantity != null && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                                Cotado: {formatQuantity(offer.quotedQuantity)}
                                {snapshot.latestRound && !isClosedRound && (
                                  <button
                                    type="button"
                                    onClick={() => { setEditingQtyKey(rowKey); setAdjustedQty(String(row.requestedQuantity)); }}
                                    className="underline hover:no-underline"
                                  >
                                    Ajustar
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">{row.unit}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <span>{row.bestSupplier ?? singleSupplier ?? "—"}</span>
                          {hasMultipleOffers && (
                            <button
                              type="button"
                              onClick={() => setExpandedOffersKey(isExpanded ? null : rowKey)}
                              className="inline-flex w-fit items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              {isExpanded ? "▲ Recolher" : `▼ Ver ${row.offers?.length ?? 0} ofertas`}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {row.baseUnitPrice != null ? formatCurrency(row.baseUnitPrice) : "—"}
                      </td>
                      <td className={`px-4 py-4 font-medium ${priceDivergence ? "text-red-700" : "text-slate-700"}`}>
                        {effectiveUnitPrice != null ? formatCurrency(effectiveUnitPrice) : "—"}
                      </td>
                      <td className="px-4 py-4">
                        {priceDivergence && row.baseUnitPrice != null && row.bestUnitPrice != null
                          ? formatPriceDiff(row.baseUnitPrice, row.bestUnitPrice)
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-4">
                        {effectiveTotal != null ? formatCurrency(effectiveTotal) : "—"}
                      </td>
                      <td className="rounded-r-[24px] px-4 py-4">
                        <div className="flex flex-col gap-2">
                          <span className={comparisonStatusClasses(anyDivergence ? row.itemStatus : "quoted")}>
                            {anyDivergence && row.itemStatus !== "quoted" ? "Pendente" : "Cotado"}
                          </span>
                          {row.selectionMode === "manual" && hasAnyRawDivergence && (
                            <span className="inline-flex w-fit rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                              Revisado
                            </span>
                          )}
                          {effectiveDescMismatch && snapshot.latestRound && !isClosedRound && row.selectionMode !== "manual" && (
                            <div className="mt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!priceDivergence && !qtyDivergence) {
                                    // Única divergência era descrição — salva e resolve o item
                                    // Para itens sem match no parser (bestSupplier=null), o store aceita null
                                    // e define selectionMode=manual via caminho específico
                                    void saveSelection(row.sku, row.description, row.bestSupplier, row.bestUnitPrice, undefined);
                                  } else {
                                    // Ainda há outras divergências — aceita descrição localmente e mantém o item na tela
                                    setLocallyAcceptedDesc((prev) => { const next = new Set(prev); next.add(rowKey); return next; });
                                  }
                                }}
                                disabled={savingRowKey === rowKey}
                                className="inline-flex w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200 disabled:opacity-50"
                              >
                                Aceitar descrição
                              </button>
                            </div>
                          )}
                          {priceDivergence && snapshot.latestRound && !isClosedRound && row.selectionMode !== "manual" && (
                            <div className="mt-1 flex flex-col gap-1">
                              {editingRowKey === rowKey ? (
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
                                      if (price > 0) void saveSelection(row.sku, row.description, row.bestSupplier, price);
                                    }}
                                    disabled={savingRowKey === rowKey}
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
                                    onClick={() => {
                                      // Accept price AND quoted quantity in one action
                                      const acceptedQty = qtyDivergence ? (offer?.quotedQuantity ?? undefined) : undefined;
                                      void saveSelection(row.sku, row.description, row.bestSupplier, row.bestUnitPrice, acceptedQty);
                                    }}
                                    disabled={savingRowKey === rowKey}
                                    className="inline-flex w-fit rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200 disabled:opacity-50"
                                  >
                                    {savingRowKey === rowKey ? "Salvando..." : "Aceitar cotado"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setEditingRowKey(rowKey); setAdjustedPrice(""); }}
                                    className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                                  >
                                    Ajustar preco
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );

                  const expandedRow = isExpanded && hasMultipleOffers ? (
                    <tr key={`${rowKey}-offers`} className="text-sm">
                      <td colSpan={12} className="rounded-[24px] bg-blue-50 px-6 py-4">
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
                                {snapshot.latestRound && !isClosedRound && o.supplierName !== row.bestSupplier && (
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
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {selectedRows.size > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-[20px] bg-blue-50 px-5 py-3">
            <span className="text-sm font-medium text-blue-700">{selectedRows.size} item(ns) selecionado(s) para negociação</span>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-full bg-brand-blue px-5 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Exportar PDF para negociação
            </button>
          </div>
        )}

        {snapshot.comparisonRows.length > 0 && (() => {
          const pendingCount = snapshot.comparisonRows.filter(hasDivergence).length;
          const allResolved = pendingCount === 0;
          if (isClosedRound) {
            return (
              <div className="mt-6 flex items-center justify-end gap-3">
                <span className="text-sm text-slate-500">Rodada fechada — ajustes bloqueados</span>
                <a
                  href="/pedido-final-pepa"
                  className="rounded-full bg-brand-blue px-6 py-3 text-sm font-medium text-white shadow-panel hover:opacity-90"
                >
                  Ir para Pedido Final →
                </a>
              </div>
            );
          }
          return (
            <div className="mt-6 flex items-center justify-end gap-3">
              {!allResolved && (
                <span className="text-sm text-slate-500">
                  {pendingCount} divergência(s) pendente(s) — revise os itens acima
                </span>
              )}
              {allResolved ? (
                <a
                  href="/validacao-compra-pepa"
                  className="rounded-full bg-brand-blue px-6 py-3 text-sm font-medium text-white shadow-panel hover:opacity-90"
                >
                  Ir para Validação →
                </a>
              ) : (
                <button
                  disabled
                  className="rounded-full bg-slate-200 px-6 py-3 text-sm font-medium text-slate-400 cursor-not-allowed"
                >
                  Ir para Validação →
                </button>
              )}
            </div>
          );
        })()}
      </section>}

      </div>{/* fim pepa-screen-content */}

      {/* Secao de impressao — visivel apenas no print */}
      <div id="pepa-print-view" style={{ display: "none" }}>
        {/* Cabecalho PEPA */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", borderBottom: "2px solid #172033", paddingBottom: "12px", marginBottom: "20px" }}>
          <img src="/logo-pepa.png" alt="PEPA" style={{ height: "60px", objectFit: "contain" }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#172033" }}>PEPA DISTRIBUIDORA MAT. ELETRICOS E CONSTRUCAO LTDA</div>
            <div style={{ fontSize: "11px", color: "#475569" }}>RUA TEODORICO PEDRO LINO 741 — BALNEARIO RINCAO - SC</div>
            <div style={{ fontSize: "11px", color: "#475569" }}>Fone: 48 30458555 | CNPJ: 82.179.524/0001-56 | I.E.: 252096550</div>
          </div>
        </div>

        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontWeight: 700, fontSize: "13px", color: "#172033" }}>Itens com divergencia para negociacao</div>
          <div style={{ fontSize: "11px", color: "#64748b" }}>
            {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
            {snapshot.latestRound ? ` — Rodada: ${snapshot.latestRound.mirrorFileName}` : ""}
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
          <thead>
            <tr style={{ backgroundColor: "#f1f5f9" }}>
              {["SKU Pepa", "SKU Forn.", "Descricao", "Qtd", "Unid.", "Fornecedor", "Preco Flex", "Preco Cotado", "Total"].map((h) => (
                <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #cbd5e1" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selectedRowsData.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: "12px 8px", color: "#94a3b8", textAlign: "center" }}>Nenhum item selecionado.</td></tr>
            ) : selectedRowsData.map((row) => {
              // Busca a offer do fornecedor selecionado; fallback para offers[0]
              const bestOffer =
                row.offers?.find((o) => o.supplierName === row.bestSupplier) ??
                row.offers?.[0] ??
                null;
              const printQtyQuoted =
                typeof bestOffer?.quotedQuantity === "number" && bestOffer.quotedQuantity > 0
                  ? bestOffer.quotedQuantity
                  : null;
              const printQtyDivergence =
                printQtyQuoted != null && Math.abs(printQtyQuoted - row.requestedQuantity) > 0.001;
              return (
              <tr key={`${row.sku}-${row.description}`} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "6px 8px", fontWeight: 600 }}>{row.sku}</td>
                <td style={{ padding: "6px 8px", color: "#64748b" }}>{row.supplierRef ?? "—"}</td>
                <td style={{ padding: "6px 8px", backgroundColor: row.descriptionMismatch ? "#fefce8" : "transparent" }}>
                  <div>{row.description}</div>
                  {row.descriptionMismatch && row.supplierDescription && (
                    <div style={{ fontSize: "9px", color: "#b45309", marginTop: "2px" }}>Forn.: {row.supplierDescription}</div>
                  )}
                </td>
                <td style={{ padding: "6px 8px", backgroundColor: printQtyDivergence ? "#fff7ed" : "transparent" }}>
                  <div>{formatQuantity(row.requestedQuantity)}</div>
                  {printQtyDivergence && (
                    <div style={{ fontSize: "9px", color: "#c2410c", marginTop: "2px" }}>Cotado: {formatQuantity(printQtyQuoted)}</div>
                  )}
                </td>
                <td style={{ padding: "6px 8px" }}>{row.unit}</td>
                <td style={{ padding: "6px 8px" }}>{row.bestSupplier ?? "—"}</td>
                <td style={{ padding: "6px 8px" }}>{row.baseUnitPrice != null ? formatCurrency(row.baseUnitPrice) : "—"}</td>
                <td style={{ padding: "6px 8px", fontWeight: 600, color: hasPriceDivergence(row) ? "#b91c1c" : "inherit" }}>{row.bestUnitPrice != null ? formatCurrency(row.bestUnitPrice) : "—"}</td>
                <td style={{ padding: "6px 8px" }}>{row.bestTotal != null ? formatCurrency(row.bestTotal) : "—"}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function hasPriceDivergence(row: { bestUnitPrice: number | null; baseUnitPrice?: number | null }) {
  if (row.baseUnitPrice == null || row.bestUnitPrice == null) return false;
  return Math.round(row.bestUnitPrice * 100) !== Math.round(row.baseUnitPrice * 100);
}

function hasQuantityDivergence(row: { requestedQuantity: number; bestSupplier?: string | null; offers?: { supplierName: string; quotedQuantity?: number | null }[] }) {
  const offer =
    row.offers?.find((o) => o.supplierName === row.bestSupplier) ??
    row.offers?.[0] ??
    null;
  if (!offer || typeof offer.quotedQuantity !== "number" || offer.quotedQuantity <= 0) return false;
  return Math.abs(offer.quotedQuantity - row.requestedQuantity) > 0.001;
}

function hasDivergence(row: { bestUnitPrice: number | null; baseUnitPrice?: number | null; requestedQuantity: number; bestSupplier?: string | null; offers?: { supplierName: string; quotedQuantity?: number | null }[]; selectionMode?: string; descriptionMismatch?: boolean }) {
  // User made a conscious decision (accepted or adjusted) — all divergences resolved
  if (row.selectionMode === "manual") return false;
  return hasPriceDivergence(row) || hasQuantityDivergence(row) || (row.descriptionMismatch === true);
}

function roundDisplay(value: number) {
  return Math.round(value * 100) / 100;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatPriceDiff(base: number, quoted: number) {
  const diff = ((quoted - base) / base) * 100;
  const label = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${diff > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
      {label}
    </span>
  );
}

function parseLocalCurrency(value: string): number {
  return Number(value.replace(/\./g, "").replace(",", "."));
}

function comparisonStatusClasses(status: string) {
  if (status === "quoted") return "inline-flex rounded-full bg-brand-success/10 px-2 py-0.5 text-xs font-semibold text-brand-success";
  return "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700";
}
