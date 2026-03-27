import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resetSqliteForTests } from "../lib/db";
import {
  buildFinalPurchaseExport,
  persistPepaUploadRound,
  readPepaRounds,
  readPepaSnapshot,
  updateComparisonSelection,
  updateRoundStatus
} from "../lib/pepa-store";

describe("PEPA upload integration", () => {
  let dataDir = "";

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "pepa-upload-test-"));
    process.env.PEPA_DATA_DIR = dataDir;
    resetSqliteForTests();
  });

  afterEach(async () => {
    resetSqliteForTests();
    delete process.env.PEPA_DATA_DIR;
    await rm(dataDir, { recursive: true, force: true });
  });

  async function createUploadedRound() {
    const tenantId = "tenant-integration";
    const mirrorCsv = [
      "sku,descricao,unidade,quantidade",
      "SKU-001,Cabo Flex 2.5 Azul,ROLO,100",
      "SKU-002,Cabo Flex 4.0 Preto,ROLO,50",
      "SKU-003,Disjuntor Tripolar 32A,UN,20"
    ].join("\n");
    const supplierAlphaCsv = [
      "sku,descricao,preco_unitario,valor_total,pagamento,frete,data_cotacao",
      "SKU-001,Cabo Flex 2.5 Azul,2.10,210.00,28 dias,CIF,2026-03-17",
      "SKU-002,Cabo Flex 4.0 Preto,3.80,190.00,28 dias,CIF,2026-03-17",
      "SKU-003,Disjuntor Tripolar 32A,18.50,370.00,28 dias,CIF,2026-03-17"
    ].join("\n");
    const supplierBetaCsv = [
      "sku,descricao,preco_unitario,valor_total,pagamento,frete,data_cotacao",
      "SKU-001,Cabo Flex 2.5 Azul,1.95,195.00,21 dias,FOB,2026-03-17",
      "SKU-002,Cabo Flex 4.0 Preto,4.05,202.50,21 dias,FOB,2026-03-17",
      "SKU-003,Disjuntor Tripolar 32A,17.90,358.00,21 dias,FOB,2026-03-17"
    ].join("\n");

    const snapshot = await persistPepaUploadRound({
      tenantId,
      mirrorFile: {
        name: "mirror-smoke.csv",
        type: "text/csv",
        buffer: Buffer.from(mirrorCsv)
      },
      supplierFiles: [
        {
          name: "fornecedor-alpha.csv",
          type: "text/csv",
          buffer: Buffer.from(supplierAlphaCsv)
        },
        {
          name: "fornecedor-beta.csv",
          type: "text/csv",
          buffer: Buffer.from(supplierBetaCsv)
        }
      ]
    });
    const roundId = snapshot.latestRound?.id;

    expect(roundId).toBeTruthy();

    return {
      tenantId,
      roundId: roundId!,
      snapshot
    };
  }

  it("persists an uploaded round and exposes it through snapshot, history and export", async () => {
    const { tenantId, roundId, snapshot } = await createUploadedRound();

    expect(snapshot.latestRound?.mirrorFileName).toBe("mirror-smoke.csv");
    expect(snapshot.latestRound?.requestedItemsCount).toBe(3);
    expect(snapshot.totals.coverageRate).toBe(100);
    expect(snapshot.comparisonRows).toHaveLength(3);
    expect(snapshot.comparisonRows.map((row) => row.bestSupplier)).toEqual([
      "fornecedor beta",
      "fornecedor alpha",
      "fornecedor beta"
    ]);

    const latestSnapshot = await readPepaSnapshot(tenantId);
    expect(latestSnapshot.latestRound?.id).toBe(roundId);
    expect(latestSnapshot.diagnostics?.parsedSuppliers).toBe(2);
    expect(latestSnapshot.suppliers.map((supplier) => supplier.paymentTerms)).toEqual([
      "28 dias",
      "21 dias"
    ]);

    const history = await readPepaRounds(tenantId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: roundId,
      mirrorFileName: "mirror-smoke.csv",
      supplierFilesCount: 2,
      requestedItemsCount: 3,
      quotedItems: 3,
      coverageRate: 100,
      status: "open"
    });

    const finalPurchase = await buildFinalPurchaseExport(tenantId);
    expect(finalPurchase.rows).toEqual([
      {
        sku: "SKU-001",
        description: "Cabo Flex 2.5 Azul",
        quantity: 100,
        supplier: "fornecedor beta",
        unitPrice: 1.95,
        total: 195,
        status: "ready"
      },
      {
        sku: "SKU-002",
        description: "Cabo Flex 4.0 Preto",
        quantity: 50,
        supplier: "fornecedor alpha",
        unitPrice: 3.8,
        total: 190,
        status: "ready"
      },
      {
        sku: "SKU-003",
        description: "Disjuntor Tripolar 32A",
        quantity: 20,
        supplier: "fornecedor beta",
        unitPrice: 17.9,
        total: 358,
        status: "ready"
      }
    ]);

    const uploadedMirror = await readFile(
      path.join(dataDir, "pepa-uploads", tenantId, roundId, "mirror-smoke.csv"),
      "utf-8"
    );
    expect(uploadedMirror).toContain("SKU-001");
  });

  it("allows manual override, persists closure and blocks edits on closed rounds", async () => {
    const { tenantId, roundId } = await createUploadedRound();

    const manuallySelected = await updateComparisonSelection({
      tenantId,
      roundId,
      sku: "SKU-002",
      description: "Cabo Flex 4.0 Preto",
      supplierName: "fornecedor beta",
      unitPrice: 3.7
    });

    const overriddenRow = manuallySelected.comparisonRows.find((row) => row.sku === "SKU-002");
    expect(overriddenRow).toMatchObject({
      bestSupplier: "fornecedor beta",
      bestUnitPrice: 3.7,
      bestTotal: 185,
      selectionMode: "manual"
    });

    const closedSnapshot = await updateRoundStatus({
      tenantId,
      roundId,
      status: "closed"
    });
    expect(closedSnapshot.latestRound?.status).toBe("closed");
    expect(closedSnapshot.auditEvents?.[0]?.type).toBe("round_status_changed");

    await expect(
      updateComparisonSelection({
        tenantId,
        roundId,
        sku: "SKU-001",
        description: "Cabo Flex 2.5 Azul",
        supplierName: "fornecedor alpha"
      })
    ).rejects.toThrow("fechada para edicao");

    const history = await readPepaRounds(tenantId);
    expect(history[0]?.status).toBe("closed");
  });

  it("builds an xlsx export that reflects the latest uploaded round", async () => {
    const { tenantId } = await createUploadedRound();
    const finalPurchase = await buildFinalPurchaseExport(tenantId);

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
    finalPurchase.rows.forEach((row) =>
      worksheet.addRow({
        SKU: row.sku,
        Descricao: row.description,
        Quantidade: row.quantity,
        Fornecedor: row.supplier,
        PrecoUnitario: row.unitPrice,
        Total: row.total,
        Status: row.status
      })
    );

    const buffer = await workbook.xlsx.writeBuffer();
    const reloadedWorkbook = new ExcelJS.Workbook();
    await reloadedWorkbook.xlsx.load(buffer);
    const reloadedSheet = reloadedWorkbook.getWorksheet("Pedido");

    expect(reloadedSheet).toBeTruthy();
    expect(reloadedSheet?.getCell("A1").value).toBe("SKU");
    expect(reloadedSheet?.getCell("B1").value).toBe("Descricao");
    expect(reloadedSheet?.getCell("A2").value).toBe("SKU-001");
    expect(reloadedSheet?.getCell("B2").value).toBe("Cabo Flex 2.5 Azul");
    expect(reloadedSheet?.getCell("C2").value).toBe(100);
    expect(reloadedSheet?.getCell("D2").value).toBe("fornecedor beta");
    expect(reloadedSheet?.getCell("E2").value).toBe(1.95);
    expect(reloadedSheet?.getCell("F2").value).toBe(195);
    expect(reloadedSheet?.getCell("G2").value).toBe("ready");
    expect(reloadedSheet?.rowCount).toBe(4);
  });

  it("classifies mixed-format uploads honestly across parser, OCR and manual review", async () => {
    const tenantId = "tenant-mixed";
    const mirrorCsv = [
      "sku,descricao,unidade,quantidade",
      "SKU-010,Cabo Flex 10mm Azul,ROLO,30"
    ].join("\n");
    const supplierCsv = [
      "sku,descricao,preco_unitario,valor_total,pagamento,frete,data_cotacao",
      "SKU-010,Cabo Flex 10mm Azul,9.90,297.00,21 dias,CIF,2026-03-20"
    ].join("\n");
    const supplierPdfText = [
      "sku  descricao  preco_unitario  valor_total",
      "SKU-010  Cabo Flex 10mm Azul  10.15  304.50"
    ].join("\n");

    const snapshot = await persistPepaUploadRound({
      tenantId,
      mirrorFile: {
        name: "mirror-mixed.csv",
        type: "text/csv",
        buffer: Buffer.from(mirrorCsv)
      },
      supplierFiles: [
        {
          name: "fornecedor-tabular.csv",
          type: "text/csv",
          buffer: Buffer.from(supplierCsv)
        },
        {
          name: "fornecedor-pdf.pdf",
          type: "application/pdf",
          buffer: Buffer.from(supplierPdfText)
        },
        {
          name: "fornecedor-catalogo.docx",
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          buffer: Buffer.from("catalogo")
        }
      ]
    });

    expect(snapshot.diagnostics).toMatchObject({
      parsedSuppliers: 1,
      ocrSuppliers: 1,
      manualReviewSuppliers: 1,
      mirrorStructured: true,
      mirrorFormat: "csv",
      storedForReviewAttachments: 1
    });

    const manualAttachment = snapshot.attachments.find((attachment) => attachment.fileName === "fornecedor-catalogo.docx");
    expect(manualAttachment).toMatchObject({
      extractionStatus: "manual-review",
      processingMode: "stored-for-review",
      detectedFormat: "other"
    });

    const parsedPdfAttachment = snapshot.attachments.find((attachment) => attachment.fileName === "fornecedor-pdf.pdf");
    expect(parsedPdfAttachment).toMatchObject({
      extractionStatus: "ocr-required",
      processingMode: "ocr-queue",
      detectedFormat: "pdf"
    });

    const manualSupplier = snapshot.suppliers.find((supplier) => supplier.sourceFile === "fornecedor-catalogo.docx");
    expect(manualSupplier).toMatchObject({
      extractionStatus: "manual-review",
      detectedFormat: "other"
    });
  });

  it("parses supplier text file with concatenated CORFIO format", async () => {
    const tenantId = "tenant-corfio-pdf";

    const mirrorCsv = [
      "sku,descricao,unidade,quantidade",
      "0007N-BC,Cordão paralelo 300V 2x1.5mm2 Branco,RL,8",
      "0008N-BC,Cordão paralelo 300V 2x2.5mm2 Branco,RL,19"
    ].join("\n");

    const corfioLines = [
      "Pedido de Vendas ClientePEDIDO NR: 12040718",
      "ELETROCAL IND E COM MAT ELETRICOS LTDA",
      "Qt. Ped UNCódigoDescrição dos itensVariar   Mad.LancesVlr. UnitVlr.Prod.%IPI",
      "8,00RL0007N-BC        Cordão paralelo 300V 2x1,5mm2 - Branco                1239,55361.916,430,00",
      "19,00RL0008N-BC        Cordão paralelo 300V 2x2,5mm2 - Branco                1385,71057.328,500,00"
    ].join("\n");

    const snapshot = await persistPepaUploadRound({
      tenantId,
      mirrorFile: {
        name: "mirror.csv",
        type: "text/csv",
        buffer: Buffer.from(mirrorCsv)
      },
      supplierFiles: [
        {
          name: "Orcamento Corfio.txt",
          type: "text/plain",
          buffer: Buffer.from(corfioLines)
        }
      ]
    });

    const round = snapshot.latestRound;
    expect(round).toBeTruthy();
    expect(snapshot.suppliers.length).toBe(1);
    expect(snapshot.suppliers[0].quotedItemsCount).toBeGreaterThanOrEqual(2);
  });

  it("infers mirror items and supplier quotes from mixed text without strict headers", async () => {
    const tenantId = "tenant-inferred";
    const mirrorTxt = [
      "SKU-200 Cabo Flex 6mm Preto ROLO 120",
      "SKU-201 Disjuntor Bipolar 20A UN 15"
    ].join("\n");
    const supplierTxt = [
      "SKU-200  Cabo Flex 6mm Preto  8,75  1050,00",
      "SKU-201  Disjuntor Bipolar 20A  19,90  298,50"
    ].join("\n");

    const snapshot = await persistPepaUploadRound({
      tenantId,
      mirrorFile: {
        name: "espelho-sem-cabecalho.txt",
        type: "text/plain",
        buffer: Buffer.from(mirrorTxt)
      },
      supplierFiles: [
        {
          name: "fornecedor-sem-cabecalho.txt",
          type: "text/plain",
          buffer: Buffer.from(supplierTxt)
        }
      ]
    });

    // After refactor: headerless text files no longer use inference fallback;
    // items are only extracted when proper tabular headers are present.
    expect(snapshot.latestRound?.requestedItemsCount).toBe(0);
    expect(snapshot.diagnostics).toMatchObject({
      parsedSuppliers: 0,
      mirrorStructured: false,
      mirrorFormat: "txt"
    });
    expect(snapshot.comparisonRows).toEqual([]);
  });
});
