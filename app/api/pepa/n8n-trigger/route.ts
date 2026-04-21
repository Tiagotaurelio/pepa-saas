import { NextRequest, NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/auth";
import { loadPepaSnapshotByRoundId, loadLatestPepaSnapshot } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.PEPA_N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "N8N webhook não configurado (PEPA_N8N_WEBHOOK_URL)" }, { status: 500 });
  }

  const token = process.env.PEPA_N8N_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Token N8N não configurado (PEPA_N8N_TOKEN)" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const roundId: string | undefined = body?.roundId;

  const snapshot = roundId
    ? await loadPepaSnapshotByRoundId(session.tenantId, roundId)
    : await loadLatestPepaSnapshot(session.tenantId);

  if (!snapshot?.latestRound) {
    return NextResponse.json({ error: "Nenhuma rodada encontrada" }, { status: 404 });
  }

  const round = snapshot.latestRound;
  const attachments = snapshot.attachments ?? [];

  const baseUrl = process.env.PEPA_PUBLIC_DOMAIN
    ? `https://${process.env.PEPA_PUBLIC_DOMAIN.replace(/^https?:\/\//, "")}`
    : "https://pepa.tavarestech.cloud";

  const mirror = attachments.find((a) => a.role === "mirror");
  const suppliers = attachments.filter((a) => a.role === "supplier-quote");

  if (!mirror?.storageKey) {
    return NextResponse.json({ error: "Arquivo-base não encontrado no storage" }, { status: 400 });
  }
  if (suppliers.length === 0) {
    return NextResponse.json({ error: "Nenhum arquivo de fornecedor encontrado" }, { status: 400 });
  }

  function buildFileUrl(storageKey: string) {
    const prefix = process.env.PEPA_OBJECT_STORAGE_PREFIX?.trim();
    const segments = prefix
      ? storageKey.replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`), "")
      : storageKey;
    return `${baseUrl}/api/pepa/n8n-file/${segments}`;
  }

  const payload = {
    roundId: round.id,
    tenantId: session.tenantId,
    fileToken: token,
    flexFileUrl: buildFileUrl(mirror.storageKey),
    supplierFileUrls: suppliers.map((s) => buildFileUrl(s.storageKey!)).filter(Boolean),
  };

  const n8nResponse = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!n8nResponse.ok) {
    const errText = await n8nResponse.text().catch(() => "");
    return NextResponse.json({ error: `N8N retornou erro: ${n8nResponse.status} ${errText}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, roundId: round.id });
}
