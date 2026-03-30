import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieState = vi.hoisted(() => ({
  value: undefined as string | undefined
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get(name: string) {
      if (name !== "pepa_session" || !cookieState.value) {
        return undefined;
      }

      return { name, value: cookieState.value };
    },
    set(name: string, value: string) {
      if (name === "pepa_session") {
        cookieState.value = value;
      }
    }
  }))
}));

import { resetSqliteForTests } from "../lib/db";
import { POST as loginRoute } from "../app/api/auth/login/route";
import { GET as sessionRoute } from "../app/api/auth/session/route";
import { POST as uploadRoute } from "../app/api/pepa/upload/route";
import { GET as snapshotRoute } from "../app/api/pepa/snapshot/route";
import { GET as historyRoute } from "../app/api/pepa/history/route";
import { POST as selectionRoute } from "../app/api/pepa/selection/route";
import { POST as roundStatusRoute } from "../app/api/pepa/round-status/route";
import { GET as exportRoute } from "../app/api/pepa/export/route";

describe("PEPA API integration", () => {
  let dataDir = "";

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "pepa-api-test-"));
    process.env.PEPA_DATA_DIR = dataDir;
    cookieState.value = undefined;
    resetSqliteForTests();
  });

  afterEach(async () => {
    resetSqliteForTests();
    cookieState.value = undefined;
    delete process.env.PEPA_DATA_DIR;
    await rm(dataDir, { recursive: true, force: true });
  });

  it("runs the authenticated HTTP flow from login to upload, selection, closure and export", async () => {
    const loginResponse = await loginRoute(
      jsonRequest("http://localhost/api/auth/login", {
        email: "admin@pepa.local",
        password: "demo123"
      })
    );

    expect(loginResponse.status).toBe(200);
    expect(await loginResponse.json()).toEqual({ ok: true });
    expect(cookieState.value).toBeTruthy();

    const sessionResponse = await sessionRoute();
    const sessionPayload = (await sessionResponse.json()) as {
      session: { tenantId: string; userEmail: string } | null;
    };
    expect(sessionPayload.session?.tenantId).toBe("tenant-demo");
    expect(sessionPayload.session?.userEmail).toBe("admin@pepa.local");

    const formData = new FormData();
    formData.set(
      "mirrorFile",
      new File(
        [
          [
            "sku,descricao,unidade,quantidade",
            "SKU-001,Cabo Flex 2.5 Azul,ROLO,100",
            "SKU-002,Cabo Flex 4.0 Preto,ROLO,50",
            "SKU-003,Disjuntor Tripolar 32A,UN,20"
          ].join("\n")
        ],
        "mirror-api.csv",
        { type: "text/csv" }
      )
    );
    formData.append(
      "supplierFiles",
      new File(
        [
          [
            "sku,descricao,preco_unitario,valor_total,pagamento,frete,data_cotacao",
            "SKU-001,Cabo Flex 2.5 Azul,2.10,210.00,28 dias,CIF,2026-03-17",
            "SKU-002,Cabo Flex 4.0 Preto,3.80,190.00,28 dias,CIF,2026-03-17",
            "SKU-003,Disjuntor Tripolar 32A,18.50,370.00,28 dias,CIF,2026-03-17"
          ].join("\n")
        ],
        "fornecedor-alpha.csv",
        { type: "text/csv" }
      )
    );
    formData.append(
      "supplierFiles",
      new File(
        [
          [
            "sku,descricao,preco_unitario,valor_total,pagamento,frete,data_cotacao",
            "SKU-001,Cabo Flex 2.5 Azul,1.95,195.00,21 dias,FOB,2026-03-17",
            "SKU-002,Cabo Flex 4.0 Preto,4.05,202.50,21 dias,FOB,2026-03-17",
            "SKU-003,Disjuntor Tripolar 32A,17.90,358.00,21 dias,FOB,2026-03-17"
          ].join("\n")
        ],
        "fornecedor-beta.csv",
        { type: "text/csv" }
      )
    );

    const uploadResponse = await uploadRoute(formRequest("http://localhost/api/pepa/upload", formData));
    expect(uploadResponse.status).toBe(200);
    const uploadPayload = (await uploadResponse.json()) as {
      snapshot: {
        latestRound: { id: string; mirrorFileName: string; status: string };
        comparisonRows: Array<{ sku: string; bestSupplier: string | null }>;
      };
    };
    expect(uploadPayload.snapshot.latestRound.mirrorFileName).toBe("mirror-api.csv");
    expect(uploadPayload.snapshot.comparisonRows.map((row) => row.bestSupplier)).toEqual([
      "fornecedor beta",
      "fornecedor alpha",
      "fornecedor beta"
    ]);

    const roundId = uploadPayload.snapshot.latestRound.id;

    const snapshotResponse = await snapshotRoute(getRequest("http://localhost/api/pepa/snapshot"));
    expect(snapshotResponse.status).toBe(200);
    const snapshotPayload = (await snapshotResponse.json()) as {
      snapshot: {
        latestRound: { id: string };
        diagnostics: { parsedSuppliers: number };
      };
    };
    expect(snapshotPayload.snapshot.latestRound.id).toBe(roundId);
    expect(snapshotPayload.snapshot.diagnostics.parsedSuppliers).toBe(2);

    const historyResponse = await historyRoute(new Request("http://localhost/api/pepa/history") as any);
    expect(historyResponse.status).toBe(200);
    const historyPayload = (await historyResponse.json()) as {
      rounds: Array<{ id: string; coverageRate: number; status: string }>;
    };
    expect(historyPayload.rounds).toHaveLength(1);
    expect(historyPayload.rounds[0]).toMatchObject({
      id: roundId,
      coverageRate: 100,
      status: "open"
    });

    const selectionResponse = await selectionRoute(
      jsonRequest("http://localhost/api/pepa/selection", {
        roundId,
        sku: "SKU-002",
        description: "Cabo Flex 4.0 Preto",
        supplierName: "fornecedor beta",
        unitPrice: 3.7
      })
    );
    expect(selectionResponse.status).toBe(200);
    const selectionPayload = (await selectionResponse.json()) as {
      snapshot: {
        comparisonRows: Array<{
          sku: string;
          bestSupplier: string | null;
          bestUnitPrice: number | null;
          selectionMode?: string;
        }>;
      };
    };
    expect(selectionPayload.snapshot.comparisonRows.find((row) => row.sku === "SKU-002")).toMatchObject({
      bestSupplier: "fornecedor beta",
      bestUnitPrice: 3.7,
      selectionMode: "manual"
    });

    const closeResponse = await roundStatusRoute(
      jsonRequest("http://localhost/api/pepa/round-status", {
        roundId,
        status: "closed"
      })
    );
    expect(closeResponse.status).toBe(200);
    const closePayload = (await closeResponse.json()) as {
      snapshot: { latestRound: { status: string } };
    };
    expect(closePayload.snapshot.latestRound.status).toBe("closed");

    const blockedSelectionResponse = await selectionRoute(
      jsonRequest("http://localhost/api/pepa/selection", {
        roundId,
        sku: "SKU-001",
        description: "Cabo Flex 2.5 Azul",
        supplierName: "fornecedor alpha"
      })
    );
    expect(blockedSelectionResponse.status).toBe(400);
    expect(await blockedSelectionResponse.json()).toMatchObject({
      error: expect.stringContaining("fechada para edicao")
    });

    const csvExportResponse = await exportRoute(
      getRequest(`http://localhost/api/pepa/export?format=csv&roundId=${encodeURIComponent(roundId)}`)
    );
    expect(csvExportResponse.status).toBe(200);
    expect(csvExportResponse.headers.get("content-type")).toContain("text/csv");
    const csvContent = await csvExportResponse.text();
    expect(csvContent).toContain("SKU-001,Cabo Flex 2.5 Azul,100,fornecedor beta,1.95,195,ready");
    expect(csvContent).toContain("SKU-002,Cabo Flex 4.0 Preto,50,fornecedor beta,3.7,185,ready");

    const xlsxExportResponse = await exportRoute(
      getRequest(`http://localhost/api/pepa/export?format=xlsx&roundId=${encodeURIComponent(roundId)}`)
    );
    expect(xlsxExportResponse.status).toBe(200);
    expect(xlsxExportResponse.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const workbook = new ExcelJS.Workbook();
    const xlsxBuffer = Buffer.from(await xlsxExportResponse.arrayBuffer());
    await workbook.xlsx.load(xlsxBuffer.buffer.slice(
      xlsxBuffer.byteOffset,
      xlsxBuffer.byteOffset + xlsxBuffer.byteLength
    ) as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet("Pedido");
    expect(sheet?.getCell("A2").value).toBe("SKU-001");
    expect(sheet?.getCell("D3").value).toBe("fornecedor beta");
    expect(sheet?.getCell("E3").value).toBe(3.7);
    expect(sheet?.getCell("F3").value).toBe(185);
  });
});

function getRequest(url: string) {
  return new NextRequest(new Request(url, { method: "GET" }));
}

function jsonRequest(url: string, payload: unknown) {
  return new NextRequest(
    new Request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })
  );
}

function formRequest(url: string, formData: FormData) {
  return new NextRequest(
    new Request(url, {
      method: "POST",
      body: formData
    })
  );
}
