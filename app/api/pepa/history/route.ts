import { NextRequest, NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/auth";
import { readPepaRounds, readPepaRoundsDetailed } from "@/lib/pepa-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request?: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const detailed = request?.url ? new URL(request.url).searchParams.get("detailed") === "true" : false;

  if (detailed) {
    const rounds = await readPepaRoundsDetailed(session.tenantId);
    return NextResponse.json({ rounds });
  }

  const rounds = await readPepaRounds(session.tenantId);
  return NextResponse.json({ rounds });
}
