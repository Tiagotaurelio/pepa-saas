import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { toggleUserActive } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

  const body = (await request.json()) as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId obrigatorio." }, { status: 400 });
  if (body.userId === session.userId) return NextResponse.json({ error: "Voce nao pode desativar sua propria conta." }, { status: 400 });

  try {
    const result = await toggleUserActive({ userId: body.userId, tenantId: session.tenantId });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao alterar status." }, { status: 400 });
  }
}
