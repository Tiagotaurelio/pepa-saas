import { NextRequest, NextResponse } from "next/server";

import { getCurrentSession } from "@/lib/auth";
import { persistPepaUploadRound } from "@/lib/pepa-store";

const maxFileSizeBytes = 10 * 1024 * 1024;
const maxSupplierFiles = 20;

export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const mirrorFile = formData.get("mirrorFile");
  const supplierFiles = formData.getAll("supplierFiles");

  if (!(mirrorFile instanceof File) || supplierFiles.length === 0) {
    return NextResponse.json(
      { error: "Envie o arquivo-base do Flex e pelo menos um anexo de fornecedor." },
      { status: 400 }
    );
  }

  const normalizedSupplierFiles = supplierFiles.filter((file): file is File => file instanceof File);
  if (normalizedSupplierFiles.length === 0) {
    return NextResponse.json(
      { error: "Envie pelo menos um anexo de fornecedor valido." },
      { status: 400 }
    );
  }
  if (normalizedSupplierFiles.length > maxSupplierFiles) {
    return NextResponse.json(
      { error: `Limite de ${maxSupplierFiles} anexos por rodada.` },
      { status: 400 }
    );
  }
  if (mirrorFile.size > maxFileSizeBytes || normalizedSupplierFiles.some((file) => file.size > maxFileSizeBytes)) {
    return NextResponse.json(
      { error: "Cada arquivo deve ter no maximo 10 MB nesta fase piloto." },
      { status: 400 }
    );
  }

  const snapshot = await persistPepaUploadRound({
    tenantId: session.tenantId,
    mirrorFile: {
      name: mirrorFile.name,
      type: mirrorFile.type,
      buffer: Buffer.from(await mirrorFile.arrayBuffer())
    },
    supplierFiles: await Promise.all(
      normalizedSupplierFiles.map(async (file) => ({
        name: file.name,
        type: file.type,
        buffer: Buffer.from(await file.arrayBuffer())
      }))
    )
  });

  return NextResponse.json({ snapshot });
}
