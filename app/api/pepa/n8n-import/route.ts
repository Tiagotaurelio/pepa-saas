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

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
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

  // Normalise body: N8N may send [{ data: [...] }], { data: [...] }, { items: [...] }, or a flat array
  let bodyObj: Record<string, unknown>;
  if (Array.isArray(body)) {
    // [{ data: [...], roundId?, tenantId? }] or flat array of items
    const first = body[0] as Record<string, unknown> | undefined;
    if (first && (Array.isArray(first.data) || Array.isArray(first.items))) {
      bodyObj = first;
    } else {
      bodyObj = { items: body };
    }
  } else {
    bodyObj = body as Record<string, unknown>;
  }

  // roundId / tenantId: query param takes precedence over body
  const existingRoundId =
    (url.searchParams.get("roundId") || undefined) ??
    (bodyObj.roundId as string | undefined);
  const tenantId =
    url.searchParams.get("tenantId") ||
    (bodyObj.tenantId as string | undefined) ||
    defaultTenantId;

  const rawItems = bodyObj.items ?? bodyObj.data ?? bodyObj;
  let items: N8NItem[];
  if (Array.isArray(rawItems)) {
    items = rawItems;
  } else {
    return NextResponse.json({ error: "Expected array of items" }, { status: 400 });
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "Empty items array" }, { status: 400 });
  }

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
        ? [
            {
              supplierName: item.fornecedor ?? "Desconhecido",
              unitPrice: item.preco_cotado,
              totalValue: item.total ?? null,
            },
          ]
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
    return NextResponse.json({ ok: true, roundId: existingRoundId, quotedItems, totalItems: items.length });
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
  return NextResponse.json({ ok: true, roundId, quotedItems, totalItems: items.length });
}
