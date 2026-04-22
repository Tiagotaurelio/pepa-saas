// Simula exatamente o que acontece no n8n-import com dados RAYMA

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function normalizeCode(code) {
  return String(code ?? "").replace(/[-\/\s.]/g, "").toUpperCase().trim();
}

function normalizeFieldName(key) {
  return key.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s\-\.]/g, "");
}

const SUPPLIER_PRICE_FIELDS_NORM = ["precounitario", "precounit", "preco", "price", "unitprice", "valorunitario"];

function extractCode(item) {
  const CODE_FIELDS_NORM = ["codigo", "produto", "ref", "sku", "code", "itemcode", "productcode", "cod", "referencia"];
  for (const key of Object.keys(item)) {
    if (item[key] != null && CODE_FIELDS_NORM.includes(normalizeFieldName(key))) return String(item[key]);
  }
  return "";
}

function extractPrice(item) {
  for (const key of Object.keys(item)) {
    if (item[key] != null && SUPPLIER_PRICE_FIELDS_NORM.includes(normalizeFieldName(key))) {
      const v = Number(item[key]);
      if (!isNaN(v) && v > 0) return v;
    }
  }
  for (const key of Object.keys(item)) {
    const k = normalizeFieldName(key);
    if ((k.includes("preco") || k.includes("price") || k.includes("valor")) && (k.includes("unit") || k.includes("unitario"))) {
      const v = Number(item[key]);
      if (!isNaN(v) && v > 0) return v;
    }
  }
  return null;
}

function extractSupplierName(item) {
  const NAME_FIELDS_NORM = ["nomefornecedor", "fornecedor", "supplier", "empresa", "suppliername"];
  for (const key of Object.keys(item)) {
    if (item[key] && NAME_FIELDS_NORM.includes(normalizeFieldName(key))) return String(item[key]);
  }
  return "Fornecedor";
}

function extractUnit(item) {
  const UNIT_FIELDS_NORM = ["unidade", "un", "unit", "und"];
  for (const key of Object.keys(item)) {
    if (item[key] && UNIT_FIELDS_NORM.includes(normalizeFieldName(key))) return String(item[key]);
  }
  return "";
}

// ── SNAPSHOT existente (gerado pelo parser nativo do Flex PDF) ──
const existingComparisonRows = [
  { sku: "24804", supplierRef: "11",    description: "BOMBA SUBMERSA 1POL 950 FIRE 220V RAYMA",   unit: "UN", requestedQuantity: 16, baseUnitPrice: 218.00 },
  { sku: "24964", supplierRef: "17554", description: "BOMBA SUBMERSA 1POL SAPECONA 220V RAYMA",   unit: "UN", requestedQuantity: 4,  baseUnitPrice: 190.00 },
  { sku: "24803", supplierRef: "5",     description: "BOMBA SUBMERSA 3/4POL 750 FIRE 220V RAYMA", unit: "UN", requestedQuantity: 4,  baseUnitPrice: 181.00 },
  { sku: "24177", supplierRef: "4863",  description: "BOMBA SUBMERSA 3/4POL 800 220V RAYMA",      unit: "UN", requestedQuantity: 2,  baseUnitPrice: 271.00 },
];

// ── O que GPT extrai do PDF do fornecedor (3 variações de campo) ──
const variants = [
  {
    label: 'GPT usa "produto" e "preco_unitario" (caso mais comum)',
    supplierItems: [
      { cotacao_id: "sem_id", produto: "11",    preco_unitario: 245.79, unidade: "UN", nome_fornecedor: "RAYMA - INDUSTRIA E COMERCIO DE BOMBAS LTDA" },
      { cotacao_id: "sem_id", produto: "17554", preco_unitario: 202.73, unidade: "UN", nome_fornecedor: "RAYMA - INDUSTRIA E COMERCIO DE BOMBAS LTDA" },
      { cotacao_id: "sem_id", produto: "5",     preco_unitario: 204.95, unidade: "UN", nome_fornecedor: "RAYMA - INDUSTRIA E COMERCIO DE BOMBAS LTDA" },
      { cotacao_id: "sem_id", produto: "17524", preco_unitario: 290.43, unidade: "UN", nome_fornecedor: "RAYMA - INDUSTRIA E COMERCIO DE BOMBAS LTDA" },
    ]
  },
  {
    label: 'GPT usa "codigo" e "preco"',
    supplierItems: [
      { cotacao_id: "sem_id", codigo: "11",    preco: 245.79, unidade: "UN", nome_fornecedor: "RAYMA" },
      { cotacao_id: "sem_id", codigo: "17554", preco: 202.73, unidade: "UN", nome_fornecedor: "RAYMA" },
      { cotacao_id: "sem_id", codigo: "5",     preco: 204.95, unidade: "UN", nome_fornecedor: "RAYMA" },
      { cotacao_id: "sem_id", codigo: "17524", preco: 290.43, unidade: "UN", nome_fornecedor: "RAYMA" },
    ]
  },
  {
    label: 'GPT usa "item" na descricao (caso que causava bug)',
    supplierItems: [
      { cotacao_id: "sem_id", produto: "11",    item: "BOMBA RAYMA 950", preco_unitario: 245.79, unidade: "UN", nome_fornecedor: "RAYMA" },
      { cotacao_id: "sem_id", produto: "17554", item: "BOMBA RAYMA SAPECONA", preco_unitario: 202.73, unidade: "UN", nome_fornecedor: "RAYMA" },
      { cotacao_id: "sem_id", produto: "5",     item: "BOMBA RAYMA 750", preco_unitario: 204.95, unidade: "UN", nome_fornecedor: "RAYMA" },
      { cotacao_id: "sem_id", produto: "17524", item: "BOMBA RAYMA 800", preco_unitario: 290.43, unidade: "UN", nome_fornecedor: "RAYMA" },
    ]
  },
  {
    label: 'GPT usa campos COM ACENTO "código" e "preco_unitário" (bug real em produção)',
    supplierItems: [
      { cotacao_id: "sem_id", "código": "11",    "preco_unitário": 245.79, unidade: "UN", nome_fornecedor: "RAYMA" },
      { cotacao_id: "sem_id", "código": "17554", "preco_unitário": 202.73, unidade: "UN", nome_fornecedor: "RAYMA" },
      { cotacao_id: "sem_id", "código": "5",     "preco_unitário": 204.95, unidade: "UN", nome_fornecedor: "RAYMA" },
      { cotacao_id: "sem_id", "código": "17524", "preco_unitário": 290.43, unidade: "UN", nome_fornecedor: "RAYMA" },
    ]
  },
];

for (const { label, supplierItems } of variants) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`VARIANTE: ${label}`);
  console.log("=".repeat(60));

  const firstItem = supplierItems[0];
  const isSupplierOnly = !("sku_pepa" in firstItem);
  console.log(`isSupplierOnly = ${isSupplierOnly}`);

  if (!isSupplierOnly) {
    console.log("ERRO: formato não detectado corretamente!");
    continue;
  }

  const nomeFornecedor = extractSupplierName(firstItem);
  const codeMap = new Map();
  for (const s of supplierItems) {
    const key = normalizeCode(extractCode(s));
    if (key) codeMap.set(key, s);
  }

  console.log(`\nFornecedor: ${nomeFornecedor}`);
  console.log(`Códigos no mapa: ${[...codeMap.keys()].join(", ")}`);
  console.log("\nResultado do matching:");
  console.log("-".repeat(90));
  console.log("SKU PEPA | REF FORN | ITEM                                    | FLEX    | COTADO  | DIF%   | STATUS");
  console.log("-".repeat(90));

  for (const row of existingComparisonRows) {
    const refKey = normalizeCode(row.supplierRef ?? row.sku);
    const match = refKey ? codeMap.get(refKey) : undefined;
    const matchedPrice = match ? extractPrice(match) : null;

    if (!match || matchedPrice == null) {
      console.log(`${row.sku.padEnd(8)} | ${(row.supplierRef ?? "").padEnd(8)} | ${row.description.substring(0,40).padEnd(40)} | ${String(row.baseUnitPrice).padEnd(7)} | null    | –      | ocr-pending`);
      continue;
    }

    let preco = matchedPrice;
    const suppUnit = extractUnit(match).toUpperCase().trim();
    const flexUnit = row.unit.toUpperCase().trim();
    if (suppUnit === "RL" && flexUnit !== "RL") {
      const mMatch = row.description.match(/(\d+)\s*M\b/i);
      if (mMatch) preco = preco / parseInt(mMatch[1]);
    }

    const unitPrice = roundCurrency(preco);
    const total = roundCurrency(preco * row.requestedQuantity);
    const dif = ((unitPrice - row.baseUnitPrice) / row.baseUnitPrice * 100).toFixed(1);

    console.log(`${row.sku.padEnd(8)} | ${(row.supplierRef ?? "").padEnd(8)} | ${row.description.substring(0,40).padEnd(40)} | R$${String(row.baseUnitPrice).padEnd(6)} | R$${String(unitPrice).padEnd(6)} | ${dif.padStart(6)}% | quoted`);
  }
}

// Teste CORFIO (conversão RL → MT)
console.log(`\n${"=".repeat(60)}`);
console.log("VARIANTE: CORFIO (conversão RL → MT)");
console.log("=".repeat(60));

const corfioRows = [
  { sku: "1976", supplierRef: "W0106AZ", description: "CABO FLEXIVEL 750V 1.5MM 100M AZUL CORFIO", unit: "MT", requestedQuantity: 3000, baseUnitPrice: 1.08 },
];
const corfioSupplier = [
  { cotacao_id: "sem_id", produto: "W0106AZ", preco_unitario: 109.73, unidade: "RL", nome_fornecedor: "CORFIO" },
];

const corfioMap = new Map();
for (const s of corfioSupplier) {
  const key = normalizeCode(extractCode(s));
  if (key) corfioMap.set(key, s);
}

for (const row of corfioRows) {
  const refKey = normalizeCode(row.supplierRef);
  const match = corfioMap.get(refKey);
  const matchedPrice = match ? extractPrice(match) : null;
  let preco = matchedPrice;
  const suppUnit = match ? extractUnit(match).toUpperCase() : "";
  if (suppUnit === "RL" && row.unit !== "RL") {
    const mMatch = row.description.match(/(\d+)\s*M\b/i);
    if (mMatch) preco = preco / parseInt(mMatch[1]);
  }
  const unitPrice = roundCurrency(preco);
  const total = roundCurrency(preco * row.requestedQuantity);
  const dif = ((unitPrice - row.baseUnitPrice) / row.baseUnitPrice * 100).toFixed(1);
  console.log(`\n${row.sku} | ${row.supplierRef} | ${row.description}`);
  console.log(`Preço FORN: R$${matchedPrice}/RL ÷ 100M = R$${unitPrice}/MT`);
  console.log(`Preço Flex: R$${row.baseUnitPrice}/MT → Diferença: ${dif}%`);
  console.log(`Total: R$${total} (${row.requestedQuantity} MT × R$${unitPrice})`);
}
