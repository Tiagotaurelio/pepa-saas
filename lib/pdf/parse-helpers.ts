// lib/pdf/parse-helpers.ts

/** Parse Brazilian decimal format: "1.234,56" → 1234.56 */
export function parseDecimal(raw: string): number {
  const cleaned = raw.replace(/\s/g, "").trim();
  if (!cleaned) return NaN;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    }
    return parseFloat(cleaned.replace(/,/g, ""));
  }
  if (hasComma) {
    return parseFloat(cleaned.replace(",", "."));
  }
  return parseFloat(cleaned);
}

/** Check if value is a plausible unit price (0 < v <= 1,000,000) */
export function isPlausibleMoneyValue(value: number): boolean {
  return value > 0 && value <= 1_000_000;
}

/** Check if value is a plausible total (0 < v <= 100,000,000 or null) */
export function isPlausibleTotalValue(value: number | null): boolean {
  return value === null || (value > 0 && value <= 100_000_000);
}

/** Normalize text for comparison: lowercase, no accents, no special chars */
export function normalizeComparable(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Check if a short string looks like a measurement unit */
export function isLikelyUnit(value: string): boolean {
  return /^(UN|UND|UNID|ROLO|RL|M|MT|PCA|PC|KIT|CJ|CX|KG|GR|JG|TON|R|U|L)$/i.test(value.trim());
}

/** Check if a line looks like a table header (has 2+ header keywords) */
export function looksLikeHeader(value: string): boolean {
  if (/^sku[-_.]?\d+/i.test(value.trim())) return false;
  const normalizedTokens = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const headerTokens = new Set([
    "sku", "codigo", "cod", "ref", "item", "seq",
    "descricao", "descr", "produto", "material", "itens",
    "quantidade", "qtd", "qtde", "quant", "qt",
    "unidade", "un", "und", "unid",
    "preco", "valor", "vlr", "unit", "unitario", "prod",
    "ipi", "total", "lances"
  ]);
  const matched = normalizedTokens.filter((t) => headerTokens.has(t)).length;
  return matched >= 2;
}

/** Check if line is address/metadata (CNPJ, CEP, phone, URL) */
export function looksLikeAddressOrMeta(value: string): boolean {
  return /\b(cep|cnpj|cpf|fone|telefone|email|http|www|@)\b/i.test(value);
}

/**
 * Find all Brazilian decimal numbers in a string.
 * Matches: "239,5536", "1.916,43", "0,00"
 * Pattern: 1-3 digits, optional groups of .XXX, then ,XX to ,XXXX
 */
export function findBrazilianDecimals(text: string): Array<{ value: number; start: number; end: number; raw: string }> {
  const regex = /\d{1,3}(?:\.\d{3})*,\d{2,4}/g;
  const matches: Array<{ value: number; start: number; end: number; raw: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    matches.push({
      value: parseDecimal(m[0]),
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0]
    });
  }
  return matches;
}
