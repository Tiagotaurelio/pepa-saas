import { NextRequest, NextResponse } from "next/server";
import { consumePasswordResetToken } from "@/lib/db";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { token?: string; password?: string };

  if (!body.token || !body.password || body.password.length < 6) {
    return NextResponse.json({ error: "Token e senha (min. 6 caracteres) são obrigatórios." }, { status: 400 });
  }

  const ok = await consumePasswordResetToken(body.token, body.password);
  if (!ok) {
    return NextResponse.json({ error: "Link inválido ou expirado. Solicite um novo." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
