import { NextRequest, NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-store";

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Acesso restrito a administradores." },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const startDate =
    url.searchParams.get("startDate") ??
    new Date(Date.now() - 30 * 86400000).toISOString();
  const endDate =
    url.searchParams.get("endDate") ?? new Date().toISOString();
  const userId = url.searchParams.get("userId") ?? undefined;

  const data = await getDashboardData({
    tenantId: session.tenantId,
    startDate,
    endDate,
    userId
  });

  return NextResponse.json(data);
}
