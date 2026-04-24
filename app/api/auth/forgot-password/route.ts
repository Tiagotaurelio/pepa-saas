import { NextRequest, NextResponse } from "next/server";
import { createPasswordResetToken } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { email?: string };
  const email = body.email?.trim().toLowerCase() ?? "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }

  // Always return OK to avoid user enumeration
  const result = await createPasswordResetToken(email);
  if (result) {
    try {
      await sendPasswordResetEmail({ to: email, userName: result.userName, token: result.token });
    } catch (err) {
      console.error("[forgot-password] Erro ao enviar e-mail:", err);
      return NextResponse.json({ error: "Erro ao enviar e-mail. Verifique a configuração SMTP." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
