import { NextRequest, NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/auth";
import { getTenantName, updateTenantName } from "@/lib/db";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const name = await getTenantName(session.tenantId);
  return NextResponse.json({ name });
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { name?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Nome da empresa nao pode ser vazio." }, { status: 400 });
  }

  try {
    await updateTenantName(session.tenantId, body.name);
    return NextResponse.json({ ok: true, name: body.name.trim() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar." },
      { status: 400 }
    );
  }
}
