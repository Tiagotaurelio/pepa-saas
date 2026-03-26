export type PepaAttachment = {
  fileName: string;
  role: "mirror" | "supplier-quote";
  supplierName: string | null;
  extractionStatus: "parsed" | "ocr-required" | "template-pending" | "manual-review";
  notes: string;
  detectedFormat?: "csv" | "txt" | "xlsx" | "xls" | "pdf" | "other";
  processingMode?: "immediate-comparison" | "ocr-queue" | "stored-for-review";
  storageProvider?: "local" | "s3";
  storageKey?: string | null;
  storageUrl?: string | null;
};

export type RequestedItem = {
  sku: string;
  description: string;
  unit: string;
  requestedQuantity: number;
  source: "real-supplier-quote" | "inferred-from-quote";
  supplierRef?: string;
  baseUnitPrice?: number;
};

export type SupplierOffer = {
  supplierName: string;
  sourceFile: string;
  extractionStatus: "parsed" | "ocr-required" | "manual-review";
  paymentTerms: string;
  freightTerms: string;
  quoteDate: string | null;
  detectedFormat?: "csv" | "txt" | "xlsx" | "xls" | "pdf" | "other";
  coverageCount: number;
  quotedItemsCount: number;
  totalValue: number | null;
  averageUnitPrice: number | null;
  notes: string;
};

export type ComparisonRow = {
  sourceOrder?: number;
  sku: string;
  description: string;
  unit: string;
  requestedQuantity: number;
  bestSupplier: string | null;
  bestUnitPrice: number | null;
  bestTotal: number | null;
  itemStatus: "quoted" | "ocr-pending";
  source: "real-supplier-quote" | "inferred-from-quote";
  offers?: ComparisonOffer[];
  selectionMode?: "automatic" | "manual";
  baseUnitPrice?: number | null;
  supplierRef?: string;
  supplierDescription?: string | null;
  descriptionMismatch?: boolean;
};

export type ComparisonOffer = {
  supplierName: string;
  unitPrice: number;
  totalValue: number | null;
  quotedQuantity?: number | null;
  supplierDescription?: string | null;
};

export type PepaSnapshot = {
  attachments: PepaAttachment[];
  suppliers: SupplierOffer[];
  comparisonRows: ComparisonRow[];
  latestRound: PepaUploadRoundSummary | null;
  auditEvents?: PepaAuditEvent[];
  diagnostics?: PepaRoundDiagnostics;
  totals: {
    attachmentsReceived: number;
    parsedAttachments: number;
    ocrQueue: number;
    requestedItems: number;
    quotedItems: number;
    coverageRate: number;
    quotedValue: number;
  };
};

export type PepaRoundDiagnostics = {
  parsedSuppliers: number;
  ocrSuppliers: number;
  manualReviewSuppliers: number;
  commercialTermsDetected: number;
  mirrorStructured: boolean;
  mirrorFormat: "csv" | "txt" | "xlsx" | "xls" | "pdf" | "other" | null;
  storedForReviewAttachments: number;
  warnings: string[];
};

export type PepaAuditEvent = {
  id: string;
  type: "round_uploaded" | "selection_changed" | "supplier_terms_changed" | "round_status_changed";
  title: string;
  description: string;
  occurredAt: string;
};

export type PepaUploadRoundSummary = {
  id: string;
  createdAt: string;
  mirrorFileName: string;
  supplierFilesCount: number;
  requestedItemsCount: number;
  attachmentsReceived?: number;
  quotedItems?: number;
  coverageRate?: number;
  status?: "open" | "closed";
};

export type ValidationAlert = {
  title: string;
  detail: string;
  severity: "warning" | "info";
};

export type PurchaseDecisionRow = {
  sku: string;
  description: string;
  requestedQuantity: number;
  chosenSupplier: string;
  chosenUnitPrice: number;
  chosenTotal: number;
  decisionReason: string;
  manualReview: boolean;
  baseUnitPrice?: number | null;
};

export type SupplierPurchaseSummary = {
  supplierName: string;
  itemsSelected: number;
  totalValue: number;
  freightTerms: string;
  paymentTerms: string;
  notes: string;
};

export type PurchaseValidationSnapshot = {
  alerts: ValidationAlert[];
  decisions: PurchaseDecisionRow[];
  supplierSummaries: SupplierPurchaseSummary[];
  totals: {
    selectedItems: number;
    suppliersInOrder: number;
    totalValue: number;
    manualReviewCount: number;
  };
};

export type FlexConnectorMode = "file" | "review" | "archive";

export type PurchaseExportRow = {
  sku: string;
  description: string;
  quantity: number;
  supplier: string;
  unitPrice: number;
  total: number;
  status: "ready" | "pending";
};

export type FinalPurchaseSnapshot = {
  orderNumber: string;
  mirrorNumber: string;
  buyerName: string;
  connectorMode: FlexConnectorMode;
  supplierName: string;
  paymentTerms: string;
  freightTerms: string;
  notes: string[];
  rows: PurchaseExportRow[];
  totals: {
    items: number;
    totalQuantity: number;
    totalValue: number;
    pendingItems: number;
  };
};

export type PepaWorkflowTotals = {
  ocrQueue: number;
  manualReviewCount: number;
  pendingItems: number;
};

export function getPepaSnapshot(): PepaSnapshot {
  return {
    attachments: [],
    suppliers: [],
    comparisonRows: [],
    latestRound: null,
    auditEvents: [],
    diagnostics: {
      parsedSuppliers: 0,
      ocrSuppliers: 0,
      manualReviewSuppliers: 0,
      commercialTermsDetected: 0,
      mirrorStructured: false,
      mirrorFormat: null,
      storedForReviewAttachments: 0,
      warnings: []
    },
    totals: {
      attachmentsReceived: 0,
      parsedAttachments: 0,
      ocrQueue: 0,
      requestedItems: 0,
      quotedItems: 0,
      coverageRate: 0,
      quotedValue: 0
    }
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getPepaPurchaseValidationSnapshot(): PurchaseValidationSnapshot {
  return {
    alerts: [
      {
        title: "Nenhuma rodada carregada",
        detail: "Assim que voce importar uma rodada real, as decisoes de compra e o resumo comercial passam a aparecer aqui.",
        severity: "info"
      }
    ],
    decisions: [],
    supplierSummaries: [],
    totals: {
      selectedItems: 0,
      suppliersInOrder: 0,
      totalValue: 0,
      manualReviewCount: 0
    }
  };
}

export function getPepaFinalPurchaseSnapshot(): FinalPurchaseSnapshot {
  return {
    orderNumber: "Sem pedido",
    mirrorNumber: "Sem espelho",
    buyerName: "Aguardando rodada",
    connectorMode: "file",
    supplierName: "Aguardando rodada",
    paymentTerms: "Nao definido",
    freightTerms: "Nao definido",
    notes: [
      "Nenhuma rodada real foi fechada ainda.",
      "Assim que uma importacao valida for revisada e fechada, o pedido final aparece aqui."
    ],
    rows: [],
    totals: {
      items: 0,
      totalQuantity: 0,
      totalValue: 0,
      pendingItems: 0
    }
  };
}

export function getPepaWorkflowTotals(): PepaWorkflowTotals {
  const quotation = getPepaSnapshot();
  const validation = getPepaPurchaseValidationSnapshot();
  const finalPurchase = getPepaFinalPurchaseSnapshot();

  return {
    ocrQueue: quotation.totals.ocrQueue,
    manualReviewCount: validation.totals.manualReviewCount,
    pendingItems: finalPurchase.totals.pendingItems
  };
}

export function derivePepaWorkflowTotals(snapshot: PepaSnapshot): PepaWorkflowTotals {
  const validation = derivePepaPurchaseValidationSnapshot(snapshot);
  const finalPurchase = derivePepaFinalPurchaseSnapshot(snapshot);

  return {
    ocrQueue: snapshot.totals.ocrQueue,
    manualReviewCount: validation.totals.manualReviewCount,
    pendingItems: finalPurchase.totals.pendingItems
  };
}

export function derivePepaPurchaseValidationSnapshot(snapshot: PepaSnapshot): PurchaseValidationSnapshot {
  if (!snapshot.latestRound) {
    return getPepaPurchaseValidationSnapshot();
  }

  const decisions: PurchaseDecisionRow[] = snapshot.comparisonRows.map((row) => {
    const chosenUnitPrice = row.bestUnitPrice ?? 0;
    const chosenTotal = row.bestTotal ?? 0;
    const matchedSupplier = snapshot.suppliers.find((supplier) => supplier.supplierName === row.bestSupplier) ?? null;
    const commercialPending =
      !matchedSupplier ||
      matchedSupplier.paymentTerms === "Nao lido" ||
      matchedSupplier.paymentTerms === "Aguardando parser comercial" ||
      matchedSupplier.freightTerms === "Nao lido" ||
      matchedSupplier.freightTerms === "Aguardando parser comercial";
    const manualReview = row.itemStatus !== "quoted" || commercialPending;

    return {
      sku: row.sku,
      description: row.description,
      requestedQuantity: row.requestedQuantity,
      chosenSupplier: row.bestSupplier ?? "Aguardando definicao",
      chosenUnitPrice,
      chosenTotal,
      decisionReason: buildDecisionReason(row, commercialPending),
      manualReview,
      baseUnitPrice: row.baseUnitPrice ?? null
    };
  });

  const supplierSummaries: SupplierPurchaseSummary[] = snapshot.suppliers.map((supplier) => {
    const supplierDecisions = decisions.filter((decision) => decision.chosenSupplier === supplier.supplierName);

    return {
      supplierName: supplier.supplierName,
      itemsSelected: supplierDecisions.length,
      totalValue: roundCurrency(supplierDecisions.reduce((total, item) => total + item.chosenTotal, 0)),
      freightTerms: supplier.freightTerms,
      paymentTerms: supplier.paymentTerms,
      notes:
        supplierDecisions.length > 0
          ? `${supplierDecisions.length} item(ns) desta rodada ja apontam para este fornecedor na consolidacao atual.`
          : supplier.notes
    };
  });

  const missingQuotes = decisions.filter((decision) => decision.chosenSupplier === "Aguardando definicao").length;
  const manualReviewCount = decisions.filter((item) => item.manualReview).length;
  const missingCommercialTerms = snapshot.suppliers.filter(
    (supplier) =>
      supplier.extractionStatus === "parsed" &&
      (supplier.paymentTerms === "Aguardando parser comercial" ||
        supplier.freightTerms === "Aguardando parser comercial" ||
        supplier.paymentTerms === "Nao lido" ||
        supplier.freightTerms === "Nao lido")
  ).length;

  const alerts: ValidationAlert[] = [];
  if (missingQuotes > 0) {
    alerts.push({
      title: `${missingQuotes} item(ns) ainda sem melhor oferta`,
      detail: "Esses itens continuam pendentes porque nenhum anexo estruturado conseguiu reconciliar SKU ou descricao com o arquivo-base.",
      severity: "warning"
    });
  }
  if (missingCommercialTerms > 0) {
    alerts.push({
      title: `${missingCommercialTerms} fornecedor(es) sem condicoes comerciais completas`,
      detail: "Pagamento, frete ou data da cotacao ainda precisam de leitura adicional antes do fechamento total do pedido.",
      severity: "warning"
    });
  }
  alerts.push({
    title: "Arquivo final segue a ordem do arquivo-base",
    detail: "A grade de validacao continua respeitando a sequencia original do espelho importado do Flex.",
    severity: "info"
  });

  return {
    alerts,
    decisions,
    supplierSummaries,
    totals: {
      selectedItems: decisions.length,
      suppliersInOrder: supplierSummaries.filter((supplier) => supplier.itemsSelected > 0).length,
      totalValue: roundCurrency(decisions.reduce((total, item) => total + item.chosenTotal, 0)),
      manualReviewCount
    }
  };
}

export function derivePepaFinalPurchaseSnapshot(snapshot: PepaSnapshot): FinalPurchaseSnapshot {
  if (!snapshot.latestRound) {
    return getPepaFinalPurchaseSnapshot();
  }

  const validation = derivePepaPurchaseValidationSnapshot(snapshot);
  const activeSuppliers = validation.supplierSummaries.filter((supplier) => supplier.itemsSelected > 0);
  const primarySupplier =
    activeSuppliers.sort((left, right) => right.totalValue - left.totalValue)[0] ?? snapshot.suppliers[0] ?? null;

  const rows: PurchaseExportRow[] = validation.decisions.map((decision) => ({
    sku: decision.sku,
    description: decision.description,
    quantity: decision.requestedQuantity,
    supplier: decision.chosenSupplier,
    unitPrice: decision.chosenUnitPrice,
    total: decision.chosenTotal,
    status: decision.manualReview ? "pending" : "ready"
  }));

  return {
    orderNumber: `PC-PEPA-${snapshot.latestRound.id.slice(0, 8).toUpperCase()}`,
    mirrorNumber: snapshot.latestRound.mirrorFileName.replace(/\.[^.]+$/, ""),
    buyerName: "Comprador PEPA",
    connectorMode: "file",
    supplierName: primarySupplier?.supplierName ?? "Aguardando consolidacao",
    paymentTerms: primarySupplier?.paymentTerms ?? "Nao definido",
    freightTerms: primarySupplier?.freightTerms ?? "Nao definido",
    notes: [
      `Pedido consolidado a partir da rodada ${snapshot.latestRound.id.slice(0, 8)}.`,
      `${rows.filter((row) => row.status === "pending").length} item(ns) ainda exigem revisao antes da exportacao definitiva.`,
      "A saida continua preservando a ordem original do arquivo-base importado."
    ],
    rows,
    totals: {
      items: rows.length,
      totalQuantity: rows.reduce((total, row) => total + row.quantity, 0),
      totalValue: roundCurrency(rows.reduce((total, row) => total + row.total, 0)),
      pendingItems: rows.filter((row) => row.status === "pending").length
    }
  };
}

function buildDecisionReason(row: ComparisonRow, commercialPending: boolean): string {
  if (row.itemStatus !== "quoted") {
    return "Item ainda sem cotacao reconciliada. Requer OCR ou ajuste manual.";
  }

  if (commercialPending) {
    return "Menor oferta encontrada, mas ainda falta validar condicoes comerciais completas.";
  }

  return "Menor oferta reconciliada automaticamente com condicoes comerciais disponiveis.";
}
