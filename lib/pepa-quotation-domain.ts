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
};

export type ComparisonOffer = {
  supplierName: string;
  unitPrice: number;
  totalValue: number | null;
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

const realQuotedItems = [
  {
    sku: "00003.016",
    description: "Cabo FlexSil 750 V 1,00 Preto",
    unit: "Rolo 100m",
    requestedQuantity: 100,
    unitPrice: 0.9581
  },
  {
    sku: "00003.016",
    description: "Cabo FlexSil 750 V 1,00 Azul",
    unit: "Rolo 100m",
    requestedQuantity: 200,
    unitPrice: 0.9581
  },
  {
    sku: "00003.017",
    description: "Cabo FlexSil 750 V 1,50 Preto",
    unit: "Rolo 100m",
    requestedQuantity: 1000,
    unitPrice: 1.0986
  },
  {
    sku: "00003.017",
    description: "Cabo FlexSil 750 V 1,50 Amarelo",
    unit: "Rolo 100m",
    requestedQuantity: 1500,
    unitPrice: 1.0986
  },
  {
    sku: "00003.018",
    description: "Cabo FlexSil 750 V 2,50 Preto",
    unit: "Rolo 100m",
    requestedQuantity: 8000,
    unitPrice: 1.7677
  },
  {
    sku: "00003.018",
    description: "Cabo FlexSil 750 V 2,50 Azul",
    unit: "Rolo 100m",
    requestedQuantity: 10000,
    unitPrice: 1.7677
  },
  {
    sku: "00003.019",
    description: "Cabo FlexSil 750 V 4,00 Verde",
    unit: "Rolo 100m",
    requestedQuantity: 1000,
    unitPrice: 2.9078
  },
  {
    sku: "00003.020",
    description: "Cabo FlexSil 750 V 6,00 Preto",
    unit: "Rolo 100m",
    requestedQuantity: 1000,
    unitPrice: 4.358
  },
  {
    sku: "00003.020",
    description: "Cabo FlexSil 750 V 6,00 Azul",
    unit: "Rolo 100m",
    requestedQuantity: 1000,
    unitPrice: 4.358
  },
  {
    sku: "00003.021",
    description: "Cabo FlexSil 750 V 10,00 Azul",
    unit: "Rolo 100m",
    requestedQuantity: 1000,
    unitPrice: 7.645
  },
  {
    sku: "00003.022",
    description: "Cabo FlexSil 750 V 16,00 Vermelho",
    unit: "Rolo 100m",
    requestedQuantity: 200,
    unitPrice: 12.2214
  },
  {
    sku: "00005.018",
    description: "Cordao Flex Paralelo SIL 300 V 2,50 Preto",
    unit: "Rolo 100m",
    requestedQuantity: 500,
    unitPrice: 3.9283
  }
] as const;

export function getPepaSnapshot(): PepaSnapshot {
  const comparisonRows: ComparisonRow[] = realQuotedItems.map((item) => ({
    sourceOrder: realQuotedItems.findIndex(
      (candidate) => candidate.sku === item.sku && candidate.description === item.description
    ) + 1,
    sku: item.sku,
    description: item.description,
    unit: item.unit,
    requestedQuantity: item.requestedQuantity,
    bestSupplier: "Irimar",
    bestUnitPrice: item.unitPrice,
    bestTotal: roundCurrency(item.requestedQuantity * item.unitPrice),
    itemStatus: "quoted",
    source: "inferred-from-quote"
  }));

  const quotedValue = comparisonRows.reduce((total, row) => total + (row.bestTotal ?? 0), 0);

  const attachments: PepaAttachment[] = [
    {
      fileName: "Orcamento_4910PEPA-20409.pdf",
      role: "mirror",
      supplierName: null,
      extractionStatus: "template-pending",
      detectedFormat: "pdf",
      processingMode: "stored-for-review",
      notes:
        "Arquivo exportado do Flex que deve se tornar a referencia principal de sequencia, itens e quantidades."
    },
    {
      fileName: "Pepa Distr de Mat Elet e de Const Ltda 825918.pdf",
      role: "supplier-quote",
      supplierName: "Irimar",
      extractionStatus: "parsed",
      detectedFormat: "pdf",
      processingMode: "immediate-comparison",
      notes:
        "Resposta de fornecedor com texto nativo. O comparativo precisa reorganizar este retorno para a mesma sequencia do arquivo-base."
    },
    {
      fileName: "20409.pdf",
      role: "supplier-quote",
      supplierName: "Fornecedor 20409",
      extractionStatus: "ocr-required",
      detectedFormat: "pdf",
      processingMode: "ocr-queue",
      notes:
        "Arquivo sem texto extraivel no ambiente atual. Deve entrar na fila OCR antes de ser reorganizado na ordem do arquivo-base."
    },
    {
      fileName: "2113.pdf",
      role: "supplier-quote",
      supplierName: "Fornecedor 2113",
      extractionStatus: "ocr-required",
      detectedFormat: "pdf",
      processingMode: "ocr-queue",
      notes:
        "Anexo com aparencia de imagem ou PDF escaneado. Requer OCR antes da comparacao automatica."
    }
  ];

  const suppliers: SupplierOffer[] = [
    {
      supplierName: "Irimar",
      sourceFile: "Pepa Distr de Mat Elet e de Const Ltda 825918.pdf",
      extractionStatus: "parsed",
      detectedFormat: "pdf",
      paymentTerms: "21/28/35/42/49 dias",
      freightTerms: "CIF, 3% da metragem",
      quoteDate: "2026-03-13",
      coverageCount: comparisonRows.length,
      quotedItemsCount: comparisonRows.length,
      totalValue: roundCurrency(quotedValue),
      averageUnitPrice: roundCurrency(
        comparisonRows.reduce((total, row) => total + (row.bestUnitPrice ?? 0), 0) / comparisonRows.length
      ),
      notes:
        "Fornecedor lido com sucesso. Serve como base para calibrar a reorganizacao dos itens na ordem do arquivo-base."
    },
    {
      supplierName: "Fornecedor 20409",
      sourceFile: "20409.pdf",
      extractionStatus: "ocr-required",
      detectedFormat: "pdf",
      paymentTerms: "Nao lido",
      freightTerms: "Nao lido",
      quoteDate: null,
      coverageCount: 0,
      quotedItemsCount: 0,
      totalValue: null,
      averageUnitPrice: null,
      notes:
        "Fluxo operacional precisa mandar este arquivo para OCR e so depois reconciliar itens contra o arquivo-base."
    },
    {
      supplierName: "Fornecedor 2113",
      sourceFile: "2113.pdf",
      extractionStatus: "ocr-required",
      detectedFormat: "pdf",
      paymentTerms: "Nao lido",
      freightTerms: "Nao lido",
      quoteDate: null,
      coverageCount: 0,
      quotedItemsCount: 0,
      totalValue: null,
      averageUnitPrice: null,
      notes:
        "Mesmo tratamento do anexo 20409: OCR, normalizacao e validacao antes de entrar no ranking."
    }
  ];

  return {
    attachments,
    suppliers,
    comparisonRows,
    latestRound: null,
    auditEvents: [
      {
        id: "seed-round-uploaded",
        type: "round_uploaded",
        title: "Rodada piloto carregada",
        description: "Snapshot demonstrativo inicial da PEPA carregado com comparativo base.",
        occurredAt: "2026-03-17T10:00:00.000Z"
      }
    ],
    diagnostics: {
      parsedSuppliers: 1,
      ocrSuppliers: 2,
      manualReviewSuppliers: 0,
      commercialTermsDetected: 1,
      mirrorStructured: false,
      mirrorFormat: "pdf",
      storedForReviewAttachments: 1,
      warnings: [
        "2 anexos ainda dependem de OCR para entrar no comparativo.",
        "Somente 1 fornecedor possui condicoes comerciais completas no dataset piloto.",
        "O arquivo-base piloto esta em PDF e nao gera comparativo imediato sem estrutura tabular suficiente."
      ]
    },
    totals: {
      attachmentsReceived: attachments.length,
      parsedAttachments: attachments.filter((attachment) => attachment.extractionStatus === "parsed").length,
      ocrQueue: attachments.filter((attachment) => attachment.extractionStatus === "ocr-required").length,
      requestedItems: comparisonRows.length,
      quotedItems: comparisonRows.filter((row) => row.itemStatus === "quoted").length,
      coverageRate: Math.round(
        (comparisonRows.filter((row) => row.itemStatus === "quoted").length / comparisonRows.length) * 100
      ),
      quotedValue: roundCurrency(quotedValue)
    }
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getPepaPurchaseValidationSnapshot(): PurchaseValidationSnapshot {
  const decisions: PurchaseDecisionRow[] = [
    {
      sku: "00003.018",
      description: "Cabo FlexSil 750 V 2,50 Azul",
      requestedQuantity: 10000,
      chosenSupplier: "Irimar",
      chosenUnitPrice: 1.7677,
      chosenTotal: roundCurrency(10000 * 1.7677),
      decisionReason: "Menor preco validado no comparativo atual.",
      manualReview: false
    },
    {
      sku: "00003.018",
      description: "Cabo FlexSil 750 V 2,50 Preto",
      requestedQuantity: 8000,
      chosenSupplier: "Irimar",
      chosenUnitPrice: 1.7677,
      chosenTotal: roundCurrency(8000 * 1.7677),
      decisionReason: "Mantido no mesmo fornecedor para evitar fracionamento desnecessario.",
      manualReview: false
    },
    {
      sku: "00003.020",
      description: "Cabo FlexSil 750 V 6,00 Preto",
      requestedQuantity: 1000,
      chosenSupplier: "Irimar",
      chosenUnitPrice: 4.358,
      chosenTotal: roundCurrency(1000 * 4.358),
      decisionReason: "Preco competitivo, condicao de pagamento compatível.",
      manualReview: false
    },
    {
      sku: "00003.021",
      description: "Cabo FlexSil 750 V 10,00 Azul",
      requestedQuantity: 1000,
      chosenSupplier: "Irimar",
      chosenUnitPrice: 7.645,
      chosenTotal: roundCurrency(1000 * 7.645),
      decisionReason: "Aguardando confirmacao de disponibilidade final do lote.",
      manualReview: true
    },
    {
      sku: "00005.018",
      description: "Cordao Flex Paralelo SIL 300 V 2,50 Preto",
      requestedQuantity: 500,
      chosenSupplier: "Irimar",
      chosenUnitPrice: 3.9283,
      chosenTotal: roundCurrency(500 * 3.9283),
      decisionReason: "Item pronto para consolidacao do pedido.",
      manualReview: false
    }
  ];

  const supplierSummaries: SupplierPurchaseSummary[] = [
    {
      supplierName: "Irimar",
      itemsSelected: decisions.length,
      totalValue: roundCurrency(decisions.reduce((total, item) => total + item.chosenTotal, 0)),
      freightTerms: "CIF, 3% da metragem",
      paymentTerms: "21/28/35/42/49 dias",
      notes: "Fornecedor consolidado no pedido piloto, com 1 item ainda aguardando validacao final e a grade mantida na ordem do arquivo-base."
    }
  ];

  return {
    alerts: [
      {
        title: "1 item exige validacao final",
        detail: "O SKU 00003.021 depende de confirmacao de disponibilidade antes de fechar a exportacao final.",
        severity: "warning"
      },
      {
        title: "Arquivo final segue a ordem do arquivo-base",
        detail: "Mesmo que o fornecedor responda em outra sequencia, a grade final continua respeitando a ordem original do arquivo importado do Flex.",
        severity: "info"
      }
    ],
    decisions,
    supplierSummaries,
    totals: {
      selectedItems: decisions.length,
      suppliersInOrder: supplierSummaries.length,
      totalValue: supplierSummaries.reduce((total, supplier) => total + supplier.totalValue, 0),
      manualReviewCount: decisions.filter((item) => item.manualReview).length
    }
  };
}

export function getPepaFinalPurchaseSnapshot(): FinalPurchaseSnapshot {
  const rows: PurchaseExportRow[] = [
    {
      sku: "00003.018",
      description: "Cabo FlexSil 750 V 2,50 Azul",
      quantity: 10000,
      supplier: "Irimar",
      unitPrice: 1.7677,
      total: roundCurrency(10000 * 1.7677),
      status: "ready"
    },
    {
      sku: "00003.018",
      description: "Cabo FlexSil 750 V 2,50 Preto",
      quantity: 8000,
      supplier: "Irimar",
      unitPrice: 1.7677,
      total: roundCurrency(8000 * 1.7677),
      status: "ready"
    },
    {
      sku: "00003.020",
      description: "Cabo FlexSil 750 V 6,00 Preto",
      quantity: 1000,
      supplier: "Irimar",
      unitPrice: 4.358,
      total: roundCurrency(1000 * 4.358),
      status: "ready"
    },
    {
      sku: "00003.021",
      description: "Cabo FlexSil 750 V 10,00 Azul",
      quantity: 1000,
      supplier: "Irimar",
      unitPrice: 7.645,
      total: roundCurrency(1000 * 7.645),
      status: "pending"
    },
    {
      sku: "00005.018",
      description: "Cordao Flex Paralelo SIL 300 V 2,50 Preto",
      quantity: 500,
      supplier: "Irimar",
      unitPrice: 3.9283,
      total: roundCurrency(500 * 3.9283),
      status: "ready"
    }
  ];

  return {
    orderNumber: "PC-PEPA-000184",
    mirrorNumber: "4910PEPA-20409",
    buyerName: "Comprador PEPA",
    connectorMode: "file",
    supplierName: "Irimar",
    paymentTerms: "21/28/35/42/49 dias",
    freightTerms: "CIF, 3% da metragem",
    notes: [
      "Pedido consolidado a partir do arquivo-base exportado do Flex 4910PEPA-20409.",
      "1 item ainda exige confirmacao final antes da exportacao definitiva.",
      "O arquivo final deve manter a mesma ordem de itens do arquivo-base importado."
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
      manualReview
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
