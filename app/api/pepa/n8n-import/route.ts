import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { savePepaSnapshot, updatePepaSnapshot, loadPepaSnapshotByRoundId } from "@/lib/db";
import type {
  ComparisonOffer,
  ComparisonRow,
  PepaAuditEvent,
  PepaSnapshot,
  SupplierOffer,
} from "@/lib/pepa-quotation-domain";

type N8NItem = {
  sku_pepa?: string | number;
  sku_forn?: string | number;
  item?: string;
  qtd_pedida?: number | string;
  unidade?: string;
  fornecedor?: string;
  preco_flex?: number | null;
  preco_cotado?: number | null;
  total?: number | null;
};

// Supplier-only format: GPT extracts only the supplier table
// GPT may use different field names — we normalize on read
type SupplierExtractItem = Record<string, unknown>;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeCode(code: string | number | undefined | null): string {
  return String(code ?? "").replace(/[-\/\s.]/g, "").toUpperCase().trim();
}

export async function POST(request: NextRequest) {
  const token = process.env.PEPA_N8N_TOKEN;
  const defaultTenantId = process.env.PEPA_N8N_TENANT_ID ?? "tenant-demo";

  const authHeader = request.headers.get("Authorization");
  if (!token || authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let bodyObj: Record<string, unknown>;
  if (Array.isArray(body)) {
    const first = body[0] as Record<string, unknown> | undefined;
    if (first && (Array.isArray(first.data) || Array.isArray(first.items))) {
      bodyObj = first;
    } else {
      bodyObj = { items: body };
    }
  } else {
    bodyObj = body as Record<string, unknown>;
  }

  const existingRoundId =
    (url.searchParams.get("roundId") || undefined) ??
    (bodyObj.roundId as string | undefined);
  const tenantId =
    url.searchParams.get("tenantId") ||
    (bodyObj.tenantId as string | undefined) ||
    defaultTenantId;

  let rawItems: unknown = bodyObj.items ?? bodyObj.data;
  if (rawItems === undefined) {
    if (bodyObj.sku_pepa !== undefined || bodyObj.item !== undefined || bodyObj.fornecedor !== undefined) {
      rawItems = [bodyObj];
    } else {
      rawItems = bodyObj;
    }
  }

  if (!Array.isArray(rawItems)) {
    return NextResponse.json({ error: "Expected array of items" }, { status: 400 });
  }
  if (rawItems.length === 0) {
    return NextResponse.json({ error: "Empty items array" }, { status: 400 });
  }

  const firstItem = rawItems[0] as Record<string, unknown>;

  // Normalize field name: lowercase, strip accents, strip separators
  // Handles GPT returning "código" instead of "codigo", "preco_unitário" vs "preco_unitario", etc.
  function normalizeFieldName(key: string): string {
    return key
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[_\s\-\.]/g, "");
  }

  // Log exact payload for debugging (console.log → stdout → visible in EasyPanel)
  console.log("[n8n-import] firstItem keys:", JSON.stringify(Object.keys(firstItem)));
  console.log("[n8n-import] firstItem:", JSON.stringify(firstItem));
  console.log("[n8n-import] rawItems.length:", (rawItems as unknown[]).length);
  console.log("[n8n-import] existingRoundId:", existingRoundId);

  // sku_pepa must look like a real PEPA SKU (numeric 1-6 digits, e.g. "24804")
  // Values like "sem_id", "undefined", "", or any non-numeric string = supplier-only format
  const skuPepaValue = firstItem["sku_pepa"];
  const skuPepaStr = String(skuPepaValue ?? "").trim();
  const hasRealSkuPepa = skuPepaStr !== "" && skuPepaStr !== "undefined" && /^\d{1,8}$/.test(skuPepaStr);
  const isSupplierOnly = !hasRealSkuPepa;
  console.log("[n8n-import] skuPepaValue:", skuPepaValue, "skuPepaStr:", skuPepaStr, "| isSupplierOnly:", isSupplierOnly);

  const SUPPLIER_PRICE_FIELDS_NORM = ["precounitario", "precounit", "preco", "price", "unitprice", "valorunitario"];

  // Extract code — compares normalized field names so "código" matches "codigo"
  function extractCode(item: Record<string, unknown>): string {
    const CODE_FIELDS_NORM = ["codigo", "produto", "ref", "sku", "code", "itemcode", "productcode", "cod", "referencia"];
    for (const key of Object.keys(item)) {
      if (item[key] != null && CODE_FIELDS_NORM.includes(normalizeFieldName(key))) {
        return String(item[key]);
      }
    }
    return "";
  }

  // Extract unit price — handles accented field names + fuzzy fallback
  function extractPrice(item: Record<string, unknown>): number | null {
    for (const key of Object.keys(item)) {
      if (item[key] != null && SUPPLIER_PRICE_FIELDS_NORM.includes(normalizeFieldName(key))) {
        const v = Number(item[key]);
        if (!isNaN(v) && v > 0) return v;
      }
    }
    // Fallback: any field containing "preco"/"price"/"valor" + "unit"/"unitario" (accent-stripped)
    for (const key of Object.keys(item)) {
      const k = normalizeFieldName(key);
      if ((k.includes("preco") || k.includes("price") || k.includes("valor")) && (k.includes("unit") || k.includes("unitario"))) {
        const v = Number(item[key]);
        if (!isNaN(v) && v > 0) return v;
      }
    }
    return null;
  }

  // Extract supplier name — handles accented variants
  function extractSupplierName(item: Record<string, unknown>): string {
    const NAME_FIELDS_NORM = ["nomefornecedor", "fornecedor", "supplier", "empresa", "suppliername"];
    for (const key of Object.keys(item)) {
      if (item[key] && NAME_FIELDS_NORM.includes(normalizeFieldName(key))) {
        return String(item[key]);
      }
    }
    return "Fornecedor";
  }

  // Extract unit from various field names
  function extractUnit(item: Record<string, unknown>): string {
    const UNIT_FIELDS_NORM = ["unidade", "un", "unit", "und"];
    for (const key of Object.keys(item)) {
      if (item[key] && UNIT_FIELDS_NORM.includes(normalizeFieldName(key))) {
        return String(item[key]);
      }
    }
    return "";
  }

  if (isSupplierOnly) {
    if (!existingRoundId) {
      return NextResponse.json({ error: "roundId obrigatório para formato de cotação" }, { status: 400 });
    }

    const existing = await loadPepaSnapshotByRoundId(tenantId, existingRoundId);
    if (!existing) {
      console.log("[n8n-import] ERRO: rodada nao encontrada para roundId:", existingRoundId);
      return NextResponse.json({ error: "Rodada não encontrada" }, { status: 404 });
    }

    const supplierItems = rawItems as SupplierExtractItem[];
    const nomeFornecedor = extractSupplierName(supplierItems[0] ?? {});

    // Build lookup map: normalized code → supplier item
    const codeMap = new Map<string, SupplierExtractItem>();
    for (const s of supplierItems) {
      const key = normalizeCode(extractCode(s));
      if (key) codeMap.set(key, s);
    }

    console.log("[n8n-import] codeMap keys:", JSON.stringify([...codeMap.keys()]));
    console.log("[n8n-import] nomeFornecedor:", nomeFornecedor);

    const existingRows: ComparisonRow[] = existing.comparisonRows ?? [];
    console.log("[n8n-import] existingRows count:", existingRows.length);
    existingRows.forEach((r, i) => console.log(`[n8n-import] row[${i}] sku=${r.sku} supplierRef=${r.supplierRef} unit=${r.unit} qty=${r.requestedQuantity}`));

    const updatedRows: ComparisonRow[] = existingRows.map((row) => {
      // Match by supplierRef (Ref Fornecedor from Flex), fallback to sku
      const refKey = normalizeCode(row.supplierRef ?? row.sku);
      const match = refKey ? codeMap.get(refKey) : undefined;

      const matchedPrice = match ? extractPrice(match) : null;

      if (!match || matchedPrice == null) {
        return { ...row, itemStatus: "ocr-pending" as const, offers: [] };
      }

      let preco = matchedPrice;

      // Unit conversion: RL (rolo) → MT (metros) for cables
      const flexUnit = (row.unit ?? "").toUpperCase().trim();
      const suppUnit = extractUnit(match).toUpperCase().trim();
      if (suppUnit === "RL" && flexUnit !== "RL") {
        const mMatch = (row.description ?? "").match(/(\d+)\s*M\b/i);
        if (mMatch && parseInt(mMatch[1]) > 0) {
          preco = preco / parseInt(mMatch[1]);
        } else {
          return { ...row, itemStatus: "ocr-pending" as const, offers: [] };
        }
      }

      const unitPrice = roundCurrency(preco);
      const totalValue = roundCurrency(preco * row.requestedQuantity);

      const offer: ComparisonOffer = {
        supplierName: nomeFornecedor,
        unitPrice,
        totalValue,
      };

      return {
        ...row,
        bestSupplier: nomeFornecedor,
        bestUnitPrice: unitPrice,
        bestTotal: totalValue,
        itemStatus: "quoted" as const,
        offers: [offer],
      };
    });

    const quotedItems = updatedRows.filter((r) => r.itemStatus === "quoted").length;
    const quotedValue = roundCurrency(updatedRows.reduce((sum, r) => sum + (r.bestTotal ?? 0), 0));
    const createdAt = new Date().toISOString();

    console.log("[n8n-import] quotedItems:", quotedItems, "of", updatedRows.length);
    updatedRows.forEach((r, i) => console.log(`[n8n-import] updated[${i}] sku=${r.sku} supplier=${r.bestSupplier} price=${r.bestUnitPrice} status=${r.itemStatus}`));

    const supplier: SupplierOffer = {
      supplierName: nomeFornecedor,
      sourceFile: "n8n-import",
      extractionStatus: "parsed" as const,
      paymentTerms: "",
      freightTerms: "",
      quoteDate: new Date().toISOString().split("T")[0],
      coverageCount: quotedItems,
      quotedItemsCount: quotedItems,
      totalValue: quotedValue || null,
      averageUnitPrice: null,
      notes: "Importado via N8N",
    };

    const auditEvent: PepaAuditEvent = {
      id: randomUUID(),
      type: "round_uploaded",
      title: "Preços extraídos via IA (N8N)",
      description: `${quotedItems} de ${updatedRows.length} itens cotados automaticamente.`,
      occurredAt: createdAt,
    };

    const existingRound = existing.latestRound ?? {
      id: existingRoundId,
      createdAt,
      mirrorFileName: "n8n-import",
      supplierFilesCount: 1,
      requestedItemsCount: updatedRows.length,
    };
    const updatedSnapshot: PepaSnapshot = {
      latestRound: {
        ...existingRound,
        quotedItems,
        coverageRate: updatedRows.length > 0 ? Math.round((quotedItems / updatedRows.length) * 100) : 0,
        status: "open" as const,
      },
      attachments: existing.attachments ?? [],
      suppliers: [supplier],
      comparisonRows: updatedRows,
      auditEvents: [...(existing.auditEvents ?? []), auditEvent],
      totals: {
        attachmentsReceived: existing.totals?.attachmentsReceived ?? 2,
        parsedAttachments: 2,
        ocrQueue: 0,
        requestedItems: updatedRows.length,
        quotedItems,
        coverageRate: updatedRows.length > 0 ? Math.round((quotedItems / updatedRows.length) * 100) : 0,
        quotedValue,
      },
    };

    await updatePepaSnapshot({ roundId: existingRoundId, tenantId, snapshot: updatedSnapshot });
    return NextResponse.json({
      ok: true,
      roundId: existingRoundId,
      quotedItems,
      totalItems: updatedRows.length,
      path: "supplier-only",
      debug: updatedRows.map(r => ({ sku: r.sku, supplierRef: r.supplierRef, supplier: r.bestSupplier, price: r.bestUnitPrice, status: r.itemStatus }))
    });
  }

  // ── Legacy format: full items with sku_pepa, sku_forn, preco_cotado etc ──
  const items = rawItems as N8NItem[];

  const supplierMap = new Map<string, N8NItem[]>();
  for (const item of items) {
    const name = item.fornecedor ?? "Desconhecido";
    if (!supplierMap.has(name)) supplierMap.set(name, []);
    supplierMap.get(name)!.push(item);
  }

  const suppliers: SupplierOffer[] = Array.from(supplierMap.entries()).map(([supplierName, supplierItems]) => {
    const quotedItems = supplierItems.filter((i) => i.preco_cotado != null);
    const totalValue = supplierItems.reduce((sum, i) => sum + (i.total ?? 0), 0);
    const avgUnitPrice =
      quotedItems.length > 0
        ? quotedItems.reduce((sum, i) => sum + (i.preco_cotado ?? 0), 0) / quotedItems.length
        : null;
    return {
      supplierName,
      sourceFile: "n8n-import",
      extractionStatus: "parsed" as const,
      paymentTerms: "",
      freightTerms: "",
      quoteDate: new Date().toISOString().split("T")[0],
      coverageCount: quotedItems.length,
      quotedItemsCount: quotedItems.length,
      totalValue: totalValue ? roundCurrency(totalValue) : null,
      averageUnitPrice: avgUnitPrice ? roundCurrency(avgUnitPrice) : null,
      notes: "Importado via N8N",
    };
  });

  const comparisonRows: ComparisonRow[] = items.map((item, idx) => {
    const offers: ComparisonOffer[] =
      item.preco_cotado != null
        ? [{ supplierName: item.fornecedor ?? "Desconhecido", unitPrice: item.preco_cotado, totalValue: item.total ?? null }]
        : [];

    return {
      sourceOrder: idx,
      sku: String(item.sku_pepa ?? ""),
      description: item.item ?? "",
      unit: item.unidade ?? "",
      requestedQuantity: Number(item.qtd_pedida) || 0,
      bestSupplier: offers.length > 0 ? (item.fornecedor ?? null) : null,
      bestUnitPrice: item.preco_cotado ?? null,
      bestTotal: item.total ?? null,
      itemStatus: item.preco_cotado != null ? ("quoted" as const) : ("ocr-pending" as const),
      source: "real-supplier-quote" as const,
      supplierRef: item.sku_forn != null ? String(item.sku_forn) : undefined,
      baseUnitPrice: item.preco_flex ?? null,
      offers,
    };
  });

  const quotedItems = comparisonRows.filter((r) => r.itemStatus === "quoted").length;
  const quotedValue = roundCurrency(comparisonRows.reduce((sum, r) => sum + (r.bestTotal ?? 0), 0));
  const createdAt = new Date().toISOString();

  const auditEvent: PepaAuditEvent = {
    id: randomUUID(),
    type: "round_uploaded",
    title: "Dados enriquecidos via IA (N8N)",
    description: `${items.length} itens extraídos automaticamente pelo GPT-4o.`,
    occurredAt: createdAt,
  };

  if (existingRoundId) {
    const existing = await loadPepaSnapshotByRoundId(tenantId, existingRoundId);
    const updatedSnapshot: PepaSnapshot = {
      latestRound: {
        ...(existing?.latestRound ?? {
          id: existingRoundId,
          createdAt,
          mirrorFileName: "n8n-import",
          supplierFilesCount: supplierMap.size,
        }),
        requestedItemsCount: items.length,
        quotedItems,
        coverageRate: Math.round((quotedItems / items.length) * 100),
        status: "open",
      },
      attachments: existing?.attachments ?? [],
      suppliers,
      comparisonRows,
      auditEvents: [...(existing?.auditEvents ?? []), auditEvent],
      totals: {
        attachmentsReceived: existing?.totals?.attachmentsReceived ?? supplierMap.size + 1,
        parsedAttachments: supplierMap.size + 1,
        ocrQueue: 0,
        requestedItems: items.length,
        quotedItems,
        coverageRate: Math.round((quotedItems / items.length) * 100),
        quotedValue,
      },
    };

    await updatePepaSnapshot({ roundId: existingRoundId, tenantId, snapshot: updatedSnapshot });
    return NextResponse.json({ ok: true, roundId: existingRoundId, quotedItems, totalItems: items.length, path: "legacy" });
  }

  const roundId = randomUUID();
  const snapshot: PepaSnapshot = {
    latestRound: {
      id: roundId,
      createdAt,
      mirrorFileName: "n8n-import",
      supplierFilesCount: supplierMap.size,
      requestedItemsCount: items.length,
      attachmentsReceived: supplierMap.size + 1,
      quotedItems,
      coverageRate: Math.round((quotedItems / items.length) * 100),
      status: "open",
    },
    attachments: [],
    suppliers,
    comparisonRows,
    auditEvents: [auditEvent],
    totals: {
      attachmentsReceived: supplierMap.size + 1,
      parsedAttachments: supplierMap.size + 1,
      ocrQueue: 0,
      requestedItems: items.length,
      quotedItems,
      coverageRate: Math.round((quotedItems / items.length) * 100),
      quotedValue,
    },
  };

  await savePepaSnapshot({ id: roundId, tenantId, createdAt, mirrorFileName: "n8n-import", supplierFilesCount: supplierMap.size, snapshot });
  return NextResponse.json({ ok: true, roundId, quotedItems, totalItems: items.length, path: "legacy-new" });
}
