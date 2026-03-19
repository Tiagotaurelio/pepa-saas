import { NextResponse } from "next/server";
import { getPepaStorageMode } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "pepa-saas",
    storage: getPepaStorageMode(),
    timestamp: new Date().toISOString()
  });
}
