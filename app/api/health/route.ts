import { NextResponse } from "next/server";
import { getPepaStorageMode } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "pepa-saas",
    version: "2026-04-22-v4",
    storage: getPepaStorageMode(),
    timestamp: new Date().toISOString()
  });
}
