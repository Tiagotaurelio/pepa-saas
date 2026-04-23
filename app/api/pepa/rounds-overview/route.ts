import { NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/auth";
import { listPepaRoundsWithUser } from "@/lib/db";
import { PepaSnapshot } from "@/lib/pepa-quotation-domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type RoundOverviewItem = {
  id: string;
  createdAt: string;
  mirrorFileName: string;
  status: "open" | "closed";
  buyerName: string | null;
  buyerId: string | null;
  brands: string[];
  requestedItemsCount: number;
  quotedItems: number;
  coverageRate: number;
};

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }

  const rows = await listPepaRoundsWithUser(session.tenantId, 100);

  const overview: RoundOverviewItem[] = rows.map((row) => {
    const snapshot = JSON.parse(row.snapshotJson) as PepaSnapshot;
    const brands = (snapshot.suppliers ?? [])
      .map((s) => s.supplierName)
      .filter((v, i, a) => v && a.indexOf(v) === i) as string[];

    return {
      id: row.id,
      createdAt: row.createdAt,
      mirrorFileName: row.mirrorFileName,
      status: snapshot.latestRound?.status ?? "open",
      buyerName: row.userName,
      buyerId: row.userId,
      brands,
      requestedItemsCount: snapshot.latestRound?.requestedItemsCount ?? snapshot.totals?.requestedItems ?? 0,
      quotedItems: snapshot.totals?.quotedItems ?? 0,
      coverageRate: snapshot.totals?.coverageRate ?? 0,
    };
  });

  return NextResponse.json({ rounds: overview });
}
