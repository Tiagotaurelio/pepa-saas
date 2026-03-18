import { NextRequest, NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/auth";
import { updateRoundStatus } from "@/lib/pepa-store";

type RoundStatusPayload = {
  roundId: string;
  status: "open" | "closed";
};

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<RoundStatusPayload>;
  if (!body.roundId || (body.status !== "open" && body.status !== "closed")) {
    return NextResponse.json({ error: "Payload de status invalido." }, { status: 400 });
  }

  try {
    const snapshot = await updateRoundStatus({
      tenantId: session.tenantId,
      roundId: body.roundId,
      status: body.status
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar status da rodada." },
      { status: 400 }
    );
  }
}
