import { NextRequest, NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/auth";
import { updateSupplierCommercialTerms } from "@/lib/pepa-store";

type SupplierTermsPayload = {
  roundId: string;
  supplierName: string;
  paymentTerms: string;
  freightTerms: string;
};

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<SupplierTermsPayload>;
  if (!body.roundId || !body.supplierName || typeof body.paymentTerms !== "string" || typeof body.freightTerms !== "string") {
    return NextResponse.json({ error: "Payload de condicoes invalido." }, { status: 400 });
  }

  try {
    const snapshot = await updateSupplierCommercialTerms({
      tenantId: session.tenantId,
      roundId: body.roundId,
      supplierName: body.supplierName,
      paymentTerms: body.paymentTerms,
      freightTerms: body.freightTerms
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar condicoes comerciais." },
      { status: 400 }
    );
  }
}
