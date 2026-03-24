import { NextRequest, NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/auth";
import { updateComparisonSelection } from "@/lib/pepa-store";

type SelectionPayload = {
  roundId: string;
  sku: string;
  description: string;
  supplierName: string | null;
  unitPrice?: number | null;
  quantity?: number | null;
};

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<SelectionPayload>;
  if (!body.roundId || !body.sku || !body.description) {
    return NextResponse.json({ error: "Payload de selecao invalido." }, { status: 400 });
  }

  try {
    const snapshot = await updateComparisonSelection({
      tenantId: session.tenantId,
      roundId: body.roundId,
      sku: body.sku,
      description: body.description,
      supplierName: body.supplierName ?? null,
      unitPrice: typeof body.unitPrice === "number" ? body.unitPrice : null,
      quantity: typeof body.quantity === "number" ? body.quantity : null
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar selecao." },
      { status: 400 }
    );
  }
}
