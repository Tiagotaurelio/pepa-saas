import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { getCurrentSession } from "@/lib/auth";
import { buildFinalPurchaseExport } from "@/lib/pepa-store";

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const roundId = request.nextUrl.searchParams.get("roundId") ?? undefined;
  const exportSnapshot = await buildFinalPurchaseExport(session.tenantId, roundId);
  const rows = exportSnapshot.rows.map((row) => ({
    SKU: row.sku,
    Descricao: row.description,
    Quantidade: row.quantity,
    Fornecedor: row.supplier,
    PrecoUnitario: row.unitPrice,
    Total: row.total,
    Status: row.status
  }));

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Pedido");
    worksheet.columns = [
      { header: "SKU", key: "SKU", width: 18 },
      { header: "Descricao", key: "Descricao", width: 42 },
      { header: "Quantidade", key: "Quantidade", width: 14 },
      { header: "Fornecedor", key: "Fornecedor", width: 28 },
      { header: "PrecoUnitario", key: "PrecoUnitario", width: 16 },
      { header: "Total", key: "Total", width: 16 },
      { header: "Status", key: "Status", width: 14 }
    ];
    rows.forEach((row) => worksheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportSnapshot.orderNumber}.xlsx"`
      }
    });
  }

  const header = ["SKU", "Descricao", "Quantidade", "Fornecedor", "PrecoUnitario", "Total", "Status"];
  const csvLines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.SKU,
        escapeCsv(row.Descricao),
        row.Quantidade,
        escapeCsv(row.Fornecedor),
        row.PrecoUnitario,
        row.Total,
        row.Status
      ].join(",")
    )
  ];

  return new NextResponse(csvLines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportSnapshot.orderNumber}.csv"`
    }
  });
}

function escapeCsv(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}
