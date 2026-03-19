import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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
};

type SupplierQuoteRow = {
  sku: string;
  description: string;
  unitPrice: number;
  totalValue: number | null;
};

type ParsedSupplierFile = {
  supplierName: string;
  sourceFile: string;
  extractionStatus: "parsed" | "ocr-required";
  quotedItems: SupplierQuoteRow[];
  paymentTerms: string;
  freightTerms: string;
  quoteDate: string | null;
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

    return {
      ...row,
      bestSupplier: chosenOffer.supplierName,
      bestUnitPrice:
        typeof params.unitPrice === "number" && params.unitPrice > 0 ? params.unitPrice : chosenOffer.unitPrice,
      bestTotal: roundCurrency(
        row.requestedQuantity *
          (typeof params.unitPrice === "number" && params.unitPrice > 0 ? params.unitPrice : chosenOffer.unitPrice)
      ),
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
  const roundDirectory = path.join(getUploadsRoot(), params.tenantId, roundId);
  await mkdir(roundDirectory, { recursive: true });

  await writeFile(path.join(roundDirectory, sanitizeFileName(params.mirrorFile.name)), params.mirrorFile.buffer);
  for (const supplierFile of params.supplierFiles) {
    await writeFile(path.join(roundDirectory, sanitizeFileName(supplierFile.name)), supplierFile.buffer);
  }

  const requestedItems = await extractRequestedItemsFromMirror(params.mirrorFile);
  const parsedSupplierFiles = await Promise.all(params.supplierFiles.map(parseSupplierFile));
  const attachments = buildAttachments(params.mirrorFile, parsedSupplierFiles, requestedItems.length);
  const comparisonRows = buildComparisonRows(requestedItems, parsedSupplierFiles);
  const suppliers = buildSuppliers(parsedSupplierFiles, comparisonRows);
  const quotedItems = comparisonRows.filter((row) => row.itemStatus === "quoted").length;
  const quotedValue = roundCurrency(
    comparisonRows.reduce((total, row) => total + (row.bestTotal ?? 0), 0)
  );

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
    diagnostics: buildDiagnostics(parsedSupplierFiles),
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
  requestedItemsCount: number
): PepaAttachment[] {
  const mirrorParsed = requestedItemsCount > 0;
  const mirrorAttachment: PepaAttachment = {
    fileName: mirrorFile.name,
    role: "mirror",
    supplierName: null,
    extractionStatus: mirrorParsed ? "parsed" : "template-pending",
    notes: mirrorParsed
      ? `Arquivo-base salvo e lido com ${requestedItemsCount} item(ns) estruturado(s) para o comparativo.`
      : "Arquivo-base salvo, mas sem colunas suficientes para estruturar os itens automaticamente."
  };

  const supplierAttachments = supplierFiles.map<PepaAttachment>((file) => {
    const parsed = file.extractionStatus === "parsed";
    return {
      fileName: file.sourceFile,
      role: "supplier-quote",
      supplierName: file.supplierName,
      extractionStatus: parsed ? "parsed" : "ocr-required",
      notes: parsed
        ? `Arquivo salvo com sucesso. ${file.quotedItems.length} item(ns) de cotacao foram reconhecidos para reconciliacao automatica.`
        : "Arquivo salvo e encaminhado para fila OCR antes da reconciliacao automatica dos itens."
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
      extractionStatus: parsed ? "parsed" : "ocr-required",
      paymentTerms: file.paymentTerms,
      freightTerms: file.freightTerms,
      quoteDate: file.quoteDate,
      coverageCount: matchedRows.length,
      quotedItemsCount: file.quotedItems.length,
      totalValue: matchedRows.length > 0 ? roundCurrency(totalValue) : null,
      averageUnitPrice,
      notes: parsed
        ? `Arquivo estruturado recebido e reconciliado com ${matchedRows.length} item(ns) do espelho.`
        : "Arquivo recebido, mas ainda depende de OCR ou parser especifico para entrar no ranking."
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
      totalValue: quote.totalValue
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
      source: item.source
      ,
      offers,
      selectionMode: "automatic"
    };
  });
}

async function extractRequestedItemsFromMirror(file: UploadFileInput): Promise<RequestedItem[]> {
  const table = await parseTabularFile(file);
  if (!table || table.rows.length === 0) {
    return [];
  }

  const skuIndex = findHeaderIndex(table.headers, ["sku", "codigo", "codigo_produto", "item"]);
  const descriptionIndex = findHeaderIndex(table.headers, ["descricao", "produto", "item_descricao"]);
  const unitIndex = findHeaderIndex(table.headers, ["unidade", "un", "und"]);
  const quantityIndex = findHeaderIndex(table.headers, ["quantidade", "qtd", "qtde"]);

  if (skuIndex < 0 || descriptionIndex < 0 || quantityIndex < 0) {
    return [];
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
  const table = await parseTabularFile(file);

  if (!table || table.rows.length === 0) {
    return {
      supplierName,
      sourceFile: file.name,
      extractionStatus: "ocr-required",
      quotedItems: [],
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
    return {
      supplierName,
      sourceFile: file.name,
      extractionStatus: "ocr-required",
      quotedItems: [],
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
        totalValue: Number.isFinite(totalValue) && totalValue > 0 ? totalValue : null
      };
    })
    .filter((item) => (item.sku || item.description) && Number.isFinite(item.unitPrice) && item.unitPrice > 0);

  return {
    supplierName,
    sourceFile: file.name,
    extractionStatus: quotedItems.length > 0 ? "parsed" : "ocr-required",
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
      rows: rows.slice(1)
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
        rows: rowCandidates.slice(1)
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
      rows: lines.slice(1).map((line) => parseDelimitedLine(line))
    };
  }

  return null;
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function parseDelimitedLine(line: string): string[] {
  const delimiter = line.includes(";") ? ";" : ",";
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
    lowerName.endsWith(".txt")
  );
}

function quoteMatchesItem(quote: SupplierQuoteRow, item: RequestedItem) {
  const quoteSku = normalizeComparable(quote.sku);
  const itemSku = normalizeComparable(item.sku);
  if (quoteSku && itemSku && quoteSku === itemSku) {
    return true;
  }

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

function buildDiagnostics(supplierFiles: ParsedSupplierFile[]) {
  const parsedSuppliers = supplierFiles.filter((file) => file.extractionStatus === "parsed").length;
  const ocrSuppliers = supplierFiles.filter((file) => file.extractionStatus === "ocr-required").length;
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

  if (commercialTermsDetected < supplierFiles.length) {
    warnings.push("Nem todos os fornecedores trouxeram condicoes comerciais completas na leitura atual.");
  }

  return {
    parsedSuppliers,
    ocrSuppliers,
    commercialTermsDetected,
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
