import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import ExcelJS from "exceljs";
import pdfParse from "pdf-parse";

import {
  ComparisonOffer,
  ComparisonRow,
  FinalPurchaseSnapshot,
  PepaAuditEvent,
  PepaAttachment,
  PepaSnapshot,
  PepaUploadRoundSummary,
  RequestedItem,
  SupplierOffer,
  derivePepaFinalPurchaseSnapshot,
  getPepaSnapshot
} from "@/lib/pepa-quotation-domain";
import {
  listPepaRounds,
  loadLatestPepaSnapshot,
  loadPepaSnapshotByRoundId,
  savePepaSnapshot,
  updatePepaSnapshot
} from "@/lib/db";

type UploadFileInput = {
  name: string;
  type: string;
  buffer: Buffer;
};

type ParsedTable = {
  headers: string[];
  rows: string[][];
  rawLines: string[];
};

type DetectedFileFormat = "csv" | "txt" | "xlsx" | "xls" | "pdf" | "other";

type FileCapability = {
  detectedFormat: DetectedFileFormat;
  canUseTabularParser: boolean;
  canUseOcrFallback: boolean;
  recommendedProcessingMode: "immediate-comparison" | "ocr-queue" | "stored-for-review";
};

type SupplierQuoteRow = {
  sku: string;
  description: string;
  unitPrice: number;
  finalUnitPrice?: number;
  totalValue: number | null;
  quotedQuantity?: number;
};

type ParsedSupplierFile = {
  supplierName: string;
  sourceFile: string;
  extractionStatus: "parsed" | "ocr-required" | "manual-review";
  detectedFormat: DetectedFileFormat;
  quotedItems: SupplierQuoteRow[];
  paymentTerms: string;
  freightTerms: string;
  quoteDate: string | null;
};

type StoredUploadMeta = {
  storageProvider: "local" | "s3";
  storageKey: string;
  storageUrl: string | null;
  fileName: string;
};

export async function readPepaSnapshot(tenantId: string, roundId?: string): Promise<PepaSnapshot> {
  if (roundId) {
    return (await loadPepaSnapshotByRoundId(tenantId, roundId)) ?? getPepaSnapshot();
  }

  return (await loadLatestPepaSnapshot(tenantId)) ?? getPepaSnapshot();
}

export async function readPepaRounds(tenantId: string): Promise<PepaUploadRoundSummary[]> {
  return (await listPepaRounds(tenantId)).map((row) => {
    const snapshot = JSON.parse(row.snapshot_json) as PepaSnapshot;
    return {
      id: row.id,
      createdAt: row.created_at,
      mirrorFileName: row.mirror_file_name,
      supplierFilesCount: row.supplier_files_count,
      requestedItemsCount: snapshot.latestRound?.requestedItemsCount ?? snapshot.totals.requestedItems,
      attachmentsReceived: snapshot.totals.attachmentsReceived,
      quotedItems: snapshot.totals.quotedItems,
      coverageRate: snapshot.totals.coverageRate,
      status: snapshot.latestRound?.status ?? "open"
    };
  });
}

export async function updateComparisonSelection(params: {
  tenantId: string;
  roundId: string;
  sku: string;
  description: string;
  supplierName: string | null;
  unitPrice?: number | null;
  quantity?: number | null;
}) {
  const snapshot = await readPepaSnapshot(params.tenantId, params.roundId);
  if (!snapshot.latestRound || snapshot.latestRound.id !== params.roundId) {
    throw new Error("Rodada de cotacao nao encontrada.");
  }
  if (snapshot.latestRound.status === "closed") {
    throw new Error("Esta rodada esta fechada para edicao.");
  }

  const nextRows = snapshot.comparisonRows.map((row) => {
    if (row.sku !== params.sku || row.description !== params.description) {
      return row;
    }

    if (!params.supplierName) {
      return {
        ...row,
        bestSupplier: null,
        bestUnitPrice: null,
        bestTotal: null,
        itemStatus: "ocr-pending" as const,
        selectionMode: "manual" as const
      };
    }

    const chosenOffer = (row.offers ?? []).find((offer) => offer.supplierName === params.supplierName);
    if (!chosenOffer) {
      return row;
    }

    const finalUnitPrice = typeof params.unitPrice === "number" && params.unitPrice > 0 ? params.unitPrice : chosenOffer.unitPrice;
    const finalQuantity = typeof params.quantity === "number" && params.quantity > 0 ? params.quantity : row.requestedQuantity;

    return {
      ...row,
      requestedQuantity: finalQuantity,
      bestSupplier: chosenOffer.supplierName,
      bestUnitPrice: finalUnitPrice,
      bestTotal: roundCurrency(finalQuantity * finalUnitPrice),
      itemStatus: "quoted" as const,
      selectionMode: "manual" as const
    };
  });

  const normalizedSnapshot = recalculateSnapshot({
    ...snapshot,
    comparisonRows: nextRows,
    auditEvents: [
      createAuditEvent(
        "selection_changed",
        `Selecao manual atualizada para ${params.sku}`,
        `Fornecedor ${params.supplierName ?? "pendente"} aplicado ao item ${params.description}.`
      ),
      ...(snapshot.auditEvents ?? [])
    ]
  });

  await updatePepaSnapshot({
    roundId: params.roundId,
    tenantId: params.tenantId,
    snapshot: normalizedSnapshot
  });

  return normalizedSnapshot;
}

export async function updateSupplierCommercialTerms(params: {
  tenantId: string;
  roundId: string;
  supplierName: string;
  paymentTerms: string;
  freightTerms: string;
}) {
  const snapshot = await readPepaSnapshot(params.tenantId, params.roundId);
  if (!snapshot.latestRound || snapshot.latestRound.id !== params.roundId) {
    throw new Error("Rodada de cotacao nao encontrada.");
  }
  if (snapshot.latestRound.status === "closed") {
    throw new Error("Esta rodada esta fechada para edicao.");
  }

  const suppliers = snapshot.suppliers.map((supplier) =>
    supplier.supplierName === params.supplierName
      ? {
          ...supplier,
          paymentTerms: params.paymentTerms.trim() || supplier.paymentTerms,
          freightTerms: params.freightTerms.trim() || supplier.freightTerms
        }
      : supplier
  );

  const normalizedSnapshot = recalculateSnapshot({
    ...snapshot,
    suppliers,
    auditEvents: [
      createAuditEvent(
        "supplier_terms_changed",
        `Condicoes comerciais atualizadas para ${params.supplierName}`,
        `Pagamento: ${params.paymentTerms}. Frete: ${params.freightTerms}.`
      ),
      ...(snapshot.auditEvents ?? [])
    ]
  });

  await updatePepaSnapshot({
    roundId: params.roundId,
    tenantId: params.tenantId,
    snapshot: normalizedSnapshot
  });

  return normalizedSnapshot;
}

export async function buildFinalPurchaseExport(tenantId: string, roundId?: string): Promise<FinalPurchaseSnapshot> {
  const snapshot = await readPepaSnapshot(tenantId, roundId);
  return derivePepaFinalPurchaseSnapshot(snapshot);
}

export async function updateRoundStatus(params: {
  tenantId: string;
  roundId: string;
  status: "open" | "closed";
}) {
  const snapshot = await readPepaSnapshot(params.tenantId, params.roundId);
  if (!snapshot.latestRound || snapshot.latestRound.id !== params.roundId) {
    throw new Error("Rodada de cotacao nao encontrada.");
  }

  const nextSnapshot: PepaSnapshot = {
    ...snapshot,
    latestRound: {
      ...snapshot.latestRound,
      status: params.status
    },
    auditEvents: [
      createAuditEvent(
        "round_status_changed",
        `Rodada ${params.status === "closed" ? "fechada" : "reaberta"}`,
        `Status da rodada ${params.roundId.slice(0, 8)} alterado para ${params.status}.`
      ),
      ...(snapshot.auditEvents ?? [])
    ]
  };

  await updatePepaSnapshot({
    roundId: params.roundId,
    tenantId: params.tenantId,
    snapshot: nextSnapshot
  });

  return nextSnapshot;
}

export async function persistPepaUploadRound(params: {
  tenantId: string;
  mirrorFile: UploadFileInput;
  supplierFiles: UploadFileInput[];
}): Promise<PepaSnapshot> {
  const roundId = randomUUID();
  const createdAt = new Date().toISOString();
  const storedUploads = new Map<string, StoredUploadMeta>();
  const mirrorStored = await persistUploadFile(params.tenantId, roundId, params.mirrorFile);
  storedUploads.set(params.mirrorFile.name, mirrorStored);
  for (const supplierFile of params.supplierFiles) {
    storedUploads.set(supplierFile.name, await persistUploadFile(params.tenantId, roundId, supplierFile));
  }

  const requestedItems = await extractRequestedItemsFromMirror(params.mirrorFile);
  const parsedSupplierFiles = await Promise.all(params.supplierFiles.map(parseSupplierFile));
  const mirrorCapability = classifyUploadFile(params.mirrorFile);
  const attachments = buildAttachments(params.mirrorFile, parsedSupplierFiles, requestedItems.length, storedUploads);
  const comparisonRows = buildComparisonRows(requestedItems, parsedSupplierFiles);
  const suppliers = buildSuppliers(parsedSupplierFiles, comparisonRows);
  const quotedItems = comparisonRows.filter((row) => row.itemStatus === "quoted").length;
  const quotedValue = roundCurrency(
    comparisonRows.reduce((total, row) => total + (row.bestTotal ?? 0), 0)
  );
  const diagnostics = buildDiagnostics(parsedSupplierFiles, mirrorCapability, requestedItems.length, attachments);

  const snapshot: PepaSnapshot = {
    latestRound: {
      id: roundId,
      createdAt,
      mirrorFileName: params.mirrorFile.name,
      supplierFilesCount: params.supplierFiles.length,
      requestedItemsCount: requestedItems.length,
      attachmentsReceived: attachments.length,
      quotedItems,
      coverageRate: requestedItems.length === 0 ? 0 : Math.round((quotedItems / requestedItems.length) * 100),
      status: "open"
    },
    attachments,
    suppliers,
    comparisonRows,
    diagnostics,
    auditEvents: [
      createAuditEvent(
        "round_uploaded",
        "Nova rodada de cotacao recebida",
        `${params.mirrorFile.name} com ${params.supplierFiles.length} anexo(s) de fornecedor salvo(s) para processamento.`
      )
    ],
    totals: {
      attachmentsReceived: attachments.length,
      parsedAttachments: attachments.filter((attachment) => attachment.extractionStatus === "parsed").length,
      ocrQueue: attachments.filter((attachment) => attachment.extractionStatus === "ocr-required").length,
      requestedItems: requestedItems.length,
      quotedItems,
      coverageRate: requestedItems.length === 0 ? 0 : Math.round((quotedItems / requestedItems.length) * 100),
      quotedValue
    }
  };

  await savePepaSnapshot({
    id: roundId,
    tenantId: params.tenantId,
    createdAt,
    mirrorFileName: params.mirrorFile.name,
    supplierFilesCount: params.supplierFiles.length,
    snapshot
  });

  return snapshot;
}

function buildAttachments(
  mirrorFile: UploadFileInput,
  supplierFiles: ParsedSupplierFile[],
  requestedItemsCount: number,
  storedUploads: Map<string, StoredUploadMeta>
): PepaAttachment[] {
  const mirrorStored = storedUploads.get(mirrorFile.name);
  const mirrorCapability = classifyUploadFile(mirrorFile);
  const mirrorParsed = requestedItemsCount > 0;
  const mirrorAttachment: PepaAttachment = {
    fileName: mirrorFile.name,
    role: "mirror",
    supplierName: null,
    extractionStatus: mirrorParsed
      ? "parsed"
      : mirrorCapability.recommendedProcessingMode === "stored-for-review"
        ? "manual-review"
        : "template-pending",
    detectedFormat: mirrorCapability.detectedFormat,
    processingMode: mirrorParsed ? "immediate-comparison" : mirrorCapability.recommendedProcessingMode,
    notes: mirrorParsed
      ? `Arquivo-base salvo em ${describeStorage(mirrorStored)} e lido com ${requestedItemsCount} item(ns) estruturado(s) para o comparativo.`
      : mirrorCapability.detectedFormat === "pdf"
        ? `Arquivo-base salvo em ${describeStorage(mirrorStored)}, mas o PDF nao trouxe colunas suficientes para estruturar os itens automaticamente.`
        : mirrorCapability.recommendedProcessingMode === "stored-for-review"
          ? `Arquivo-base salvo em ${describeStorage(mirrorStored)} somente para revisao manual. Este formato ainda nao monta comparativo imediato.`
          : `Arquivo-base salvo em ${describeStorage(mirrorStored)}, mas sem colunas suficientes para estruturar os itens automaticamente.`,
    storageProvider: mirrorStored?.storageProvider,
    storageKey: mirrorStored?.storageKey ?? null,
    storageUrl: mirrorStored?.storageUrl ?? null
  };

  const supplierAttachments = supplierFiles.map<PepaAttachment>((file) => {
    const stored = storedUploads.get(file.sourceFile);
    const parsed = file.extractionStatus === "parsed";
    return {
      fileName: file.sourceFile,
      role: "supplier-quote",
      supplierName: file.supplierName,
      extractionStatus: parsed ? "parsed" : file.extractionStatus,
      detectedFormat: file.detectedFormat,
      processingMode: parsed ? "immediate-comparison" : file.extractionStatus === "ocr-required" ? "ocr-queue" : "stored-for-review",
      notes: parsed
        ? `Arquivo salvo em ${describeStorage(stored)}. ${file.quotedItems.length} item(ns) de cotacao foram reconhecidos para reconciliacao automatica.`
        : file.extractionStatus === "ocr-required"
          ? `Arquivo salvo em ${describeStorage(stored)} e encaminhado para fila OCR antes da reconciliacao automatica dos itens.`
          : `Arquivo salvo em ${describeStorage(stored)} apenas para revisao manual. Este formato ainda nao entra no parser automatico nem na fila OCR atual.`,
      storageProvider: stored?.storageProvider,
      storageKey: stored?.storageKey ?? null,
      storageUrl: stored?.storageUrl ?? null
    };
  });

  return [mirrorAttachment, ...supplierAttachments];
}

function buildSuppliers(
  supplierFiles: ParsedSupplierFile[],
  comparisonRows: ComparisonRow[]
): SupplierOffer[] {
  return supplierFiles.map((file) => {
    const parsed = file.extractionStatus === "parsed";
    const matchedRows = comparisonRows.filter((row) => row.bestSupplier === file.supplierName);
    const totalValue = matchedRows.reduce((total, row) => total + (row.bestTotal ?? 0), 0);
    const averageUnitPrice =
      matchedRows.length > 0
        ? roundCurrency(
            matchedRows.reduce((total, row) => total + (row.bestUnitPrice ?? 0), 0) / matchedRows.length
          )
        : null;

    return {
      supplierName: file.supplierName,
      sourceFile: file.sourceFile,
      extractionStatus: parsed ? "parsed" : file.extractionStatus,
      detectedFormat: file.detectedFormat,
      paymentTerms: file.paymentTerms,
      freightTerms: file.freightTerms,
      quoteDate: file.quoteDate,
      coverageCount: matchedRows.length,
      quotedItemsCount: file.quotedItems.length,
      totalValue: matchedRows.length > 0 ? roundCurrency(totalValue) : null,
      averageUnitPrice,
      notes: parsed
        ? `Arquivo estruturado recebido e reconciliado com ${matchedRows.length} item(ns) do espelho.`
        : file.extractionStatus === "ocr-required"
          ? "Arquivo recebido, mas ainda depende de OCR ou parser especifico para entrar no ranking."
          : "Arquivo recebido e salvo, mas este formato ainda exige revisao manual antes de entrar no ranking."
    };
  });
}

function buildComparisonRows(
  requestedItems: RequestedItem[],
  supplierFiles: ParsedSupplierFile[]
): ComparisonRow[] {
  return requestedItems.map((item, index) => {
    const matchedQuotes = supplierFiles
      .flatMap((file) =>
        file.quotedItems
          .filter((quote) => quoteMatchesItem(quote, item))
          .map((quote) => ({
            supplierName: file.supplierName,
            quote
          }))
      )
      .sort((left, right) => left.quote.unitPrice - right.quote.unitPrice);

    const bestQuote = matchedQuotes[0] ?? null;
    const offers: ComparisonOffer[] = matchedQuotes.map(({ supplierName, quote }) => ({
      supplierName,
      unitPrice: quote.unitPrice,
      totalValue: quote.totalValue,
      quotedQuantity: quote.quotedQuantity ?? null
    }));

    return {
      sourceOrder: index + 1,
      sku: item.sku,
      description: item.description,
      unit: item.unit,
      requestedQuantity: item.requestedQuantity,
      bestSupplier: bestQuote?.supplierName ?? null,
      bestUnitPrice: bestQuote?.quote.unitPrice ?? null,
      bestTotal: bestQuote ? roundCurrency(item.requestedQuantity * bestQuote.quote.unitPrice) : null,
      itemStatus: bestQuote ? "quoted" : "ocr-pending",
      source: item.source,
      offers,
      selectionMode: "automatic",
      baseUnitPrice: item.baseUnitPrice ?? null,
      supplierRef: item.supplierRef
    };
  });
}

async function extractRequestedItemsFromMirror(file: UploadFileInput): Promise<RequestedItem[]> {
  const capability = classifyUploadFile(file);
  if (!capability.canUseTabularParser) {
    return [];
  }

  // Parser dedicado para PDF gerado pelo Flex (COMPRA DE MERCADORIA)
  if (file.name.toLowerCase().endsWith(".pdf")) {
    const lines = await extractTextLines(file);
    const flexItems = parseFlexOrderPdfLines(lines);
    if (flexItems.length > 0) return flexItems;
    return inferRequestedItemsFromLines(lines);
  }

  const table = await parseTabularFile(file);
  if (!table) {
    return inferRequestedItemsFromLines(await extractTextLines(file));
  }

  const skuIndex = findHeaderIndex(table.headers, ["sku", "codigo", "codigo_produto", "item"]);
  const descriptionIndex = findHeaderIndex(table.headers, ["descricao", "produto", "item_descricao"]);
  const unitIndex = findHeaderIndex(table.headers, ["unidade", "un", "und"]);
  const quantityIndex = findHeaderIndex(table.headers, ["quantidade", "qtd", "qtde"]);

  if (skuIndex < 0 || descriptionIndex < 0 || quantityIndex < 0) {
    return inferRequestedItemsFromRows(table.rows, table.rawLines);
  }

  return table.rows
    .map((columns) => ({
      sku: columns[skuIndex] ?? "",
      description: columns[descriptionIndex] ?? "",
      unit: columns[unitIndex] ?? "UN",
      requestedQuantity: parseDecimal(columns[quantityIndex] ?? ""),
      source: "inferred-from-quote" as const
    }))
    .filter((item) => item.sku && item.description && Number.isFinite(item.requestedQuantity) && item.requestedQuantity > 0);
}

async function parseSupplierFile(file: UploadFileInput): Promise<ParsedSupplierFile> {
  const supplierName = inferSupplierName(file.name);
  const capability = classifyUploadFile(file);
  if (!capability.canUseTabularParser) {
    return {
      supplierName,
      sourceFile: file.name,
      extractionStatus: capability.canUseOcrFallback ? "ocr-required" : "manual-review",
      detectedFormat: capability.detectedFormat,
      quotedItems: [],
      paymentTerms: "Nao lido",
      freightTerms: "Nao lido",
      quoteDate: null
    };
  }

  // Parser dedicado para PDF de orçamento do fornecedor
  if (file.name.toLowerCase().endsWith(".pdf")) {
    const lines = await extractTextLines(file);
    const quoteItems = parseSupplierQuotePdfLines(lines);
    if (quoteItems.length > 0) {
      return {
        supplierName,
        sourceFile: file.name,
        extractionStatus: "parsed",
        detectedFormat: "pdf",
        quotedItems: quoteItems,
        paymentTerms: extractPdfPaymentTerms(lines),
        freightTerms: "Nao informado",
        quoteDate: extractPdfQuoteDate(lines)
      };
    }
  }

  const table = await parseTabularFile(file);

  if (!table) {
    const inferredQuotes = inferSupplierQuoteRowsFromLines(await extractTextLines(file));
    return {
      supplierName,
      sourceFile: file.name,
      extractionStatus:
        inferredQuotes.length > 0 ? "parsed" : capability.canUseOcrFallback ? "ocr-required" : "manual-review",
      detectedFormat: capability.detectedFormat,
      quotedItems: inferredQuotes,
      paymentTerms: "Nao lido",
      freightTerms: "Nao lido",
      quoteDate: null
    };
  }

  const skuIndex = findHeaderIndex(table.headers, ["sku", "codigo", "codigo_produto", "item"]);
  const descriptionIndex = findHeaderIndex(table.headers, ["descricao", "produto", "item_descricao"]);
  const unitPriceIndex = findHeaderIndex(table.headers, [
    "preco_unitario",
    "preco_unit",
    "valor_unitario",
    "valor_unit",
    "unit_price"
  ]);
  const totalIndex = findHeaderIndex(table.headers, ["valor_total", "preco_total", "total"]);

  if ((skuIndex < 0 && descriptionIndex < 0) || unitPriceIndex < 0) {
    const inferredQuotes = inferSupplierQuoteRowsFromRows(table.rows, table.rawLines);
    return {
      supplierName,
      sourceFile: file.name,
      extractionStatus:
        inferredQuotes.length > 0 ? "parsed" : capability.canUseOcrFallback ? "ocr-required" : "manual-review",
      detectedFormat: capability.detectedFormat,
      quotedItems: inferredQuotes,
      paymentTerms: extractPaymentTerms(table),
      freightTerms: extractFreightTerms(table),
      quoteDate: extractQuoteDate(table)
    };
  }

  const quotedItems = table.rows
    .map((columns) => {
      const unitPrice = parseDecimal(columns[unitPriceIndex] ?? "");
      const totalValue = totalIndex >= 0 ? parseDecimal(columns[totalIndex] ?? "") : NaN;

      return {
        sku: columns[skuIndex] ?? "",
        description: columns[descriptionIndex] ?? "",
        unitPrice,
        totalValue: Number.isFinite(totalValue) && totalValue > 0 && isPlausibleTotalValue(totalValue) ? totalValue : null
      };
    })
    .filter(
      (item) =>
        (item.sku || item.description) &&
        Number.isFinite(item.unitPrice) &&
        item.unitPrice > 0 &&
        isPlausibleMoneyValue(item.unitPrice)
    );

  return {
    supplierName,
    sourceFile: file.name,
    extractionStatus: quotedItems.length > 0 ? "parsed" : capability.canUseOcrFallback ? "ocr-required" : "manual-review",
    detectedFormat: capability.detectedFormat,
    quotedItems,
    paymentTerms: extractPaymentTerms(table),
    freightTerms: extractFreightTerms(table),
    quoteDate: extractQuoteDate(table)
  };
}

async function parseTabularFile(file: UploadFileInput): Promise<ParsedTable | null> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const workbook = new ExcelJS.Workbook();
    const excelBuffer = file.buffer.buffer.slice(
      file.buffer.byteOffset,
      file.buffer.byteOffset + file.buffer.byteLength
    ) as Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(excelBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return null;
    }
    const rows: string[][] = [];
    worksheet.eachRow((row) => {
      const rowValues = Array.isArray(row.values) ? row.values : Object.values(row.values ?? {});
      const values = rowValues
        .slice(1)
        .map((cell) => String(cell ?? "").trim());
      if (values.some(Boolean)) {
        rows.push(values);
      }
    });

    if (rows.length < 2) {
      return null;
    }

    return {
      headers: rows[0],
      rows: rows.slice(1),
      rawLines: rows.map((row) => row.join("  "))
    };
  }

  if (lowerName.endsWith(".pdf")) {
    try {
      const parsed = await pdfParse(file.buffer);
      const lines = parsed.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        return null;
      }

      const rowCandidates = lines
        .map((line) => line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean))
        .filter((row) => row.length >= 3);

      if (rowCandidates.length < 2) {
        return null;
      }

      return {
        headers: rowCandidates[0],
        rows: rowCandidates.slice(1),
        rawLines: lines
      };
    } catch {
      return null;
    }
  }

  if (isStructuredTextFile(file.name, file.type)) {
    const lines = file.buffer
      .toString("utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return null;
    }

    return {
      headers: parseDelimitedLine(lines[0]),
      rows: lines.slice(1).map((line) => parseDelimitedLine(line)),
      rawLines: lines
    };
  }

  return null;
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function parseDelimitedLine(line: string): string[] {
  const delimiter = line.includes("\t") ? "\t" : line.includes(";") ? ";" : line.includes("|") ? "|" : ",";
  return line.split(delimiter).map((part) => part.trim());
}

function parseDecimal(value: string): number {
  const compact = value.trim().replace(/\s+/g, "");
  const hasComma = compact.includes(",");
  const hasDot = compact.includes(".");
  let normalized = compact;

  if (hasComma && hasDot) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = compact.replace(",", ".");
  }

  return Number(normalized);
}

function isPlausibleMoneyValue(value: number) {
  return Number.isFinite(value) && value > 0 && value <= 1_000_000;
}

function isPlausibleTotalValue(value: number | null) {
  return value === null || (Number.isFinite(value) && value > 0 && value <= 100_000_000);
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function getUploadsRoot() {
  const dataRoot = process.env.PEPA_DATA_DIR?.trim() || path.join(process.cwd(), "data");
  return path.join(dataRoot, "pepa-uploads");
}

function hasObjectStorageConfig() {
  return Boolean(
    process.env.PEPA_OBJECT_STORAGE_BUCKET &&
      process.env.PEPA_OBJECT_STORAGE_ACCESS_KEY_ID &&
      process.env.PEPA_OBJECT_STORAGE_SECRET_ACCESS_KEY
  );
}

let objectStorageClient: S3Client | null = null;

function getObjectStorageClient() {
  if (objectStorageClient) {
    return objectStorageClient;
  }

  const region = process.env.PEPA_OBJECT_STORAGE_REGION?.trim() || "sa-east-1";
  objectStorageClient = new S3Client({
    region,
    endpoint: process.env.PEPA_OBJECT_STORAGE_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.PEPA_OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.PEPA_OBJECT_STORAGE_ACCESS_KEY_ID?.trim() || "",
      secretAccessKey: process.env.PEPA_OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim() || ""
    }
  });
  return objectStorageClient;
}

async function persistUploadFile(tenantId: string, roundId: string, file: UploadFileInput): Promise<StoredUploadMeta> {
  const sanitizedName = sanitizeFileName(file.name);
  const relativeKey = `${tenantId}/${roundId}/${sanitizedName}`;

  if (hasObjectStorageConfig()) {
    const prefix = process.env.PEPA_OBJECT_STORAGE_PREFIX?.trim();
    const objectKey = prefix ? `${prefix.replace(/\/+$/, "")}/${relativeKey}` : relativeKey;
    await getObjectStorageClient().send(
      new PutObjectCommand({
        Bucket: process.env.PEPA_OBJECT_STORAGE_BUCKET,
        Key: objectKey,
        Body: file.buffer,
        ContentType: file.type || "application/octet-stream"
      })
    );

    if (process.env.PEPA_OBJECT_STORAGE_MIRROR_LOCAL === "true") {
      const roundDirectory = path.join(getUploadsRoot(), tenantId, roundId);
      await mkdir(roundDirectory, { recursive: true });
      await writeFile(path.join(roundDirectory, sanitizedName), file.buffer);
    }

    const publicBase = process.env.PEPA_OBJECT_STORAGE_PUBLIC_BASE_URL?.trim();
    const publicUrl = publicBase ? `${publicBase.replace(/\/+$/, "")}/${objectKey}` : null;

    return {
      storageProvider: "s3",
      storageKey: objectKey,
      storageUrl: publicUrl,
      fileName: sanitizedName
    };
  }

  const roundDirectory = path.join(getUploadsRoot(), tenantId, roundId);
  await mkdir(roundDirectory, { recursive: true });
  await writeFile(path.join(roundDirectory, sanitizedName), file.buffer);

  return {
    storageProvider: "local",
    storageKey: relativeKey,
    storageUrl: null,
    fileName: sanitizedName
  };
}

function describeStorage(meta: StoredUploadMeta | undefined) {
  if (!meta) {
    return "storage local";
  }

  return meta.storageProvider === "s3" ? "storage gerenciado" : "storage local";
}

function inferSupplierName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Fornecedor";
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isStructuredTextFile(fileName: string, mimeType: string) {
  const lowerName = fileName.toLowerCase();
  return (
    mimeType.startsWith("text/") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".tsv")
  );
}

function detectFileFormat(fileName: string): DetectedFileFormat {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return "csv";
  }
  if (lowerName.endsWith(".txt")) {
    return "txt";
  }
  if (lowerName.endsWith(".xlsx")) {
    return "xlsx";
  }
  if (lowerName.endsWith(".xls")) {
    return "xls";
  }
  if (lowerName.endsWith(".pdf")) {
    return "pdf";
  }
  return "other";
}

async function extractTextLines(file: UploadFileInput): Promise<string[]> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".pdf")) {
    try {
      const parsed = await pdfParse(file.buffer);
      return parsed.text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  if (isStructuredTextFile(file.name, file.type)) {
    return file.buffer
      .toString("utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return [];
}

// ─── Parser específico para PDF do Flex (COMPRA DE MERCADORIA) ────────────────
// Estrutura: 10 linhas por item após cada cabeçalho "Seq":
//   [0] seq  [1] código PEPA  [2] descrição  [3] un  [4] ref.fornecedor
//   [5] qtde  [6] prev.fat.   [7] vl.unit    [8] vl.total  [9] %ipi
function parseFlexOrderPdfLines(lines: string[]): RequestedItem[] {
  const items: RequestedItem[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i] === "Seq") {
      i += 10; // pula as 10 linhas do cabeçalho
      while (i + 9 < lines.length) {
        const seq = parseInt(lines[i] ?? "", 10);
        const pepaCode = (lines[i + 1] ?? "").trim();
        const description = (lines[i + 2] ?? "").trim();
        const unit = (lines[i + 3] ?? "").trim();
        const supplierRef = (lines[i + 4] ?? "").trim();
        const qty = parseInt(lines[i + 5] ?? "", 10);
        const vlUnitStr = (lines[i + 7] ?? "").trim();
        if (
          !isNaN(seq) && seq > 0 && seq <= 99 &&
          /^\d{5,6}$/.test(pepaCode) &&
          description.length > 0 &&
          /^\d{4,6}$/.test(supplierRef) &&
          !isNaN(qty) && qty > 0
        ) {
          const baseUnitPrice = parseDecimal(vlUnitStr);
          items.push({
            sku: pepaCode,
            description,
            unit: unit || "UN",
            requestedQuantity: qty,
            source: "real-supplier-quote",
            supplierRef,
            ...(Number.isFinite(baseUnitPrice) && baseUnitPrice > 0 ? { baseUnitPrice } : {})
          });
          i += 10;
        } else {
          break;
        }
      }
    } else {
      i++;
    }
  }
  return items;
}

// ─── Parser específico para PDF de orçamento do fornecedor ────────────────────
// Âncora: cada item tem um NCM de 8 dígitos na linha de dados.
// Linha NCM:  {seq}{cod}{descrição}{NCM8}{alq2%}${preçofinal}${ipi}
// Linha total: ${total} (pode estar colada com qtde+preço)
// Linha qtde:  {qtde}${preço}{ipi%}...
function parseSupplierQuotePdfLines(lines: string[]): SupplierQuoteRow[] {
  const items: SupplierQuoteRow[] = [];
  const ncmLineRegex = /(\d{8})[\d.]*\s*%[^$]*\$([\d,.]+)\$([\d,.]+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const ncmMatch = line.match(ncmLineRegex);
    if (!ncmMatch) continue;

    const finalUnitPrice = parseDecimal(ncmMatch[2]);
    const ncmStartPos = line.indexOf(ncmMatch[1]);
    const beforeNcm = line.substring(0, ncmStartPos);

    let cod = "";
    let description = "";

    // tenta extrair seq+cod+descrição da própria linha NCM
    const seqCodInline = beforeNcm.match(/^(\d{1,2})(\d{4,6})(.*)/);
    if (seqCodInline) {
      cod = seqCodInline[2];
      description = seqCodInline[3].trim();
    } else {
      // descrição está em linhas anteriores — busca para trás
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        const prev = (lines[j] ?? "").trim();
        if (!prev || prev.startsWith("$") || /^\d+\$/.test(prev)) break;
        const itemStart = prev.match(/^(\d{1,2})(\d{4,6})(.*)/);
        if (itemStart) {
          cod = itemStart[2];
          const descParts: string[] = [];
          const startDesc = itemStart[3].trim();
          if (startDesc) descParts.push(startDesc);
          for (let k = j + 1; k < i; k++) {
            const dl = (lines[k] ?? "").trim();
            if (dl) descParts.push(dl);
          }
          description = descParts.join(" ");
          break;
        }
        // linha é continuação de descrição — será capturada quando acharmos o itemStart
      }
    }

    if (!cod) continue;

    // extrai total + qtde + preço base das linhas seguintes
    const postData = extractSupplierPostNcmData(lines, i);
    if (!postData) continue;

    items.push({
      sku: cod,
      description: description || `Produto ${cod}`,
      unitPrice: postData.unitPrice,
      finalUnitPrice,
      totalValue: postData.total,
      quotedQuantity: postData.qty
    });
  }

  return items;
}

// Extrai total + qtde + preço da(s) linha(s) após a linha NCM.
// Nos PDFs do fornecedor os preços têm SEMPRE 4 casas decimais.
// Ex: "150$1.06009.75 %..." → qty=150, price=1.0600
// Ex: "$83.330412$6.60105.20 %..." → total=83.3304, qty=12, price=6.6010
function extractSupplierPostNcmData(
  lines: string[],
  ncmIdx: number
): { total: number; qty: number; unitPrice: number } | null {
  const nextLine = (lines[ncmIdx + 1] ?? "").trim();
  if (!nextLine.startsWith("$")) return null;

  // Caso mesclado: $TOTAL{qty}$price (total e preço com 4 casas decimais)
  const merged = nextLine.match(/^\$([\d,]+\.\d{4})(\d+)\$([\d]+\.\d{4})/);
  if (merged) {
    return {
      total: parseDecimal(merged[1]),
      qty: parseInt(merged[2], 10),
      unitPrice: parseDecimal(merged[3])
    };
  }

  // Caso separado: $TOTAL na linha, depois {qty}$price na próxima
  const totalMatch = nextLine.match(/^\$([\d,]+\.\d{2,4})/);
  if (!totalMatch) return null;
  const total = parseDecimal(totalMatch[1]);

  const qtyLine = (lines[ncmIdx + 2] ?? "").trim();
  // Preço sempre com 4 casas decimais — para de forma precisa
  const qtyMatch = qtyLine.match(/^(\d+)\$([\d]+\.\d{4})/);
  if (!qtyMatch) return null;

  return {
    total,
    qty: parseInt(qtyMatch[1], 10),
    unitPrice: parseDecimal(qtyMatch[2])
  };
}

// Extrai prazo de pagamento de linhas do PDF
function extractPdfPaymentTerms(lines: string[]): string {
  for (let i = 0; i < lines.length; i++) {
    if (/prazo/i.test(lines[i] ?? "")) {
      const next = (lines[i + 1] ?? "").trim();
      if (/\d/.test(next)) return next;
    }
    const condMatch = (lines[i] ?? "").match(/Condi[çc][aã]o\s+Pgto:\s*(.+)/i);
    if (condMatch) return condMatch[1].trim();
  }
  return "Aguardando parser comercial";
}

// Extrai data da cotação do PDF do fornecedor
function extractPdfQuoteDate(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (m) return m[1];
  }
  return null;
}

function inferRequestedItemsFromRows(rows: string[][], rawLines: string[]): RequestedItem[] {
  const inferredFromRows = rows
    .map((row) => inferRequestedItemFromColumns(row))
    .filter((item): item is RequestedItem => item !== null);

  if (inferredFromRows.length > 0) {
    return dedupeRequestedItems(inferredFromRows);
  }

  return inferRequestedItemsFromLines(rawLines);
}

function inferRequestedItemsFromLines(lines: string[]): RequestedItem[] {
  return dedupeRequestedItems(
    lines
      .map((line) => inferRequestedItemFromLine(line))
      .filter((item): item is RequestedItem => item !== null)
  );
}

function inferRequestedItemFromColumns(columns: string[]): RequestedItem | null {
  const cleaned = columns.map((value) => value.trim()).filter(Boolean);
  if (cleaned.length < 3) {
    return null;
  }

  const sku = cleaned[0] ?? "";
  const quantity = parseDecimal(cleaned[cleaned.length - 1] ?? "");
  if (!sku || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  const possibleUnit = cleaned[cleaned.length - 2] ?? "";
  const hasUnit = isLikelyUnit(possibleUnit);
  const description = cleaned.slice(1, hasUnit ? -2 : -1).join(" ").trim();
  if (!description || looksLikeHeader(`${sku} ${description}`)) {
    return null;
  }

  return {
    sku,
    description,
    unit: hasUnit ? possibleUnit : "UN",
    requestedQuantity: quantity,
    source: "inferred-from-quote"
  };
}

function inferRequestedItemFromLine(line: string): RequestedItem | null {
  const compact = line.replace(/\s+/g, " ").trim();
  if (!compact || looksLikeHeader(compact)) {
    return null;
  }

  const quantityMatch = compact.match(/(\d+(?:[.,]\d+)?)$/);
  if (!quantityMatch?.index) {
    return null;
  }

  const quantity = parseDecimal(quantityMatch[1]);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  const prefix = compact.slice(0, quantityMatch.index).trim();
  const skuMatch = prefix.match(/^([A-Za-z0-9./_-]{3,})\s+(.+)$/);
  if (!skuMatch) {
    return null;
  }

  let unit = "UN";
  let description = skuMatch[2].trim();
  const unitMatch = description.match(/^(.*)\s+(UN|UND|UNID|ROLO|RL|M|MT|PCA|PC|KIT|CJ|CX)$/i);
  if (unitMatch) {
    description = unitMatch[1].trim();
    unit = unitMatch[2].trim().toUpperCase();
  }

  if (!description) {
    return null;
  }

  return {
    sku: skuMatch[1],
    description,
    unit,
    requestedQuantity: quantity,
    source: "inferred-from-quote"
  };
}

function inferSupplierQuoteRowsFromRows(rows: string[][], rawLines: string[]): SupplierQuoteRow[] {
  const inferredFromRows = rows
    .map((row) => inferSupplierQuoteRowFromColumns(row))
    .filter((item): item is SupplierQuoteRow => item !== null);

  if (inferredFromRows.length > 0) {
    return dedupeSupplierQuoteRows(inferredFromRows);
  }

  return inferSupplierQuoteRowsFromLines(rawLines);
}

function inferSupplierQuoteRowsFromLines(lines: string[]): SupplierQuoteRow[] {
  return dedupeSupplierQuoteRows(
    lines
      .map((line) => inferSupplierQuoteRowFromLine(line))
      .filter((item): item is SupplierQuoteRow => item !== null)
  );
}

function inferSupplierQuoteRowFromColumns(columns: string[]): SupplierQuoteRow | null {
  const cleaned = columns.map((value) => value.trim()).filter(Boolean);
  if (cleaned.length < 3) {
    return null;
  }

  const sku = cleaned[0] ?? "";
  if (!sku || looksLikeHeader(cleaned.join(" "))) {
    return null;
  }

  const numericPositions = cleaned
    .map((value, index) => ({ index, value: parseDecimal(value) }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0 && isPlausibleMoneyValue(entry.value));

  if (numericPositions.length === 0) {
    return null;
  }

  const totalCandidate = numericPositions[numericPositions.length - 1];
  const unitCandidate = numericPositions.length > 1 ? numericPositions[numericPositions.length - 2] : totalCandidate;
  const description = cleaned.slice(1, unitCandidate.index).join(" ").trim();
  if (!description) {
    return null;
  }

  const totalValue =
    numericPositions.length > 1 && totalCandidate.index > unitCandidate.index ? totalCandidate.value : null;

  if (!isPlausibleMoneyValue(unitCandidate.value) || !isPlausibleTotalValue(totalValue)) {
    return null;
  }

  return {
    sku,
    description,
    unitPrice: unitCandidate.value,
    totalValue
  };
}

function inferSupplierQuoteRowFromLine(line: string): SupplierQuoteRow | null {
  const compact = line.replace(/\s+/g, " ").trim();
  if (!compact || looksLikeHeader(compact)) {
    return null;
  }

  const skuMatch = compact.match(/^([A-Za-z0-9./_-]{3,})\s+(.+)$/);
  if (!skuMatch) {
    return null;
  }

  const remainder = skuMatch[2].trim();
  const numericMatches = Array.from(remainder.matchAll(/(\d[\d.,]*)/g));
  const plausibleMoneyMatches = numericMatches
    .map((match) => ({
      match,
      parsed: parseDecimal(match[1])
    }))
    .filter((entry) => Number.isFinite(entry.parsed) && entry.parsed > 0 && isPlausibleMoneyValue(entry.parsed));

  if (plausibleMoneyMatches.length === 0) {
    return null;
  }

  const totalCandidate = plausibleMoneyMatches[plausibleMoneyMatches.length - 1]?.match;
  const unitCandidate =
    plausibleMoneyMatches.length > 1 ? plausibleMoneyMatches[plausibleMoneyMatches.length - 2]?.match : totalCandidate;
  if (!totalCandidate || !unitCandidate) {
    return null;
  }
  const description = remainder.slice(0, unitCandidate.index).trim();
  if (!description) {
    return null;
  }

  const unitPrice = parseDecimal(unitCandidate[1]);
  const totalValue =
    numericMatches.length > 1 && typeof totalCandidate.index === "number" && totalCandidate.index > (unitCandidate.index ?? 0)
      ? parseDecimal(totalCandidate[1])
      : null;

  if (!Number.isFinite(unitPrice) || unitPrice <= 0 || !isPlausibleMoneyValue(unitPrice) || !isPlausibleTotalValue(totalValue)) {
    return null;
  }

  return {
    sku: skuMatch[1],
    description,
    unitPrice,
    totalValue: Number.isFinite(totalValue ?? NaN) && (totalValue ?? 0) > 0 ? totalValue : null
  };
}

function dedupeRequestedItems(items: RequestedItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${normalizeComparable(item.sku)}::${normalizeComparable(item.description)}`;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeSupplierQuoteRows(rows: SupplierQuoteRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${normalizeComparable(row.sku)}::${normalizeComparable(row.description)}`;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function looksLikeHeader(value: string) {
  if (/^sku[-_.]?\d+/i.test(value.trim())) {
    return false;
  }

  const normalizedTokens = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const headerTokens = new Set(["sku", "descricao", "quantidade", "qtd", "qtde", "preco", "valor", "unitario", "total"]);
  const matchedHeaderTokens = normalizedTokens.filter((token) => headerTokens.has(token)).length;
  return matchedHeaderTokens >= 2;
}

function isLikelyUnit(value: string) {
  return /^(UN|UND|UNID|ROLO|RL|M|MT|PCA|PC|KIT|CJ|CX)$/i.test(value.trim());
}

function classifyUploadFile(file: UploadFileInput): FileCapability {
  const detectedFormat = detectFileFormat(file.name);
  if (detectedFormat === "csv" || detectedFormat === "txt" || detectedFormat === "xlsx" || detectedFormat === "xls") {
    return {
      detectedFormat,
      canUseTabularParser: true,
      canUseOcrFallback: false,
      recommendedProcessingMode: "immediate-comparison"
    };
  }

  if (detectedFormat === "pdf") {
    return {
      detectedFormat,
      canUseTabularParser: true,
      canUseOcrFallback: true,
      recommendedProcessingMode: "ocr-queue"
    };
  }

  return {
    detectedFormat,
    canUseTabularParser: false,
    canUseOcrFallback: false,
    recommendedProcessingMode: "stored-for-review"
  };
}

function quoteMatchesItem(quote: SupplierQuoteRow, item: RequestedItem) {
  // Chave primária: Ref.Fornecedor (Flex) = COD (fornecedor)
  if (item.supplierRef) {
    const quoteRef = normalizeComparable(quote.sku);
    const itemRef = normalizeComparable(item.supplierRef);
    if (quoteRef && itemRef && quoteRef === itemRef) return true;
  }

  // Fallback: SKU direto
  const quoteSku = normalizeComparable(quote.sku);
  const itemSku = normalizeComparable(item.sku);
  if (quoteSku && itemSku && quoteSku === itemSku) return true;

  // Fallback: descrição
  const quoteDescription = normalizeComparable(quote.description);
  const itemDescription = normalizeComparable(item.description);
  return Boolean(quoteDescription && itemDescription && quoteDescription === itemDescription);
}

function normalizeComparable(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function recalculateSnapshot(snapshot: PepaSnapshot): PepaSnapshot {
  const suppliers = snapshot.suppliers.map((supplier) => {
    const matchedRows = snapshot.comparisonRows.filter((row) => row.bestSupplier === supplier.supplierName);
    const totalValue = matchedRows.reduce((total, row) => total + (row.bestTotal ?? 0), 0);
    const averageUnitPrice =
      matchedRows.length > 0
        ? roundCurrency(
            matchedRows.reduce((total, row) => total + (row.bestUnitPrice ?? 0), 0) / matchedRows.length
          )
        : null;

    return {
      ...supplier,
      coverageCount: matchedRows.length,
      totalValue: matchedRows.length > 0 ? roundCurrency(totalValue) : null,
      averageUnitPrice
    };
  });

  const quotedItems = snapshot.comparisonRows.filter((row) => row.itemStatus === "quoted").length;
  const quotedValue = roundCurrency(
    snapshot.comparisonRows.reduce((total, row) => total + (row.bestTotal ?? 0), 0)
  );

  return {
    ...snapshot,
    latestRound: snapshot.latestRound
      ? {
          ...snapshot.latestRound,
          attachmentsReceived: snapshot.totals.attachmentsReceived,
          quotedItems,
          coverageRate:
            snapshot.totals.requestedItems === 0
              ? 0
              : Math.round((quotedItems / snapshot.totals.requestedItems) * 100),
          status: snapshot.latestRound.status ?? "open"
        }
      : null,
    suppliers,
    diagnostics: snapshot.diagnostics,
    totals: {
      ...snapshot.totals,
      quotedItems,
      coverageRate:
        snapshot.totals.requestedItems === 0
          ? 0
          : Math.round((quotedItems / snapshot.totals.requestedItems) * 100),
      quotedValue
    }
  };
}

function buildDiagnostics(
  supplierFiles: ParsedSupplierFile[],
  mirrorCapability: FileCapability,
  requestedItemsCount: number,
  attachments: PepaAttachment[]
) {
  const parsedSuppliers = supplierFiles.filter((file) => file.extractionStatus === "parsed").length;
  const ocrSuppliers = supplierFiles.filter((file) => file.extractionStatus === "ocr-required").length;
  const manualReviewSuppliers = supplierFiles.filter((file) => file.extractionStatus === "manual-review").length;
  const commercialTermsDetected = supplierFiles.filter(
    (file) =>
      file.paymentTerms !== "Nao lido" &&
      file.paymentTerms !== "Aguardando parser comercial" &&
      file.freightTerms !== "Nao lido" &&
      file.freightTerms !== "Aguardando parser comercial"
  ).length;
  const warnings: string[] = [];

  if (ocrSuppliers > 0) {
    warnings.push(`${ocrSuppliers} anexo(s) ainda dependem de OCR ou parser adicional.`);
  }

  if (manualReviewSuppliers > 0) {
    warnings.push(`${manualReviewSuppliers} anexo(s) ficaram salvos apenas para revisao manual porque o formato ainda nao entra no parser nem na fila OCR atual.`);
  }

  if (commercialTermsDetected < supplierFiles.length) {
    warnings.push("Nem todos os fornecedores trouxeram condicoes comerciais completas na leitura atual.");
  }

  if (requestedItemsCount === 0) {
    if (mirrorCapability.detectedFormat === "pdf") {
      warnings.push("O arquivo-base em PDF foi salvo, mas ainda nao trouxe estrutura suficiente para montar comparativo imediato.");
    } else if (mirrorCapability.recommendedProcessingMode === "stored-for-review") {
      warnings.push("O arquivo-base foi salvo apenas para revisao manual porque este formato ainda nao gera comparativo imediato.");
    } else {
      warnings.push("O arquivo-base foi lido, mas nao trouxe colunas minimas de SKU, descricao e quantidade para gerar o comparativo.");
    }
  }

  const storedForReviewAttachments = attachments.filter((attachment) => attachment.processingMode === "stored-for-review").length;

  return {
    parsedSuppliers,
    ocrSuppliers,
    manualReviewSuppliers,
    commercialTermsDetected,
    mirrorStructured: requestedItemsCount > 0,
    mirrorFormat: mirrorCapability.detectedFormat,
    storedForReviewAttachments,
    warnings
  };
}

function extractPaymentTerms(table: ParsedTable) {
  const direct = extractValueFromHeaders(table, ["pagamento", "condicao_pagamento", "prazo_pagamento"]);
  if (direct) {
    return direct;
  }

  const labelBased = extractValueAfterKeyword(table, ["pagamento", "prazo", "condicao"]);
  return labelBased ?? "Aguardando parser comercial";
}

function extractFreightTerms(table: ParsedTable) {
  const direct = extractValueFromHeaders(table, ["frete", "tipo_frete", "condicao_frete"]);
  if (direct) {
    return direct;
  }

  const labelBased = extractValueAfterKeyword(table, ["frete", "cif", "fob"]);
  return labelBased ?? "Aguardando parser comercial";
}

function extractQuoteDate(table: ParsedTable) {
  const direct = extractValueFromHeaders(table, ["data", "data_cotacao", "emissao"]);
  const candidate = direct ?? extractValueAfterKeyword(table, ["data", "emissao", "cotacao"]);
  if (!candidate) {
    return null;
  }

  const normalized = normalizeDate(candidate);
  return normalized;
}

function extractValueFromHeaders(table: ParsedTable, aliases: string[]) {
  const index = findHeaderIndex(table.headers, aliases);
  if (index < 0) {
    return null;
  }

  const value = table.rows.find((row) => (row[index] ?? "").trim())?.[index]?.trim() ?? "";
  return value || null;
}

function extractValueAfterKeyword(table: ParsedTable, keywords: string[]) {
  const allCells = [table.headers, ...table.rows];

  for (const row of allCells) {
    for (let index = 0; index < row.length; index += 1) {
      const current = row[index] ?? "";
      const normalized = normalizeHeader(current);
      if (keywords.some((keyword) => normalized.includes(keyword))) {
        const next = row[index + 1]?.trim();
        if (next) {
          return next;
        }

        const currentText = current.trim();
        const separatorMatch = currentText.match(/[:\-]\s*(.+)$/);
        if (separatorMatch?.[1]) {
          return separatorMatch[1].trim();
        }
      }
    }
  }

  return null;
}

function normalizeDate(value: string) {
  const isoMatch = value.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const brMatch = value.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }

  return null;
}

function createAuditEvent(
  type: PepaAuditEvent["type"],
  title: string,
  description: string
): PepaAuditEvent {
  return {
    id: randomUUID(),
    type,
    title,
    description,
    occurredAt: new Date().toISOString()
  };
}
