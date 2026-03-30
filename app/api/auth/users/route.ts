import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { listUsers, createUser, updateUser } from "@/lib/db";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  const users = await listUsers(session.tenantId);
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

  const body = (await request.json()) as { name?: string; email?: string; password?: string; role?: string };
  if (!body.name?.trim() || !body.email?.trim() || !body.password || body.password.length < 6) {
    return NextResponse.json({ error: "Nome, email e senha (min. 6 caracteres) sao obrigatorios." }, { status: 400 });
  }
  const role = body.role === "admin" ? "admin" : "buyer";

  try {
    const user = await createUser({ tenantId: session.tenantId, name: body.name.trim(), email: body.email.trim().toLowerCase(), password: body.password, role });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao criar usuario." }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

  const body = (await request.json()) as { userId?: string; name?: string; email?: string; password?: string; role?: string };
  if (!body.userId) return NextResponse.json({ error: "userId obrigatorio." }, { status: 400 });

  try {
    await updateUser({
      userId: body.userId, tenantId: session.tenantId,
      name: body.name?.trim() || undefined,
      email: body.email?.trim().toLowerCase() || undefined,
      password: body.password && body.password.length >= 6 ? body.password : undefined,
      role: body.role === "admin" || body.role === "buyer" ? body.role : undefined
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar usuario." }, { status: 400 });
  }
}
