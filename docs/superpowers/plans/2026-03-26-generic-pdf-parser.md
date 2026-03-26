# Generic PDF Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded PDF parsers with a generic heuristic parser for suppliers + Tesseract OCR for image-based PDFs, enabling extraction from any supplier format without code changes.

**Architecture:** Pipeline: pdf-parse → (if 0 lines) Tesseract OCR → text lines → parser-flex (internal) or parser-generic (any supplier). Parser-generic detects table headers and/or uses pattern-based extraction from Brazilian commercial PDF formats. All existing hardcoded parsers are removed.

**Tech Stack:** tesseract.js (OCR), pdf-parse (text extraction), vitest (tests)

**Spec:** `docs/superpowers/specs/2026-03-26-generic-pdf-parser-design.md`

---

## File Structure

```
lib/
├── pepa-store.ts              (MODIFY: remove all PDF parsers, call new modules)
├── pdf/
│   ├── types.ts               (CREATE: shared types for PDF extraction)
│   ├── extract-text.ts        (CREATE: pdf-parse + Tesseract OCR fallback)
│   ├── parser-flex.ts         (CREATE: dedicated Flex/PEPA parser)
│   ├── parser-generic.ts      (CREATE: heuristic parser for any supplier PDF)
│   └── parse-helpers.ts       (CREATE: shared utilities moved from pepa-store.ts)
tests/
├── pdf-extract-text.test.ts   (CREATE: unit tests for text extraction + OCR)
├── pdf-parser-flex.test.ts    (CREATE: unit tests for Flex parser)
├── pdf-parser-generic.test.ts (CREATE: unit tests for generic parser)
```

---

### Task 1: Create shared types and helpers

**Files:**
- Create: `lib/pdf/types.ts`
- Create: `lib/pdf/parse-helpers.ts`

- [ ] **Step 1: Create lib/pdf directory**

```bash
mkdir -p lib/pdf
```

- [ ] **Step 2: Create types.ts**

```typescript
// lib/pdf/types.ts

/** Item extracted from any PDF (mirror or supplier) */
export type ExtractedPdfItem = {
  sku: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalValue: number | null;
  ipiPercent: number | null;
  supplierRef?: string;
};

/** Result of text extraction from a PDF */
export type TextExtractionResult = {
  lines: string[];
  method: "pdf-parse" | "tesseract-ocr";
};

/** Detected column mapping from header analysis */
export type ColumnMapping = {
  sku: number;
  description: number;
  quantity: number;
  unit: number;
  unitPrice: number;
  totalValue: number;
  ipi: number;
};
```

- [ ] **Step 3: Create parse-helpers.ts with utilities moved from pepa-store.ts**

Move these functions from `lib/pepa-store.ts` (they are currently private, need to be shared):

```typescript
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
```

- [ ] **Step 4: Commit**

```bash
git add lib/pdf/types.ts lib/pdf/parse-helpers.ts
git commit -m "feat: create shared PDF types and parse helpers"
```

---

### Task 2: Create text extraction module with OCR fallback

**Files:**
- Create: `lib/pdf/extract-text.ts`
- Create: `tests/pdf-extract-text.test.ts`

- [ ] **Step 1: Install tesseract.js**

```bash
cd /Users/tiagotavares/pepa-saas && npm install tesseract.js
```

Note: `tesseract.js` v5+ uses WASM workers. For image-based PDFs, it needs page images. We use `pdf-parse` for text-based PDFs and `tesseract.js` with a canvas-based PDF renderer for image PDFs. Since `pdf-parse` already handles text extraction, the OCR path only activates when pdf-parse returns 0 lines.

For PDF→image conversion, `tesseract.js` cannot read PDFs directly. We need to convert PDF pages to images first. Install `pdfjs-dist` for rendering:

```bash
npm install pdfjs-dist@legacy
```

Note: Use `pdfjs-dist/legacy` build which works in Node.js without canvas. For OCR, we extract the raw pixel data from the PDF rendering.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/pdf-extract-text.test.ts
import { describe, expect, it } from "vitest";
import { extractTextFromPdf } from "../lib/pdf/extract-text";

describe("extractTextFromPdf", () => {
  it("extracts text from a text-based PDF buffer", async () => {
    // Create a minimal text-based PDF manually
    // pdf-parse can extract text from real PDFs; we test the pipeline
    const fakePdfWithText = createMinimalTextPdf("Hello World\nLine Two");
    const result = await extractTextFromPdf(fakePdfWithText);
    expect(result.method).toBe("pdf-parse");
    expect(result.lines.length).toBeGreaterThan(0);
  });

  it("returns empty lines for empty buffer with pdf-parse", async () => {
    // An empty/corrupt buffer should not crash
    const result = await extractTextFromPdf(Buffer.from("not a pdf"));
    // Should attempt OCR fallback but fail gracefully
    expect(result.lines).toEqual([]);
  });
});

/** Helper: create a minimal valid PDF with embedded text */
function createMinimalTextPdf(text: string): Buffer {
  // Minimal PDF 1.0 with a text stream
  const stream = `BT /F1 12 Tf 100 700 Td (${text.replace(/\n/g, ") Tj T* (")}) Tj ET`;
  const content = [
    "%PDF-1.0",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    `3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>>/Contents 5 0 R>>endobj`,
    "4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    `5 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj`,
    "xref",
    "0 6",
    "0000000000 65535 f ",
    "trailer<</Size 6/Root 1 0 R>>",
    "startxref",
    "0",
    "%%EOF"
  ].join("\n");
  return Buffer.from(content);
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/pdf-extract-text.test.ts
```

Expected: FAIL — module `../lib/pdf/extract-text` not found.

- [ ] **Step 4: Implement extract-text.ts**

```typescript
// lib/pdf/extract-text.ts
import pdfParse from "pdf-parse";
import type { TextExtractionResult } from "./types";

/**
 * Extract text lines from a PDF buffer.
 * Strategy: try pdf-parse first (fast, works for text-based PDFs).
 * If pdf-parse returns 0 lines, attempt OCR via tesseract.js.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<TextExtractionResult> {
  // Step 1: Try pdf-parse (works for text-based PDFs)
  const textLines = await extractWithPdfParse(buffer);
  if (textLines.length > 0) {
    return { lines: textLines, method: "pdf-parse" };
  }

  // Step 2: Fallback to Tesseract OCR (for image-based PDFs)
  const ocrLines = await extractWithTesseract(buffer);
  return { lines: ocrLines, method: "tesseract-ocr" };
}

async function extractWithPdfParse(buffer: Buffer): Promise<string[]> {
  try {
    const parsed = await pdfParse(buffer);
    return parsed.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function extractWithTesseract(buffer: Buffer): Promise<string[]> {
  try {
    const { createWorker } = await import("tesseract.js");
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdfDoc = await loadingTask.promise;

    const allLines: string[] = [];
    const worker = await createWorker("por+eng");

    try {
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale = better OCR

        // Render page to raw pixel buffer (no canvas dependency)
        // pdfjs-dist can render to a custom canvas-like object
        const width = Math.floor(viewport.width);
        const height = Math.floor(viewport.height);

        // Use OffscreenCanvas-like approach: render to raw RGBA data
        const { NodeCanvasFactory } = await getNodeCanvasFactory();
        const canvasFactory = new NodeCanvasFactory();
        const canvasAndContext = canvasFactory.create(width, height);

        await page.render({
          canvasContext: canvasAndContext.context,
          viewport,
          canvasFactory
        }).promise;

        // Convert canvas to PNG buffer for Tesseract
        const pngBuffer = canvasAndContext.canvas.toBuffer("image/png");

        const { data } = await worker.recognize(pngBuffer);
        const pageLines = data.text
          .split(/\r?\n/)
          .map((l: string) => l.trim())
          .filter(Boolean);
        allLines.push(...pageLines);

        page.cleanup();
      }
    } finally {
      await worker.terminate();
    }

    return allLines;
  } catch (err) {
    console.error("[extract-text] OCR fallback failed:", err);
    return [];
  }
}

/**
 * Dynamic import of canvas for Node.js PDF rendering.
 * Uses the 'canvas' npm package if available.
 * This is only needed for the OCR fallback path.
 */
async function getNodeCanvasFactory() {
  const { createCanvas } = await import("canvas");

  class NodeCanvasFactory {
    create(width: number, height: number) {
      const canvas = createCanvas(width, height);
      const context = canvas.getContext("2d");
      return { canvas, context };
    }
    reset(canvasAndContext: any, width: number, height: number) {
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    }
    destroy(canvasAndContext: any) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
    }
  }

  return { NodeCanvasFactory };
}
```

**Important:** The OCR path needs the `canvas` npm package for rendering PDF pages to images. Install it:

```bash
npm install canvas
```

If `canvas` fails to install (native compilation issues), the OCR path will gracefully fail and return empty lines. The text-based PDF path (pdf-parse) works without it.

If `canvas` has install issues on the deployment environment, an alternative is to skip OCR for now and handle image-based PDFs in a future iteration (the system already marks them as `ocr-required`). The generic parser for text-based PDFs is the higher priority deliverable.

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/pdf-extract-text.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/pdf/extract-text.ts tests/pdf-extract-text.test.ts package.json package-lock.json
git commit -m "feat: add PDF text extraction with Tesseract OCR fallback"
```

---

### Task 3: Create Flex/PEPA PDF parser

**Files:**
- Create: `lib/pdf/parser-flex.ts`
- Create: `tests/pdf-parser-flex.test.ts`

- [ ] **Step 1: Write the failing test**

Test with real Flex PDF line formats. The Flex PDF has this format per line:
`{seq} {sku_pepa} {description} {supplier_ref} {unit} {qty} {dd/mm/yyyy} {vlr.unit} {vlr.total} {%ipi}`

```typescript
// tests/pdf-parser-flex.test.ts
import { describe, expect, it } from "vitest";
import { parseFlexPdf } from "../lib/pdf/parser-flex";

describe("parseFlexPdf", () => {
  it("parses standard Flex line-mode items", () => {
    const lines = [
      "COMPRA DE MERCADORIA / RETORNO ORCAMENTO",
      "Seq Cod.Pepa Descrição Ref.Forn Un Qtde Prev.Fat. Vl.Unit Vl.Total %Ipi",
      "1 5559 BOBINA CABO FLEXIVEL HEPR 1KV 10MM AZUL CORFIO WB1025E-AZ MT 1.500 05/03/2026 7,18 10770,00 0,00",
      "2 5560 BOBINA CABO FLEXIVEL HEPR 1KV 10MM BRANCO CORFIO WB1025E-BC MT 1.000 05/03/2026 7,18 7180,00 0,00",
      "3 1234 DISJUNTOR TRIPOLAR 32A ABB UN 20 05/03/2026 18,50 370,00 0,00"
    ];

    const items = parseFlexPdf(lines);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      sku: "5559",
      description: expect.stringContaining("BOBINA CABO FLEXIVEL"),
      unit: "MT",
      quantity: 1500,
      unitPrice: 7.18,
      supplierRef: "WB1025E-AZ"
    });
    expect(items[2]).toMatchObject({
      sku: "1234",
      unit: "UN",
      quantity: 20,
      unitPrice: 18.5
    });
  });

  it("returns empty array for non-Flex PDF", () => {
    const lines = ["Some random PDF content", "Not a Flex order"];
    expect(parseFlexPdf(lines)).toEqual([]);
  });

  it("handles OCR text with minor spacing variations", () => {
    // OCR might add/remove spaces — parser should be tolerant
    const lines = [
      "COMPRA DE MERCADORIA",
      "1  5559  BOBINA CABO FLEXIVEL HEPR 1KV 10MM AZUL CORFIO  WB1025E-AZ  MT  1.500  05/03/2026  7,18  10770,00  0,00"
    ];
    const items = parseFlexPdf(lines);
    expect(items).toHaveLength(1);
    expect(items[0].sku).toBe("5559");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/pdf-parser-flex.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement parser-flex.ts**

Move and adapt the existing `parseFlexOrderPdfLines()` from `lib/pepa-store.ts` (lines 1066-1139). Returns `ExtractedPdfItem[]` instead of `RequestedItem[]`.

```typescript
// lib/pdf/parser-flex.ts
import type { ExtractedPdfItem } from "./types";
import { parseDecimal, isLikelyUnit } from "./parse-helpers";

const DATE_RE = /\b(\d{2}\/\d{2}\/\d{4})\b/;
const UNIT_RE = /^(MT|RL|UN|UND|UNID|PC|PCA|M|L|KG|CX|KIT|CJ|GR|JG|TON|R|U)$/i;

/**
 * Parse PDF lines from PEPA Flex system (COMPRA DE MERCADORIA / RETORNO ORCAMENTO).
 * Format: {seq} {sku} {description} {ref.forn} {unit} {qty} {date} {vl.unit} {vl.total} {%ipi}
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
    const qty = parseDecimal(qtyStr);
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
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/pdf-parser-flex.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/parser-flex.ts tests/pdf-parser-flex.test.ts
git commit -m "feat: add dedicated Flex PDF parser module"
```

---

### Task 4: Create generic supplier PDF parser

This is the core task. The parser must handle ANY supplier PDF format.

**Files:**
- Create: `lib/pdf/parser-generic.ts`
- Create: `tests/pdf-parser-generic.test.ts`

- [ ] **Step 1: Write failing tests for header-based extraction**

```typescript
// tests/pdf-parser-generic.test.ts
import { describe, expect, it } from "vitest";
import { parseGenericSupplierPdf } from "../lib/pdf/parser-generic";

describe("parseGenericSupplierPdf", () => {
  describe("header-based extraction", () => {
    it("parses spaced lines with explicit header", () => {
      const lines = [
        "ORCAMENTO 12345",
        "Codigo Descricao Qtd Un Vlr.Unit Vlr.Total %IPI",
        "ABC-001 Cabo Flex 2.5mm Azul 100 RL 5,50 550,00 0,00",
        "ABC-002 Disjuntor 32A Tripolar 20 UN 18,90 378,00 0,00",
        "Total Geral: 928,00"
      ];
      const items = parseGenericSupplierPdf(lines);
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        sku: "ABC-001",
        description: expect.stringContaining("Cabo Flex"),
        quantity: 100,
        unit: "RL",
        unitPrice: 5.5,
        totalValue: 550
      });
      expect(items[1]).toMatchObject({
        sku: "ABC-002",
        quantity: 20,
        unit: "UN",
        unitPrice: 18.9,
        totalValue: 378
      });
    });
  });

  describe("concatenated format (no spaces between numeric fields)", () => {
    it("parses CORFIO Pedido de Vendas format", () => {
      // Real format from Orcamento Corfio.pdf
      const lines = [
        "Pedido de Vendas ClientePEDIDO NR: 12040718",
        "ELETROCAL IND E COM MAT ELETRICOS LTDA",
        "Qt. Ped UNCódigoDescrição dos itensVariar   Mad.LancesVlr. UnitVlr.Prod.%IPI",
        "8,00RL0007N-BC        Cordão paralelo 300V 2x1,5mm2 - Branco                1239,55361.916,430,00",
        "19,00RL0008N-BC        Cordão paralelo 300V 2x2,5mm2 - Branco                1385,71057.328,500,00",
        "1.500,00M B1025E-AZ       Cabo flexível 1KV 1x10,0mm2 HEPR - Azul               SimNao17,969011.953,450,00",
        "Valor do Produto:111.482,07"
      ];
      const items = parseGenericSupplierPdf(lines);
      expect(items.length).toBeGreaterThanOrEqual(3);

      // First item: 8 rolos of Cordão paralelo
      expect(items[0]).toMatchObject({
        sku: "0007N-BC",
        description: expect.stringContaining("Cordão paralelo"),
        quantity: 8,
        unit: "RL",
        unitPrice: 239.5536
      });
      expect(items[0].totalValue).toBeCloseTo(1916.43, 1);

      // Bobina item with Sim/Nao tokens
      const bobinaItem = items.find(i => i.sku === "B1025E-AZ");
      expect(bobinaItem).toBeDefined();
      expect(bobinaItem!.quantity).toBe(1500);
      expect(bobinaItem!.unit).toBe("M");
      expect(bobinaItem!.unitPrice).toBeCloseTo(7.969, 2);
    });
  });

  describe("various supplier formats", () => {
    it("parses lines where SKU comes first followed by description and prices", () => {
      const lines = [
        "ORCAMENTO",
        "Item Descricao Qtde Preco Unit. Total",
        "WB1025E-AZ CABO FLEX 1KV 10MM AZUL 1500 7,18 10.770,00",
        "WB1025E-BC CABO FLEX 1KV 10MM BRANCO 1000 7,18 7.180,00"
      ];
      const items = parseGenericSupplierPdf(lines);
      expect(items).toHaveLength(2);
      expect(items[0].sku).toBe("WB1025E-AZ");
      expect(items[0].quantity).toBe(1500);
      expect(items[0].unitPrice).toBeCloseTo(7.18, 2);
    });

    it("handles lines with seq number prefix", () => {
      const lines = [
        "PROPOSTA COMERCIAL",
        "Seq Codigo Produto Qtd Un Preco Vlr.Total",
        "1 CAB-001 Cabo Flex 2.5mm 100 MT 5,50 550,00",
        "2 CAB-002 Cabo Flex 4.0mm 50 MT 8,30 415,00"
      ];
      const items = parseGenericSupplierPdf(lines);
      expect(items).toHaveLength(2);
      expect(items[0].sku).toBe("CAB-001");
    });

    it("returns empty for non-tabular content", () => {
      const lines = [
        "Prezado cliente,",
        "Segue nossa proposta conforme solicitado.",
        "Atenciosamente,",
        "Equipe Comercial"
      ];
      expect(parseGenericSupplierPdf(lines)).toEqual([]);
    });

    it("skips header/footer/metadata lines", () => {
      const lines = [
        "CNPJ: 12.345.678/0001-99",
        "Rua Exemplo, 123 - Centro - Criciuma SC",
        "Codigo Descricao Qtd Un Vlr.Unit Total",
        "X-100 Produto Teste 10 UN 5,00 50,00",
        "Valor Total: 50,00",
        "Fone: 48 3456-7890"
      ];
      const items = parseGenericSupplierPdf(lines);
      expect(items).toHaveLength(1);
      expect(items[0].sku).toBe("X-100");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/pdf-parser-generic.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement parser-generic.ts**

```typescript
// lib/pdf/parser-generic.ts
import type { ExtractedPdfItem } from "./types";
import {
  parseDecimal,
  isLikelyUnit,
  looksLikeHeader,
  looksLikeAddressOrMeta,
  findBrazilianDecimals,
  isPlausibleMoneyValue
} from "./parse-helpers";

/**
 * Generic heuristic parser for supplier PDF text lines.
 * Works with any Brazilian commercial PDF format.
 *
 * Strategy:
 * 1. Try header-based extraction (find header row, parse subsequent lines)
 * 2. Try concatenated-format extraction (Brazilian PDFs with no spaces between numbers)
 * 3. Try token-based extraction (split by whitespace, classify tokens)
 */
export function parseGenericSupplierPdf(lines: string[]): ExtractedPdfItem[] {
  // Strategy 1: Header-based — find a header line and parse structured rows after it
  const headerResult = tryHeaderBasedExtraction(lines);
  if (headerResult.length > 0) return headerResult;

  // Strategy 2: Concatenated format — Brazilian PDFs where qty+unit+sku are glued together
  const concatResult = tryConcatenatedExtraction(lines);
  if (concatResult.length > 0) return concatResult;

  // Strategy 3: Token-based — split each line by whitespace and classify
  const tokenResult = tryTokenBasedExtraction(lines);
  return tokenResult;
}

// ─── Strategy 1: Header-based extraction ─────────────────────────────────────

const HEADER_ALIASES: Record<string, string[]> = {
  sku: ["codigo", "cod", "ref", "item", "seq", "produto", "codigo_produto", "ref_forn", "ref.forn", "código", "sku"],
  description: ["descricao", "descr", "produto", "material", "itens", "item", "nome", "desc"],
  quantity: ["qtd", "qtde", "quant", "quantidade", "qt", "qt.ped"],
  unit: ["un", "und", "unid", "unidade"],
  unitPrice: ["vlr.unit", "preco", "preco_unit", "valor_unitario", "unitario", "unit", "p.unit"],
  totalValue: ["vlr.prod", "vlr.total", "valor_total", "total", "v.total", "preco_total"],
  ipi: ["ipi", "%ipi", "aliq"]
};

function normalizeHeaderToken(token: string): string {
  return token
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._]/g, "");
}

function findHeaderLine(lines: string[]): { lineIndex: number; tokens: string[] } | null {
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    if (looksLikeHeader(lines[i])) {
      return { lineIndex: i, tokens: lines[i].split(/\s+/).filter(Boolean) };
    }
  }
  return null;
}

function tryHeaderBasedExtraction(lines: string[]): ExtractedPdfItem[] {
  const header = findHeaderLine(lines);
  if (!header) return [];

  const items: ExtractedPdfItem[] = [];

  // Parse each line after the header
  for (let i = header.lineIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (looksLikeHeader(line)) continue;
    if (looksLikeAddressOrMeta(line)) continue;
    if (looksLikeSummary(line)) continue;

    const item = parseDataLineByTokens(line);
    if (item) items.push(item);
  }

  return dedupeItems(items);
}

// ─── Strategy 2: Concatenated format extraction ──────────────────────────────
// For PDFs where pdf-parse glues fields together (no spaces between numbers).
// Example: "8,00RL0007N-BC        Cordão paralelo...1239,55361.916,430,00"

function tryConcatenatedExtraction(lines: string[]): ExtractedPdfItem[] {
  const items: ExtractedPdfItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (looksLikeAddressOrMeta(trimmed)) continue;
    if (looksLikeSummary(trimmed)) continue;

    const item = parseConcatenatedLine(trimmed);
    if (item) items.push(item);
  }

  // Only return if we found enough items (avoid false positives)
  return items.length >= 2 ? dedupeItems(items) : [];
}

function parseConcatenatedLine(line: string): ExtractedPdfItem | null {
  // Pattern: starts with quantity (Brazilian decimal) immediately followed by unit code
  // Example: "8,00RL0007N-BC        Cordão paralelo...1239,55361.916,430,00"
  // Example: "1.500,00M B1025E-AZ   Cabo flexível...SimNao17,969011.953,450,00"

  const startMatch = line.match(/^(\d{1,3}(?:\.\d{3})*,\d{2})\s*([A-Z]{1,4})\s+(\S+)\s+/i);
  if (!startMatch) return null;

  const quantity = parseDecimal(startMatch[1]);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const unitCandidate = startMatch[2].toUpperCase();
  if (!isLikelyUnit(unitCandidate)) return null;

  const sku = startMatch[3];
  // SKU must be alphanumeric, not pure large number
  if (/^\d{8,}$/.test(sku)) return null;

  const afterSku = line.slice(startMatch[0].length);

  // Find all Brazilian decimal numbers in the remaining text (right side has prices)
  const decimals = findBrazilianDecimals(afterSku);
  if (decimals.length < 2) return null; // Need at least unit price and total

  // Right-to-left assignment: last = IPI (or total), second-to-last = total (or unit price)
  // IPI is usually 0,00 at the end
  let ipiPercent: number | null = null;
  let totalValue: number | null = null;
  let unitPrice: number = NaN;

  if (decimals.length >= 3) {
    // Pattern: ...{unitPrice}{total}{ipi}
    ipiPercent = decimals[decimals.length - 1].value;
    totalValue = decimals[decimals.length - 2].value;
    unitPrice = decimals[decimals.length - 3].value;
  } else if (decimals.length === 2) {
    // Pattern: ...{unitPrice}{total}
    unitPrice = decimals[0].value;
    totalValue = decimals[1].value;
  }

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  if (!isPlausibleMoneyValue(unitPrice)) return null;

  // Description: text between SKU and the first decimal number
  const firstDecimalStart = decimals[0].start;
  let description = afterSku.slice(0, firstDecimalStart).trim();

  // Clean up: remove trailing Sim/Nao/lances tokens
  description = description.replace(/\s+(Sim|Nao|Não|S|N|\d{1,2})\s*$/gi, "").trim();
  // Also remove leading Sim/Nao if stuck to end of description
  description = description.replace(/(Sim|Nao|Não)$/gi, "").trim();

  if (!description || description.length < 3) return null;

  return {
    sku,
    description,
    unit: unitCandidate,
    quantity,
    unitPrice,
    totalValue: totalValue !== null && Number.isFinite(totalValue) ? totalValue : null,
    ipiPercent: ipiPercent !== null && Number.isFinite(ipiPercent) ? ipiPercent : null
  };
}

// ─── Strategy 3: Token-based extraction ──────────────────────────────────────
// For well-spaced lines: split by whitespace, classify each token.

function tryTokenBasedExtraction(lines: string[]): ExtractedPdfItem[] {
  const items: ExtractedPdfItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (looksLikeHeader(trimmed)) continue;
    if (looksLikeAddressOrMeta(trimmed)) continue;
    if (looksLikeSummary(trimmed)) continue;

    const item = parseDataLineByTokens(trimmed);
    if (item) items.push(item);
  }

  return items.length >= 2 ? dedupeItems(items) : [];
}

function parseDataLineByTokens(line: string): ExtractedPdfItem | null {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return null;

  // Skip if line starts with "Total", "Valor", "Frete", etc.
  if (looksLikeSummary(line)) return null;

  // Remove trailing IPI zeros: "0,00" or "0.00"
  let workTokens = [...tokens];
  if (/^0[,.]0+$/.test(workTokens[workTokens.length - 1] ?? "")) {
    const ipiStr = workTokens.pop()!;
    // keep for later
  }

  // From the end, extract numeric values (total, unitPrice)
  const numericTail: number[] = [];
  while (workTokens.length > 2 && /^[\d.,]+$/.test(workTokens[workTokens.length - 1] ?? "")) {
    const val = parseDecimal(workTokens.pop()!);
    if (Number.isFinite(val)) numericTail.unshift(val);
  }

  if (numericTail.length < 1) return null;

  // Remove optional small integers (lances) and Sim/Nao
  while (
    workTokens.length > 2 &&
    /^(\d{1,2}|sim|nao|não|s|n)$/i.test(workTokens[workTokens.length - 1] ?? "")
  ) {
    workTokens.pop();
  }

  // Find quantity: look for a numeric token
  // Check if last remaining token is quantity
  let quantity = NaN;
  let unit = "UN";

  // Check for unit + quantity at end of workTokens
  const lastToken = workTokens[workTokens.length - 1] ?? "";
  const secondLastToken = workTokens[workTokens.length - 2] ?? "";

  if (/^[\d.,]+$/.test(lastToken)) {
    quantity = parseDecimal(lastToken);
    workTokens.pop();
    if (isLikelyUnit(secondLastToken)) {
      unit = secondLastToken.toUpperCase();
      workTokens.pop();
    }
  } else if (isLikelyUnit(lastToken) && /^[\d.,]+$/.test(secondLastToken)) {
    unit = lastToken.toUpperCase();
    workTokens.pop();
    quantity = parseDecimal(secondLastToken);
    workTokens.pop();
  }

  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  // First token: might be seq number (skip it) or SKU
  let sku = workTokens[0] ?? "";
  let descStart = 1;

  // If first token is a small integer (1-3 digits, likely seq), skip it
  if (/^\d{1,3}$/.test(sku) && workTokens.length > 2) {
    sku = workTokens[1] ?? "";
    descStart = 2;
  }

  if (!sku || sku.length < 1) return null;
  // SKU should not be a pure large number (likely a total/value)
  if (/^\d{7,}$/.test(sku)) return null;

  const description = workTokens.slice(descStart).join(" ").trim();
  if (!description || description.length < 3) return null;

  // Assign prices from numericTail
  let unitPrice: number;
  let totalValue: number | null = null;

  if (numericTail.length >= 2) {
    unitPrice = numericTail[0];
    totalValue = numericTail[1];
  } else {
    unitPrice = numericTail[0];
  }

  if (!isPlausibleMoneyValue(unitPrice)) return null;

  return {
    sku,
    description,
    unit,
    quantity,
    unitPrice,
    totalValue,
    ipiPercent: null
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function looksLikeSummary(line: string): boolean {
  return /^\s*(valor\s+do\s+produto|valor\s+total|total\s+geral|sub\s*total|frete|peso|observa|notas|transpor|aten[cç][aã]o|prezad|valid|aprovo)/i.test(line);
}

function dedupeItems(items: ExtractedPdfItem[]): ExtractedPdfItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.sku.toLowerCase()}::${item.description.toLowerCase().slice(0, 30)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/pdf-parser-generic.test.ts
```

Expected: PASS

- [ ] **Step 5: Add edge case tests and fix any failures**

Add tests for edge cases discovered during implementation:
- Lines with only 1 item (should still work if format is clear)
- Lines with tabs instead of spaces
- SKUs that start with numbers (e.g., "0007N-BC")
- Very large quantities (1.500,00 = 1500)
- Unit prices with 4 decimal places (e.g., "239,5536")

Run tests again after adding edge cases:

```bash
npx vitest run tests/pdf-parser-generic.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/pdf/parser-generic.ts tests/pdf-parser-generic.test.ts
git commit -m "feat: add generic heuristic PDF parser for any supplier format"
```

---

### Task 5: Refactor pepa-store.ts to use new modules

**Files:**
- Modify: `lib/pepa-store.ts`

This task wires the new parser modules into the existing upload flow and removes all old parser functions.

- [ ] **Step 1: Update imports in pepa-store.ts**

At the top of `lib/pepa-store.ts`, add imports for the new modules and remove the `pdfParse` import:

Replace (line 8):
```typescript
import pdfParse from "pdf-parse";
```

With:
```typescript
import { extractTextFromPdf } from "@/lib/pdf/extract-text";
import { parseFlexPdf } from "@/lib/pdf/parser-flex";
import { parseGenericSupplierPdf } from "@/lib/pdf/parser-generic";
import { parseDecimal, isLikelyUnit, normalizeComparable, looksLikeHeader, looksLikeAddressOrMeta, isPlausibleMoneyValue, isPlausibleTotalValue } from "@/lib/pdf/parse-helpers";
```

- [ ] **Step 2: Rewrite extractRequestedItemsFromMirror() to use new modules**

Replace the function at lines 507-556 with:

```typescript
async function extractRequestedItemsFromMirror(file: UploadFileInput): Promise<RequestedItem[]> {
  const capability = classifyUploadFile(file);
  if (!capability.canUseTabularParser) {
    return [];
  }

  // PDF files: use dedicated Flex parser or generic parser
  if (file.name.toLowerCase().endsWith(".pdf")) {
    const { lines } = await extractTextFromPdf(file.buffer);
    if (lines.length === 0) return [];

    // Try Flex parser first (internal PEPA format)
    const flexItems = parseFlexPdf(lines);
    if (flexItems.length > 0) {
      return flexItems.map((item) => ({
        sku: item.sku,
        description: item.description,
        unit: item.unit,
        requestedQuantity: item.quantity,
        source: "real-supplier-quote" as const,
        baseUnitPrice: item.unitPrice > 0 ? item.unitPrice : undefined,
        supplierRef: item.supplierRef
      }));
    }

    // Fallback: try generic parser
    const genericItems = parseGenericSupplierPdf(lines);
    if (genericItems.length > 0) {
      return genericItems.map((item) => ({
        sku: item.sku,
        description: item.description,
        unit: item.unit,
        requestedQuantity: item.quantity,
        source: "real-supplier-quote" as const,
        baseUnitPrice: item.unitPrice > 0 ? item.unitPrice : undefined
      }));
    }

    return [];
  }

  // Non-PDF files: keep existing tabular parsing logic (CSV, XLSX, etc.)
  const table = await parseTabularFile(file);
  if (!table) {
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
```

- [ ] **Step 3: Rewrite parseSupplierFile() to use new modules**

Replace the function at lines 558-665 with:

```typescript
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

  // PDF files: use generic parser
  if (file.name.toLowerCase().endsWith(".pdf")) {
    const { lines } = await extractTextFromPdf(file.buffer);

    if (lines.length === 0) {
      return {
        supplierName,
        sourceFile: file.name,
        extractionStatus: "ocr-required",
        detectedFormat: "pdf",
        quotedItems: [],
        paymentTerms: "Nao lido",
        freightTerms: "Nao lido",
        quoteDate: null
      };
    }

    const genericItems = parseGenericSupplierPdf(lines);
    if (genericItems.length > 0) {
      return {
        supplierName,
        sourceFile: file.name,
        extractionStatus: "parsed",
        detectedFormat: "pdf",
        quotedItems: genericItems.map((item) => ({
          sku: item.sku,
          description: item.description,
          unitPrice: item.unitPrice,
          totalValue: item.totalValue,
          quotedQuantity: item.quantity
        })),
        paymentTerms: extractPdfPaymentTerms(lines),
        freightTerms: extractPdfFreightTerms(lines),
        quoteDate: extractPdfQuoteDate(lines)
      };
    }

    return {
      supplierName,
      sourceFile: file.name,
      extractionStatus: "manual-review",
      detectedFormat: "pdf",
      quotedItems: [],
      paymentTerms: extractPdfPaymentTerms(lines),
      freightTerms: "Nao informado",
      quoteDate: extractPdfQuoteDate(lines)
    };
  }

  // Non-PDF files: keep existing tabular parsing logic
  const table = await parseTabularFile(file);
  if (!table) {
    return {
      supplierName,
      sourceFile: file.name,
      extractionStatus: "manual-review",
      detectedFormat: capability.detectedFormat,
      quotedItems: [],
      paymentTerms: "Nao lido",
      freightTerms: "Nao lido",
      quoteDate: null
    };
  }

  const skuIndex = findHeaderIndex(table.headers, ["sku", "codigo", "codigo_produto", "item"]);
  const descriptionIndex = findHeaderIndex(table.headers, ["descricao", "produto", "item_descricao"]);
  const unitPriceIndex = findHeaderIndex(table.headers, [
    "preco_unitario", "preco_unit", "valor_unitario", "valor_unit", "unit_price"
  ]);
  const totalIndex = findHeaderIndex(table.headers, ["valor_total", "preco_total", "total"]);

  if ((skuIndex < 0 && descriptionIndex < 0) || unitPriceIndex < 0) {
    return {
      supplierName,
      sourceFile: file.name,
      extractionStatus: "manual-review",
      detectedFormat: capability.detectedFormat,
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
    extractionStatus: quotedItems.length > 0 ? "parsed" : "manual-review",
    detectedFormat: capability.detectedFormat,
    quotedItems,
    paymentTerms: extractPaymentTerms(table),
    freightTerms: extractFreightTerms(table),
    quoteDate: extractQuoteDate(table)
  };
}
```

- [ ] **Step 4: Add extractPdfFreightTerms() helper**

Add this near the existing `extractPdfPaymentTerms` function:

```typescript
function extractPdfFreightTerms(lines: string[]): string {
  for (const line of lines) {
    const freteMatch = line.match(/frete\s*:\s*(.+)/i);
    if (freteMatch) return freteMatch[1].trim();
    if (/\b(CIF|FOB)\b/i.test(line)) {
      const match = line.match(/\b(CIF|FOB)\b/i);
      return match ? match[1].toUpperCase() : "Nao informado";
    }
  }
  return "Nao informado";
}
```

- [ ] **Step 5: Delete old parser functions from pepa-store.ts**

Remove these functions entirely from `lib/pepa-store.ts`:

1. `parseCorFioRetornoOrcamentoPdfLines()` (lines 992-1059)
2. `parseFlexOrderPdfLines()` (lines 1066-1139)
3. `parseFlexOrderCellMode()` (lines 1142-1187)
4. `parseSupplierQuotePdfLines()` (lines 1194-1259)
5. `extractSupplierPostNcmData()` (lines 1265-1297)
6. `inferRequestedItemFromLine()` (lines 1369-1413)
7. `inferRequestedItemFromColumns()` (lines 1341-1367)
8. `inferRequestedItemsFromRows()` (lines 1321-1331)
9. `inferRequestedItemsFromLines()` (lines 1333-1339)
10. `inferSupplierQuoteRowFromLine()` and related infer functions (lines 1415-1527)
11. `dedupeRequestedItems()` and `dedupeSupplierQuoteRows()` (lines 1529-1551)
12. `extractTextLines()` (lines 960-984) — replaced by `extract-text.ts`
13. Debug console.log lines 519-520

Also remove duplicated helper functions that are now in `parse-helpers.ts`:
- `parseDecimal()` (lines 763-776)
- `isPlausibleMoneyValue()` (line 778)
- `isPlausibleTotalValue()` (line 782)
- `isLikelyUnit()` (lines 1571-1573)
- `looksLikeHeader()` (lines 1553-1569)
- `normalizeComparable()` (lines 1622-1629)

Keep these functions that are still used internally by pepa-store.ts for non-PDF paths:
- `parseTabularFile()`
- `findHeaderIndex()`
- `extractPaymentTerms()`, `extractFreightTerms()`, `extractQuoteDate()` (for tabular files)
- `extractPdfPaymentTerms()`, `extractPdfQuoteDate()`
- `inferSupplierName()`, `extractSupplierNameFromPdfLines()`
- `quoteMatchesItem()`
- `buildComparisonRows()`
- All persistence/export functions

- [ ] **Step 6: Update any remaining references**

Search for any remaining calls to deleted functions and update them. Ensure all imports from `parse-helpers.ts` are correct.

- [ ] **Step 7: Run all existing tests**

```bash
npx vitest run
```

Expected: All tests PASS. The existing integration tests use CSV files, so they should not be affected by PDF parser changes.

- [ ] **Step 8: Commit**

```bash
git add lib/pepa-store.ts
git commit -m "refactor: replace hardcoded PDF parsers with generic modules"
```

---

### Task 6: Clean up debug code

**Files:**
- Delete: `app/api/pepa/debug-pdf/route.ts`
- Delete: `scripts/debug-pdf.mjs`

- [ ] **Step 1: Delete temporary files**

```bash
rm app/api/pepa/debug-pdf/route.ts
rmdir app/api/pepa/debug-pdf
rm scripts/debug-pdf.mjs
```

- [ ] **Step 2: Verify no references to deleted files**

Search for any imports or references to the deleted files:

```bash
grep -r "debug-pdf" --include="*.ts" --include="*.tsx" --include="*.mjs" .
```

Expected: No results.

- [ ] **Step 3: Commit**

```bash
git add -A app/api/pepa/debug-pdf scripts/debug-pdf.mjs
git commit -m "chore: remove temporary PDF debug endpoint and script"
```

---

### Task 7: Integration test with real PDF files

**Files:**
- Modify: `tests/pepa-upload.integration.test.ts`

- [ ] **Step 1: Add integration test using real Corfio PDF text**

Add a test case to the existing integration test file that simulates the supplier PDF parsing flow with text extracted from the real Corfio PDF:

```typescript
it("parses supplier PDF with concatenated CORFIO format", async () => {
  const tenantId = "tenant-corfio-pdf";

  // Mirror as CSV (the Flex data)
  const mirrorCsv = [
    "sku,descricao,unidade,quantidade",
    "0007N-BC,Cordão paralelo 300V 2x1.5mm2 Branco,RL,8",
    "0008N-BC,Cordão paralelo 300V 2x2.5mm2 Branco,RL,19"
  ].join("\n");

  // Simulate parsed text lines from the CORFIO PDF
  // (In real usage, this comes from pdf-parse or Tesseract)
  const corfioLines = [
    "Pedido de Vendas ClientePEDIDO NR: 12040718",
    "Qt. Ped UNCódigoDescrição dos itensVariar   Mad.LancesVlr. UnitVlr.Prod.%IPI",
    "8,00RL0007N-BC        Cordão paralelo 300V 2x1,5mm2 - Branco                1239,55361.916,430,00",
    "19,00RL0008N-BC        Cordão paralelo 300V 2x2,5mm2 - Branco                1385,71057.328,500,00"
  ].join("\n");

  // Create a fake "PDF" that pdf-parse will treat as text
  // (We test the parsing logic, not pdf-parse itself)
  const snapshot = await persistPepaUploadRound({
    tenantId,
    mirrorFile: {
      name: "mirror.csv",
      type: "text/csv",
      buffer: Buffer.from(mirrorCsv)
    },
    supplierFiles: [
      {
        name: "Orcamento Corfio.txt",
        type: "text/plain",
        buffer: Buffer.from(corfioLines)
      }
    ]
  });

  const round = snapshot.latestRound;
  expect(round).toBeTruthy();
  expect(round!.suppliers.length).toBe(1);
  expect(round!.suppliers[0].quotedItems.length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/pepa-upload.integration.test.ts
git commit -m "test: add integration test for CORFIO concatenated PDF format"
```

---

### Task 8: Manual validation with real PDFs

This task verifies the parsers work with the actual PDF files provided by the user.

- [ ] **Step 1: Create a test script for real PDF validation**

```typescript
// scripts/test-real-pdfs.ts
import { readFileSync } from "node:fs";
import { extractTextFromPdf } from "../lib/pdf/extract-text";
import { parseFlexPdf } from "../lib/pdf/parser-flex";
import { parseGenericSupplierPdf } from "../lib/pdf/parser-generic";

async function main() {
  const files = [
    {
      path: "/Users/tiagotavares/Desktop/TAVARES/PEPA Distribuidora/CORFIO RETORNO ORCAMENTO FLEX.PDF",
      type: "flex" as const
    },
    {
      path: "/Users/tiagotavares/Desktop/TAVARES/PEPA Distribuidora/Orcamento Corfio.pdf",
      type: "supplier" as const
    }
  ];

  for (const file of files) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`File: ${file.path}`);
    console.log(`Type: ${file.type}`);
    console.log("=".repeat(80));

    const buffer = readFileSync(file.path);
    const { lines, method } = await extractTextFromPdf(buffer);
    console.log(`Extraction method: ${method}`);
    console.log(`Lines extracted: ${lines.length}`);

    if (lines.length === 0) {
      console.log("⚠ No text extracted — OCR may not be available or PDF is empty");
      continue;
    }

    if (file.type === "flex") {
      const items = parseFlexPdf(lines);
      console.log(`Flex items parsed: ${items.length}`);
      items.slice(0, 5).forEach((item, i) => {
        console.log(`  [${i}] SKU=${item.sku} | ${item.description} | qty=${item.quantity} ${item.unit} | price=${item.unitPrice}`);
      });
    } else {
      const items = parseGenericSupplierPdf(lines);
      console.log(`Supplier items parsed: ${items.length}`);
      items.slice(0, 5).forEach((item, i) => {
        console.log(`  [${i}] SKU=${item.sku} | ${item.description} | qty=${item.quantity} ${item.unit} | price=${item.unitPrice} | total=${item.totalValue}`);
      });
    }
  }
}

main().catch(console.error);
```

- [ ] **Step 2: Run manual validation**

```bash
npx tsx scripts/test-real-pdfs.ts
```

Review output:
- **Orcamento Corfio.pdf** (supplier): Should extract items with SKU, description, quantity, unit, unitPrice, totalValue
- **CORFIO RETORNO ORCAMENTO FLEX.PDF** (Flex internal): If OCR is available, should extract items. If OCR is not available (canvas not installed), will show 0 lines — this is expected and will be addressed when OCR dependencies are set up on the server.

- [ ] **Step 3: Fix any parsing issues found during manual validation**

If the generic parser doesn't correctly parse the Orcamento Corfio.pdf, adjust regex patterns in `parser-generic.ts` and add corresponding test cases.

- [ ] **Step 4: Clean up test script and commit**

```bash
rm scripts/test-real-pdfs.ts
git add -A
git commit -m "fix: adjust parsers based on real PDF validation"
```

---

## Post-Implementation Notes

### OCR Dependencies

The Tesseract OCR path requires:
- `tesseract.js` (installed via npm)
- `pdfjs-dist` (installed via npm)
- `canvas` npm package (native module — may need system libraries)

On macOS: `brew install pkg-config cairo pango libpng jpeg giflib librsvg`
On Linux (Dockerfile): `apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`

If `canvas` cannot be installed, the OCR path gracefully returns empty lines. Text-based PDFs still work via pdf-parse.

### Future Improvements

1. **Add more unit keyword aliases** to `parse-helpers.ts` as new supplier formats are discovered
2. **Improve OCR quality** by adjusting Tesseract settings (PSM mode, whitelist chars)
3. **Add supplier format learning** — log extraction success/failure rates per supplier for monitoring
