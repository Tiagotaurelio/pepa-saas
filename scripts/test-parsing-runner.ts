/**
 * Test runner: exercises parsers against all unique tenant-demo files.
 * Run with: npx tsx scripts/test-parsing-runner.ts
 */
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, extname } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import pdfParse from "pdf-parse";
import { parseGenericSupplierPdf } from "../lib/pdf/parser-generic";
import { parseFlexPdf } from "../lib/pdf/parser-flex";
import { parseDecimal, isPlausibleMoneyValue } from "../lib/pdf/parse-helpers";

const PROJECT_ROOT = join(__dirname, "..");
const UPLOADS_DIR = join(PROJECT_ROOT, "data", "pepa-uploads", "tenant-demo");

// ── Find unique files ──
function findUniqueFiles(): Map<string, string> {
  const seen = new Map<string, string>();
  const uuidDirs = readdirSync(UPLOADS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(UPLOADS_DIR, d.name));
  for (const dir of uuidDirs) {
    try {
      for (const f of readdirSync(dir)) {
        if (!seen.has(f)) seen.set(f, join(dir, f));
      }
    } catch {}
  }
  return seen;
}

// ── Header matching (mirrors pepa-store.ts logic) ──
function normalizeHeader(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  let idx = headers.findIndex((h) => aliases.includes(normalizeHeader(h)));
  if (idx >= 0) return idx;
  idx = headers.findIndex((h) => { const n = normalizeHeader(h); return aliases.some((a) => n.startsWith(a)); });
  if (idx >= 0) return idx;
  return headers.findIndex((h) => { const n = normalizeHeader(h); return aliases.some((a) => n.includes(a)); });
}

// ── Table extraction via pdfjs worker ──
function extractTable(filePath: string): string[][] {
  const tempPath = join(tmpdir(), `pepa-test-${randomUUID()}.pdf`);
  const buffer = readFileSync(filePath);
  writeFileSync(tempPath, buffer);
  try {
    const tableScript = join(PROJECT_ROOT, "scripts", "pdf-to-table.mjs");
    const out = execFileSync("node", [tableScript, tempPath], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
      encoding: "utf-8",
    });
    return JSON.parse(out.trim());
  } catch {
    return [];
  } finally {
    try { unlinkSync(tempPath); } catch {}
  }
}

// ── CSV test ──
function testCsv(filePath: string, fileName: string) {
  const content = readFileSync(filePath, "utf-8");
  const allLines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  console.log(`\n[RAW CSV - first 5 lines]`);
  for (const l of allLines.slice(0, 5)) console.log(`  ${l}`);

  const firstLine = allLines[0] || "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : firstLine.includes("|") ? "|" : ",";
  const delimName = delimiter === "\t" ? "TAB" : delimiter;

  const headers = firstLine.split(delimiter).map((h) => h.trim());
  console.log(`\n[PARSER RESULTS]`);
  console.log(`  Delimiter: ${delimName}`);
  console.log(`  Headers: ${headers.join(" | ")}`);

  let descIdx = findHeaderIndex(headers, ["descricao", "item_descricao", "nome", "material"]);
  let skuIdx = findHeaderIndex(headers, ["sku", "codigo", "codigo_produto", "cod", "produto"]);
  if (skuIdx >= 0 && skuIdx === descIdx) skuIdx = -1;
  if (descIdx < 0 && skuIdx < 0) {
    descIdx = findHeaderIndex(headers, ["produto"]);
  }

  const priceAliases = ["preco_unitario", "preco_unit", "valor_unitario", "valor_unit", "unit_price", "vl._unitario", "vl_unitario", "preco_liq", "preco", "preco_final"];
  let priceIdx = -1;
  for (let i = 0; i < headers.length; i++) {
    const norm = normalizeHeader(headers[i]);
    if (norm.includes("sem_ipi") || norm.includes("qtde_x") || norm.includes("x_preco")) continue;
    if (priceAliases.includes(norm) || priceAliases.some((a) => norm.startsWith(a))) {
      priceIdx = i;
      break;
    }
  }
  const totalIdx = findHeaderIndex(headers, ["valor_total", "preco_total", "total", "vl._total", "vl_total"]);

  console.log(`  Column mapping: SKU[${skuIdx}]="${skuIdx >= 0 ? headers[skuIdx] : "NOT FOUND"}" DESC[${descIdx}]="${descIdx >= 0 ? headers[descIdx] : "NOT FOUND"}" PRICE[${priceIdx}]="${priceIdx >= 0 ? headers[priceIdx] : "NOT FOUND"}" TOTAL[${totalIdx}]="${totalIdx >= 0 ? headers[totalIdx] : "NOT FOUND"}"`);

  if ((skuIdx < 0 && descIdx < 0) || priceIdx < 0) {
    console.log(`  *** PROBLEM: Cannot find required columns (sku/desc + price)!`);
  }

  const dataRows = allLines.slice(1);
  let parsedCount = 0;
  let failedCount = 0;
  const samples: string[] = [];

  for (const row of dataRows) {
    const cols = row.split(delimiter).map((c) => c.trim());
    if (!cols.some(Boolean)) continue;
    const rawPrice = priceIdx >= 0 ? cols[priceIdx] : "";
    const price = parseDecimal(rawPrice || "");
    if (Number.isFinite(price) && price > 0 && isPlausibleMoneyValue(price)) {
      parsedCount++;
      if (samples.length < 3) {
        samples.push(`    SKU="${skuIdx >= 0 ? cols[skuIdx] : ""}" DESC="${descIdx >= 0 ? (cols[descIdx] || "").slice(0, 50) : ""}" RAW_PRICE="${rawPrice}" => ${price} TOTAL="${totalIdx >= 0 ? cols[totalIdx] : ""}"`);
      }
    } else if (cols.some(Boolean)) {
      failedCount++;
    }
  }

  console.log(`  Parsed: ${parsedCount}/${dataRows.filter(r => r.split(delimiter).some(Boolean)).length} data rows (${failedCount} failed/skipped)`);
  if (samples.length > 0) {
    console.log(`  Sample items:`);
    for (const s of samples) console.log(s);
  }
  if (parsedCount === 0) {
    console.log(`  *** PROBLEM: No items parsed! Check header mapping above.`);
  }
}

// ── PDF test ──
async function testPdf(filePath: string, fileName: string) {
  const buffer = readFileSync(filePath);

  // 1) pdf-parse text
  let lines: string[] = [];
  try {
    const parsed = await pdfParse(buffer);
    lines = parsed.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch (e: any) {
    console.log(`  pdf-parse ERROR: ${e.message}`);
  }

  console.log(`\n[RAW PDF TEXT - first 20 lines (${lines.length} total)]`);
  for (const l of lines.slice(0, 20)) console.log(`  ${l}`);

  console.log(`\n[PARSER RESULTS]`);

  // 2) Flex parser
  let flexCount = 0;
  try {
    const flexItems = parseFlexPdf(lines);
    flexCount = flexItems.length;
    console.log(`  Flex parser: ${flexCount} items`);
    for (const item of flexItems.slice(0, 3)) {
      console.log(`    SKU="${item.sku}" DESC="${item.description.slice(0, 60)}" QTY=${item.quantity} ${item.unit} PRICE=${item.unitPrice} TOTAL=${item.totalValue}`);
    }
  } catch (e: any) {
    console.log(`  Flex parser ERROR: ${e.message}`);
  }

  // 3) Generic parser
  let genericCount = 0;
  try {
    const genericItems = parseGenericSupplierPdf(lines);
    genericCount = genericItems.length;
    console.log(`  Generic parser: ${genericCount} items`);
    for (const item of genericItems.slice(0, 3)) {
      console.log(`    SKU="${item.sku}" DESC="${item.description.slice(0, 60)}" QTY=${item.quantity} ${item.unit} PRICE=${item.unitPrice} TOTAL=${item.totalValue}`);
    }
  } catch (e: any) {
    console.log(`  Generic parser ERROR: ${e.message}`);
  }

  // 4) Table extraction
  let tableCount = 0;
  try {
    const tableRows = extractTable(filePath);
    tableCount = tableRows.length;
    console.log(`  Table extraction: ${tableCount} rows`);
    for (const row of tableRows.slice(0, 3)) {
      console.log(`    ${row.join(" | ")}`);
    }
  } catch (e: any) {
    console.log(`  Table extraction ERROR: ${e.message}`);
  }

  // Verdict
  const bestCount = Math.max(flexCount, genericCount, tableCount);
  if (bestCount === 0) {
    console.log(`  *** PROBLEM: No parser extracted any items from this PDF!`);
  } else {
    const winner = flexCount >= genericCount && flexCount >= tableCount ? "Flex"
      : genericCount >= tableCount ? "Generic" : "Table";
    console.log(`  BEST: ${winner} parser (${bestCount} items)`);
  }
}

// ── Main ──
async function main() {
  const uniqueFiles = findUniqueFiles();
  console.log(`\n${"=".repeat(80)}`);
  console.log(`PEPA-SAAS FILE PARSING TEST`);
  console.log(`Found ${uniqueFiles.size} unique files`);
  console.log(`${"=".repeat(80)}`);

  const fileOrder = [
    "fornecedor-alpha.csv",
    "fornecedor-beta.csv",
    "mirror-smoke.csv",
    "flex_tramontina.csv",
    "tramontina_retorno.csv",
    "Orcamento_Fertac.csv",
    "cotacao_Flex_Fertac.csv",
    "Orcamento_Corfio.pdf",
    "CORFIO_RETORNO_ORCAMENTO_FLEX__1_.pdf",
    "Flex_Rayma.pdf",
    "JOMARCA_ORC_FORNEC.pdf",
    "Orcamento_Fertac.pdf",
    "cotacao_Flex_Fertac.pdf",
    "flex_tramontina.pdf",
    "tramontina_retorno.pdf",
  ];

  for (const [name] of uniqueFiles) {
    if (!fileOrder.includes(name)) fileOrder.push(name);
  }

  for (const fileName of fileOrder) {
    const filePath = uniqueFiles.get(fileName);
    if (!filePath) continue;

    console.log(`\n${"~".repeat(80)}`);
    console.log(`FILE: ${fileName}`);
    console.log(`${"~".repeat(80)}`);

    const ext = extname(fileName).toLowerCase();
    if (ext === ".csv") {
      testCsv(filePath, fileName);
    } else if (ext === ".pdf") {
      await testPdf(filePath, fileName);
    }
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("DONE");
  console.log(`${"=".repeat(80)}\n`);
}

main();
