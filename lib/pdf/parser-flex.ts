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
  const items: ExtractedPdfItem[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();

    // Line must start with: seq (1-3 digits) + space + PEPA code (1-6 digits)
    const seqCodeMatch = trimmed.match(/^(\d{1,3})\s+(\d{1,6})\s+/);
    if (!seqCodeMatch) continue;

    const seq = parseInt(seqCodeMatch[1], 10);
    if (seq <= 0) continue;
    const sku = seqCodeMatch[2];

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
