import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { signIn } from "@/lib/auth";
import { sessionCookieName } from "@/lib/auth-config";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string; password?: string };

  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Credenciais invalidas." }, { status: 400 });
  }

  const session = await signIn(body.email, body.password);
  if (!session) {
    return NextResponse.json({ error: "Email ou senha invalidos. Caso sua conta esteja desativada, contate o administrador." }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt)
  });

  return NextResponse.json({ ok: true });
}
