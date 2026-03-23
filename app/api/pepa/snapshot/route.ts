import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/auth";
import { sessionCookieName } from "@/lib/auth-config";
import { readPepaSnapshot } from "@/lib/pepa-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    const cookieStore = await cookies();
    cookieStore.delete(sessionCookieName);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roundId = request.nextUrl.searchParams.get("roundId") ?? undefined;
  const snapshot = await readPepaSnapshot(session.tenantId, roundId);
  return NextResponse.json({ snapshot });
}
