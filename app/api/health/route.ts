import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "pepa-saas",
    storage: "sqlite",
    timestamp: new Date().toISOString()
  });
}
