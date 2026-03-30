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

  // Strategy 2: Concatenated format (Corfio-style: qty+unit+sku glued)
  const concatResult = tryConcatenatedExtraction(lines);
  if (concatResult.length > 0) return concatResult;

  // Strategy 3: Multi-line block format (Jomarca-style: seq+code+desc across multiple lines)
  const blockResult = tryBlockExtraction(lines);
  if (blockResult.length > 0) return blockResult;

  // Strategy 4: Token-based
  return tryTokenBasedExtraction(lines);
}

// ---------- Strategy 3: Multi-line block extraction ----------
// For supplier PDFs where each item spans multiple lines:
//   Line 1: {seq}{code}{description start...}
//   Line 2+: description continuation, "*", "(ICX)" etc.
//   Unit+date line: {UN|CT|KG|CX}{DD/MM/YY} (glued)
//   Optional: packaging type (CX, SACO, BR)
//   Numbers line: {price},{decimal}{qty},{decimal}...

const UNIT_DATE_RE = /^(UN|CT|KG|CX|KIT|MT|RL|PC|PCT|M|L)\s*(\d{2}\/\d{2}\/\d{2,4})/i;
// Match seq+code at start of line. Prefer longer code (5-6 digits) over longer seq.
function matchItemStart(line: string): { seq: number; sku: string; descStart: number } | null {
  // Try 1-digit seq + 5-6 digit code first (most common)
  const m1 = line.match(/^(\d)(\d{5,6})([A-ZÀ-ÿ])/);
  if (m1) return { seq: parseInt(m1[1], 10), sku: m1[2], descStart: m1[1].length + m1[2].length };
  // Then 2-digit seq + 4-6 digit code
  const m2 = line.match(/^(\d{2})(\d{4,6})([A-ZÀ-ÿ])/);
  if (m2) return { seq: parseInt(m2[1], 10), sku: m2[2], descStart: m2[1].length + m2[2].length };
  return null;
}

function tryBlockExtraction(lines: string[]): ExtractedPdfItem[] {
  const items: ExtractedPdfItem[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip headers, footers, metadata
    if (shouldSkipLine(line) || looksLikeHeader(line)) { i++; continue; }

    // Look for item start: seq + code + description start
    const startMatch = matchItemStart(line);
    if (!startMatch) { i++; continue; }

    const sku = startMatch.sku;
    const afterCode = line.slice(startMatch.descStart);
    const descParts: string[] = [afterCode.trim()];
    let supplierRef: string | undefined;

    i++;

    // Collect description continuation + find unit+date line
    let unit = "UN";
    let foundUnitDate = false;

    while (i < lines.length) {
      const cur = lines[i].trim();

      // Check if this line has unit+date
      const unitDateMatch = cur.match(UNIT_DATE_RE);
      if (unitDateMatch) {
        unit = unitDateMatch[1].toUpperCase();
        foundUnitDate = true;

        // Check if numbers are glued to the unit+date line
        // e.g., "CT24/03/264,709060,00060,000282,54..."
        const afterDate = cur.slice(unitDateMatch[0].length);
        if (afterDate && findBrazilianDecimals(afterDate).length >= 2) {
          // Numbers are on same line — inject as next line for parsing
          lines.splice(i + 1, 0, afterDate);
        }

        i++;

        // Skip optional packaging type line (CX, SACO, BR, etc.)
        if (i < lines.length && /^(CX|SACO|BR|CT|KG|UN|CAIXA)$/i.test(lines[i].trim())) {
          i++;
        }
        break;
      }

      // Check if next item starts (means we missed the unit+date)
      if (matchItemStart(cur)) break;

      // Skip markers like "*", "(ICX)", "(NCX)", page headers
      if (/^(\*|SeqC[oó]d)/.test(cur)) { i++; continue; }

      // Capture cross-reference code from "Ref:" lines like "04504 (i)" or "06733 (i)"
      const refCodeMatch = cur.match(/^(\d{4,6})\s*\(/);
      if (refCodeMatch) {
        supplierRef = refCodeMatch[1];
        i++;
        continue;
      }

      // Accumulate description (strip trailing "Ref:" marker)
      if (cur.length > 1) {
        descParts.push(cur);
      }
      i++;
    }

    if (!foundUnitDate) continue;

    // Next line should be the numbers line: price,decimalQty,decimal...
    if (i >= lines.length) break;
    const numbersLine = lines[i].trim();
    i++;

    // Extract price and quantity from the numbers line
    // Format: {price},{4decimal}{qty},{3decimal}{stock},{3decimal}{total},{2decimal}...
    // Example: "16,644420,0000,000332,896,540,00354,5320521 /"
    // Or: "143,00451,0001,000143,006,540,00152,3020521 /"
    const decimals = findBrazilianDecimals(numbersLine);
    if (decimals.length < 2) continue;

    // First decimal = unit price (Preço Líq.)
    const unitPrice = decimals[0].value;

    // Second decimal = quantity
    // But the qty might be merged: "16,644420,000" → price=16.6444, then "20,000" → qty=20
    // Or "143,00451,000" → price=143.0045, qty=1.000
    // The trick: qty has 3 decimal places (.000) and price has 4 (.XXXX)
    let quantity = decimals.length > 1 ? decimals[1].value : 0;

    // Try to fix: if price has 4+ decimals merged with qty
    const priceRaw = decimals[0].raw;
    const afterPrice = numbersLine.slice(decimals[0].end);
    const qtyFromAfter = afterPrice.match(/^(\d{1,6}),(\d{3})/);
    if (qtyFromAfter) {
      quantity = parseInt(qtyFromAfter[1], 10);
    }

    if (unitPrice <= 0 || quantity <= 0) continue;

    const description = descParts
      .join(" ")
      .replace(/\s*Ref:\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!description || description.length < 3) continue;

    items.push({
      sku,
      description,
      unit,
      quantity,
      unitPrice,
      totalValue: null,
      ipiPercent: null,
      supplierRef,
    });
  }

  return items.length >= 2 ? items : [];
}
