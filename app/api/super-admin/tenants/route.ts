import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { listTenants, createTenant } from "@/lib/db";

export async function GET() {
  const session = await getCurrentSession();
  if (!session || session.role !== "super_admin") {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const tenants = await listTenants();
  return NextResponse.json({ tenants });
}

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session || session.role !== "super_admin") {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as {
    name?: string; adminName?: string; adminEmail?: string; adminPassword?: string;
  };

  if (!body.name?.trim() || !body.adminName?.trim() || !body.adminEmail?.trim() || !body.adminPassword || body.adminPassword.length < 6) {
    return NextResponse.json(
      { error: "Preencha nome da empresa, nome do admin, email e senha (min. 6 caracteres)." },
      { status: 400 }
    );
  }

  try {
    const result = await createTenant({
      name: body.name,
      adminName: body.adminName,
      adminEmail: body.adminEmail,
      adminPassword: body.adminPassword,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar empresa." },
      { status: 400 }
    );
  }
}
