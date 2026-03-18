import { NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/auth";
import { readPepaRounds } from "@/lib/pepa-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rounds = await readPepaRounds(session.tenantId);
  return NextResponse.json({ rounds });
}
