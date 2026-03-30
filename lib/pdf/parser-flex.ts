// lib/pdf/parser-flex.ts
import type { ExtractedPdfItem } from "./types";
import { parseDecimal, isLikelyUnit } from "./parse-helpers";

const DATE_RE = /\b(\d{2}\/\d{2}\/\d{4})\b/;
const UNIT_RE = /^(MT|RL|UN|UND|UNID|PC|PCA|M|L|KG|CX|KIT|CJ|GR|JG|TON|R|U)$/i;

/**
 * Parse a quantity token that may use Brazilian thousands separator (dot-only).
 * "1.500" → 1500, "1.500,5" → handled by parseDecimal, "20" → 20
 */
function parseQuantity(raw: string): number {
  // If dot-only (no comma) and dot is followed by exactly 3 digits at end → thousands separator
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    return parseFloat(raw.replace(/\./g, ""));
  }
  return parseDecimal(raw);
}

/**
 * Parse PDF lines from PEPA Flex system (COMPRA DE MERCADORIA / RETORNO ORCAMENTO).
 * The date (DD/MM/YYYY) is the reliable anchor separating description from prices.
 */
export function parseFlexPdf(lines: string[]): ExtractedPdfItem[] {
  // Always try merge first — Flex PDFs often split items across multiple lines.
  // Merging never hurts single-line items (they pass through unchanged).
  const mergedLines = mergeMultiLineItems(lines);
  const mergedItems = parseFlexLineMode(mergedLines);
  if (mergedItems.length > 0) return mergedItems;

  // Try raw lines without merge (single-line format)
  const lineItems = parseFlexLineMode(lines);
  if (lineItems.length > 0) return lineItems;

  // Try with OCR-cleaned lines + merge
  const cleanedLines = lines.map(cleanOcrLine);
  const cleanedMerged = mergeMultiLineItems(cleanedLines);
  const ocrLineItems = parseFlexLineMode(cleanedMerged);
  if (ocrLineItems.length > 0) return ocrLineItems;

  // Fallback: cell-mode (one value per line, blocks of 10)
  return parseFlexCellMode(lines);
}

/**
 * Merge multi-line Flex items into single lines.
 * Some Flex PDFs split items across 2-3 lines:
 *   Line 1: "20 5574"  or  "20 5574 BOBINA CABO FLEXIVEL..."
 *   Line 2: "BOBINA CABO FLEXIVEL HEPR 1KV..."  (continuation)
 *   Line 3: "WB1025E-VD MT 1.000 05/03/2026 7,18 7180.00 0.00"  (ref + data)
 *
 * Strategy: accumulate lines until we find one containing a date (DD/MM/YYYY),
 * which marks the end of an item. Then emit the merged line.
 */
function mergeMultiLineItems(lines: string[]): string[] {
  const result: string[] = [];
  let buffer: string[] = [];
  let inItemBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this line starts a new item (seq + sku)
    const startsWithSeq = /^\d{1,3}\s+\d{1,6}\b/.test(trimmed);
    // Check if this line contains a date (marks end of item data)
    const hasDate = DATE_RE.test(trimmed);

    if (startsWithSeq) {
      // If we had a previous buffer without a date, flush it as-is
      if (buffer.length > 0) {
        result.push(buffer.join(" "));
      }
      buffer = [trimmed];
      inItemBlock = true;

      if (hasDate) {
        // Complete item on single line
        result.push(buffer.join(" "));
        buffer = [];
        inItemBlock = false;
      }
    } else if (inItemBlock) {
      buffer.push(trimmed);
      if (hasDate) {
        // Date found — this completes the item
        result.push(buffer.join(" "));
        buffer = [];
        inItemBlock = false;
      }
    } else {
      // Not in an item block, pass through (headers, metadata, etc.)
      result.push(trimmed);
    }
  }

  // Flush remaining buffer
  if (buffer.length > 0) {
    result.push(buffer.join(" "));
  }

  return result;
}

/**
 * Clean OCR artifacts from table-based PDFs.
 * Tesseract reads table borders as | ] [ ! characters.
 * Example: "1 | 5559 BOBINA CABO... WB1025E-AZ | MT] 1.500 05/03/2026! 7,18 /10770.00|0.00"
 * Becomes: "1  5559 BOBINA CABO... WB1025E-AZ  MT  1.500 05/03/2026  7,18  10770.00 0.00"
 */
function cleanOcrLine(line: string): string {
  return line
    .replace(/[|[\]()!]/g, " ")     // Remove table border chars and OCR parens
    .replace(/(\d{2})\/(\d{2})\/(\d{4})/g, "$1~$2~$3") // Protect dates from / removal
    .replace(/\/(\d)/g, " $1")      // "/10770" → " 10770"
    .replace(/~/g, "/")             // Restore dates
    .replace(/\bIMT\b/gi, " MT ")   // OCR reads "IMT" or "IMTI" instead of "MT"
    .replace(/\bIMTI\b/gi, " MT ")
    .replace(/\bMTI\b/gi, " MT ")
    .replace(/\b1(\d{2}\/\d{2}\/\d{4})\b/g, " $1") // "105/03/2026" → " 05/03/2026"
    .replace(/(\d{2}\/\d{2}\/\d{4})[lLI]/g, "$1 ")  // "2026l" → "2026 " (OCR artifact)
    .replace(/\s+/g, " ")           // Collapse multiple spaces
    .trim();
}

function parseFlexLineMode(lines: string[]): ExtractedPdfItem[] {
  const items: ExtractedPdfItem[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();

    // Line must start with: seq (1-3 digits) + space + PEPA code (1-6 digits)
    // OCR sometimes merges seq numbers (e.g., "18" from "1" + next line's "8")
    // so we also try matching with a longer seq prefix
    const seqCodeMatch = trimmed.match(/^(\d{1,3})\s+(\d{1,6})\s+/);
    if (!seqCodeMatch) continue;

    const seq = parseInt(seqCodeMatch[1], 10);
    if (seq <= 0) continue;
    const sku = seqCodeMatch[2];
    // Skip if SKU is too short (likely OCR noise)
    if (sku.length < 1) continue;

    const rest = trimmed.slice(seqCodeMatch[0].length);

    // Date (Prev.Fat.) is the reliable anchor
    const dateMatch = rest.match(DATE_RE);
    if (!dateMatch) continue;

    const dateIdx = rest.indexOf(dateMatch[1]);
    const beforeDate = rest.slice(0, dateIdx).trim();
    const afterDate = rest.slice(dateIdx + dateMatch[1].length).trim();

    // Extract prices after date: vl.unit, vl.total, %ipi
    const priceTokens = afterDate.split(/\s+/).filter(Boolean);
    const unitPrice = priceTokens.length > 0 ? parseDecimal(priceTokens[0]) : NaN;
    const totalValue = priceTokens.length > 1 ? parseDecimal(priceTokens[1]) : NaN;
    const ipiPercent = priceTokens.length > 2 ? parseDecimal(priceTokens[2]) : NaN;

    // Parse before date: {description} {ref.forn} {unit} {qty}
    const tokens = beforeDate.split(/\s+/);
    if (tokens.length < 3) continue;

    const qtyStr = tokens[tokens.length - 1] ?? "";
    const qty = parseQuantity(qtyStr);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const unitCandidate = tokens[tokens.length - 2] ?? "";
    const isUnit = UNIT_RE.test(unitCandidate);
    const unit = isUnit ? unitCandidate.toUpperCase() : "UN";
    const endIdx = isUnit ? tokens.length - 2 : tokens.length - 1;

    // Token before unit = supplier reference (alphanumeric, not pure digits)
    const refCandidate = tokens[endIdx - 1] ?? "";
    const isRef = refCandidate.length >= 2 &&
      /^[A-Z0-9][A-Z0-9._-]*$/i.test(refCandidate) &&
      !/^\d+$/.test(refCandidate);
    const supplierRef = isRef ? refCandidate : undefined;
    const descEnd = isRef ? endIdx - 1 : endIdx;

    const description = tokens.slice(0, descEnd).join(" ").trim();
    if (!description || description.length < 3) continue;

    const key = `${sku}-${description}`;
    if (!seen.has(key)) {
      seen.add(key);
      items.push({
        sku,
        description,
        unit,
        quantity: qty,
        unitPrice: Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0,
        totalValue: Number.isFinite(totalValue) && totalValue > 0 ? totalValue : null,
        ipiPercent: Number.isFinite(ipiPercent) ? ipiPercent : null,
        ...(supplierRef ? { supplierRef } : {})
      });
    }
  }

  return items;
}

/**
 * Cell-mode parser for Flex PDFs where pdf-parse extracts one cell per line.
 * Looks for "Seq" header, then reads blocks of 10 lines per item.
 * Block format: [seq, codigo, descricao, un, ref.forn, qtde, prev.fat, vl.unit, vl.total, %ipi]
 */
function parseFlexCellMode(lines: string[]): ExtractedPdfItem[] {
  const items: ExtractedPdfItem[] = [];
  let i = 0;

  // Find the first "Seq" header line
  while (i < lines.length) {
    if (/^Seq$/i.test(lines[i]?.trim() ?? "")) {
      i++;
      while (i < lines.length && !/^\d+$/.test(lines[i]?.trim() ?? "")) i++;
      break;
    }
    i++;
  }

  // Read blocks of 10 lines per item, handling page breaks with repeated headers
  while (i < lines.length) {
    // Skip repeated page headers (Seq, Código, Descrição, etc.)
    if (/^Seq$/i.test(lines[i]?.trim() ?? "")) {
      i++;
      while (i < lines.length && !/^\d+$/.test(lines[i]?.trim() ?? "")) i++;
      continue;
    }

    // Skip non-data lines (footers, totals, metadata)
    if (/^(Aten[çc][aã]o|Valor|Forma|Observa|Condi[çc][aã]o|Peso|COMPRADOR|R\$)/i.test(lines[i]?.trim() ?? "")) {
      i++;
      continue;
    }

    if (i + 9 >= lines.length) break;

    const seq = parseInt(lines[i]?.trim() ?? "", 10);
    const sku = (lines[i + 1] ?? "").trim();
    const description = (lines[i + 2] ?? "").trim();
    const unit = (lines[i + 3] ?? "").trim().toUpperCase() || "UN";
    const supplierRef = (lines[i + 4] ?? "").trim();
    const qtyStr = (lines[i + 5] ?? "").trim();
    // lines[i + 6] = Prev.Fat (date, skip)
    const unitPriceStr = (lines[i + 7] ?? "").trim();
    const totalStr = (lines[i + 8] ?? "").trim();
    const ipiStr = (lines[i + 9] ?? "").trim();

    const quantity = parseQuantity(qtyStr);
    const unitPrice = parseDecimal(unitPriceStr);
    const totalValue = parseDecimal(totalStr);
    const ipiPercent = parseDecimal(ipiStr);

    if (
      !isNaN(seq) && seq > 0 &&
      sku.length >= 1 &&
      description.length > 0 &&
      Number.isFinite(quantity) && quantity > 0
    ) {
      items.push({
        sku,
        description,
        unit,
        quantity,
        unitPrice: Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0,
        totalValue: Number.isFinite(totalValue) && totalValue > 0 ? totalValue : null,
        ipiPercent: Number.isFinite(ipiPercent) ? ipiPercent : null,
        ...(supplierRef.length > 0 ? { supplierRef } : {})
      });
      i += 10;
    } else {
      i++; // Skip unrecognized line and try next
    }
  }

  return items;
}
