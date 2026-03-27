// lib/pdf/parser-generic.ts
import type { ExtractedPdfItem } from "./types";
import {
  parseDecimal,
  isLikelyUnit,
  looksLikeHeader,
  looksLikeAddressOrMeta,
  findBrazilianDecimals,
  isPlausibleMoneyValue,
} from "./parse-helpers";

/** Footer / summary lines to skip */
const SKIP_PREFIXES = [
  "valor do produto",
  "valor total",
  "total geral",
  "frete",
  "peso",
  "observa",
  "notas",
  "transportadora",
  "aten",
  "prezad",
  "valid",
  "aprovo",
];

function shouldSkipLine(line: string): boolean {
  const lower = line.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!lower) return true;
  if (looksLikeAddressOrMeta(lower)) return true;
  for (const prefix of SKIP_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Parse Brazilian quantity with thousands sep: "1.500,00" → 1500, "8,00" → 8
 */
function parseQuantity(raw: string): number {
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    return parseFloat(raw.replace(/\./g, ""));
  }
  return parseDecimal(raw);
}

// ---------- Strategy 1: Header-based extraction ----------

function tryHeaderBasedExtraction(lines: string[]): ExtractedPdfItem[] {
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (looksLikeHeader(lines[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const items: ExtractedPdfItem[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (shouldSkipLine(line)) continue;
    if (looksLikeHeader(line)) continue;

    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 4) continue;

    // Try to parse as a data row with tokens
    const item = parseSpacedTokenRow(tokens);
    if (item) items.push(item);
  }

  return items.length >= 2 ? items : [];
}

function parseSpacedTokenRow(tokens: string[]): ExtractedPdfItem | null {
  // Strip trailing IPI if present (last token is a decimal like "0,00")
  let ipiPercent: number | null = null;
  if (tokens.length >= 5 && /^\d+,\d{2}$/.test(tokens[tokens.length - 1])) {
    const ipiCandidate = parseDecimal(tokens[tokens.length - 1]);
    if (Number.isFinite(ipiCandidate) && ipiCandidate >= 0 && ipiCandidate <= 100) {
      ipiPercent = ipiCandidate;
      tokens = tokens.slice(0, -1);
    }
  }

  // Last token = total, second-to-last = unit price
  if (tokens.length < 4) return null;
  const totalStr = tokens[tokens.length - 1];
  const unitPriceStr = tokens[tokens.length - 2];
  const totalValue = parseDecimal(totalStr);
  const unitPrice = parseDecimal(unitPriceStr);
  if (!Number.isFinite(unitPrice) || !isPlausibleMoneyValue(unitPrice)) return null;

  const restTokens = tokens.slice(0, -2);

  // Find unit and quantity from right side of restTokens
  let quantity = NaN;
  let unit = "UN";
  let descEndIdx = restTokens.length;

  for (let j = restTokens.length - 1; j >= 1; j--) {
    if (isLikelyUnit(restTokens[j])) {
      unit = restTokens[j].toUpperCase();
      // qty is token before unit
      if (j > 0) {
        quantity = parseQuantity(restTokens[j - 1]);
        descEndIdx = j - 1;
      }
      break;
    }
    // If it's a number, might be quantity (if no unit found)
    const numVal = parseQuantity(restTokens[j]);
    if (Number.isFinite(numVal) && numVal > 0 && isNaN(quantity)) {
      quantity = numVal;
      descEndIdx = j;
    }
  }

  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  // First token = SKU (skip if it's a pure sequential number 1-3 digits)
  let skuIdx = 0;
  if (/^\d{1,3}$/.test(restTokens[0]) && restTokens.length > 2) {
    skuIdx = 1;
  }
  const sku = restTokens[skuIdx] ?? "";
  const description = restTokens.slice(skuIdx + 1, descEndIdx).join(" ").trim();

  if (!sku || description.length < 2) return null;

  return {
    sku,
    description,
    unit,
    quantity,
    unitPrice,
    totalValue: Number.isFinite(totalValue) && totalValue > 0 ? totalValue : null,
    ipiPercent,
  };
}

// ---------- Strategy 2: Concatenated format extraction ----------

/**
 * Match the CORFIO-style concatenated format:
 * "8,00RL0007N-BC        Cordão paralelo ...1239,55361.916,430,00"
 * "1.500,00M B1025E-AZ   Cabo flexível ...SimNao17,969011.953,450,00"
 *
 * Two variants:
 * A) Unit separated from SKU by space: "1.500,00M B1025E-AZ ..."
 * B) Unit glued to SKU: "8,00RL0007N-BC ..."
 */
const CONCAT_START_SPACED_RE = /^(\d{1,3}(?:\.\d{3})*,\d{2})\s*([A-Z]{1,4})\s+(\S+)\s+/;
const CONCAT_START_GLUED_RE = /^(\d{1,3}(?:\.\d{3})*,\d{2})\s*([A-Z]{1,4})([A-Z0-9][A-Z0-9._-]*)\s+/;

/**
 * Post-process decimals: if a match has >2 decimal places and its last digit(s)
 * plus a following ",XX" were merged, try to split.
 * e.g. "11.953,450,00" → findBrazilianDecimals returns "11.953,450" but the
 * actual values are "11.953,45" (total) and "0,00" (IPI).
 */
function splitMergedDecimals(
  text: string,
  decimals: Array<{ value: number; start: number; end: number; raw: string }>
): Array<{ value: number; start: number; end: number; raw: string }> {
  const result: Array<{ value: number; start: number; end: number; raw: string }> = [];
  for (const d of decimals) {
    // Check if after this match there's a ",XX" orphan that could form a number
    const afterEnd = text.substring(d.end);
    const orphanMatch = afterEnd.match(/^,(\d{2})(?:\D|$)/);
    if (orphanMatch && d.raw.match(/,\d{3,4}$/)) {
      // The last digit of this match is the leading digit of an orphaned decimal
      // e.g. "11.953,450" + ",00" → "11.953,45" + "0,00"
      const shortenedRaw = d.raw.slice(0, -1); // remove last digit
      const leadingDigit = d.raw.slice(-1);     // "0"
      const orphanRaw = leadingDigit + "," + orphanMatch[1]; // "0,00"
      result.push({
        value: parseDecimal(shortenedRaw),
        start: d.start,
        end: d.end - 1,
        raw: shortenedRaw,
      });
      result.push({
        value: parseDecimal(orphanRaw),
        start: d.end - 1,
        end: d.end + orphanMatch[0].length,
        raw: orphanRaw,
      });
    } else {
      result.push(d);
    }
  }
  return result;
}

function tryConcatenatedExtraction(lines: string[]): ExtractedPdfItem[] {
  const items: ExtractedPdfItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (shouldSkipLine(trimmed)) continue;
    if (looksLikeHeader(trimmed)) continue;

    // Try spaced variant first, then glued
    let qtyRaw: string;
    let unitRaw: string;
    let sku: string;
    let matchLen: number;

    const spacedMatch = trimmed.match(CONCAT_START_SPACED_RE);
    const gluedMatch = trimmed.match(CONCAT_START_GLUED_RE);

    if (spacedMatch && spacedMatch[2] && isLikelyUnit(spacedMatch[2])) {
      qtyRaw = spacedMatch[1];
      unitRaw = spacedMatch[2];
      sku = spacedMatch[3];
      matchLen = spacedMatch[0].length;
    } else if (gluedMatch && gluedMatch[2] && isLikelyUnit(gluedMatch[2])) {
      qtyRaw = gluedMatch[1];
      unitRaw = gluedMatch[2];
      sku = gluedMatch[3];
      matchLen = gluedMatch[0].length;
    } else {
      continue;
    }

    const quantity = parseQuantity(qtyRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    // Everything after the start match
    const afterStart = trimmed.slice(matchLen);

    // Find all Brazilian decimals in the remainder, then fix merged ones
    const rawDecimals = findBrazilianDecimals(afterStart);
    const decimals = splitMergedDecimals(afterStart, rawDecimals);
    if (decimals.length < 2) continue;

    // From right: last = IPI, second-to-last = total, third-to-last = unitPrice
    let ipiPercent: number | null = null;
    let totalValue: number | null = null;
    let unitPrice = 0;

    if (decimals.length >= 3) {
      ipiPercent = decimals[decimals.length - 1].value;
      totalValue = decimals[decimals.length - 2].value;
      unitPrice = decimals[decimals.length - 3].value;
    } else if (decimals.length === 2) {
      totalValue = decimals[decimals.length - 1].value;
      unitPrice = decimals[decimals.length - 2].value;
    }

    // Lance-digit correction: a lance integer (1-2 digits) may be prepended to
    // the unit price decimal. e.g. "17,9690" is actually lance "1" + price "7,9690".
    // Detect by checking if qty * unitPrice is way off from total.
    if (totalValue !== null && totalValue > 0 && unitPrice > 0) {
      const priceDecimal = decimals.length >= 3
        ? decimals[decimals.length - 3]
        : decimals[0];
      const ratio = (quantity * unitPrice) / totalValue;
      if (ratio > 1.5 || ratio < 0.1) {
        // Try stripping 1 or 2 leading digits from the raw match
        const rawPrice = priceDecimal.raw;
        for (let strip = 1; strip <= 2; strip++) {
          const stripped = rawPrice.slice(strip);
          if (/^\d{1,3}(?:\.\d{3})*,\d{2,4}$/.test(stripped)) {
            const altPrice = parseDecimal(stripped);
            const altRatio = (quantity * altPrice) / totalValue;
            if (altRatio > 0.5 && altRatio < 2.0) {
              unitPrice = altPrice;
              // Adjust start index for description boundary
              priceDecimal.start += strip;
              break;
            }
          }
        }
      }
    }

    if (!isPlausibleMoneyValue(unitPrice) && unitPrice !== 0) continue;

    // Description = text between SKU end and the start of the first decimal used for pricing
    const priceStartIdx = decimals.length >= 3
      ? decimals[decimals.length - 3].start
      : decimals[0].start;
    let description = afterStart.slice(0, priceStartIdx).trim();

    // Clean up Sim/Nao and trailing integers (lances)
    description = description
      .replace(/\b(Sim|Nao|sim|nao|SIM|NAO)\b/g, "")
      .replace(/\s+\d{1,2}\s*$/, "")  // trailing lance integer
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!description || description.length < 3) continue;

    items.push({
      sku,
      description,
      unit: unitRaw.toUpperCase(),
      quantity,
      unitPrice,
      totalValue,
      ipiPercent,
    });
  }

  return items.length >= 2 ? items : [];
}

// ---------- Strategy 3: Token-based extraction ----------

function tryTokenBasedExtraction(lines: string[]): ExtractedPdfItem[] {
  const items: ExtractedPdfItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (shouldSkipLine(trimmed)) continue;
    if (looksLikeHeader(trimmed)) continue;

    let tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length < 4) continue;

    const item = parseSpacedTokenRow(tokens);
    if (item) items.push(item);
  }

  return items.length >= 2 ? items : [];
}

// ---------- Main entry ----------

export function parseGenericSupplierPdf(lines: string[]): ExtractedPdfItem[] {
  // Strategy 1: Header-based
  const headerResult = tryHeaderBasedExtraction(lines);
  if (headerResult.length > 0) return headerResult;

  // Strategy 2: Concatenated format
  const concatResult = tryConcatenatedExtraction(lines);
  if (concatResult.length > 0) return concatResult;

  // Strategy 3: Token-based
  return tryTokenBasedExtraction(lines);
}
