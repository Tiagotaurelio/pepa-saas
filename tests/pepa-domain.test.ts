import { describe, expect, it } from "vitest";

import {
  PepaSnapshot,
  derivePepaFinalPurchaseSnapshot,
  derivePepaPurchaseValidationSnapshot,
  derivePepaWorkflowTotals
} from "../lib/pepa-quotation-domain";

function createSnapshot(): PepaSnapshot {
  return {
    latestRound: {
      id: "round-12345678",
      createdAt: "2026-03-17T12:00:00.000Z",
      mirrorFileName: "espelho.xlsx",
      supplierFilesCount: 2,
      requestedItemsCount: 2,
      attachmentsReceived: 3,
      quotedItems: 1,
      coverageRate: 50,
      status: "open"
    },
    attachments: [],
    suppliers: [
      {
        supplierName: "Fornecedor A",
        sourceFile: "a.xlsx",
        extractionStatus: "parsed",
        paymentTerms: "28 dias",
        freightTerms: "CIF",
        quoteDate: "2026-03-17",
        coverageCount: 1,
        quotedItemsCount: 1,
        totalValue: 100,
        averageUnitPrice: 10,
        notes: "ok"
      },
      {
        supplierName: "Fornecedor B",
        sourceFile: "b.pdf",
        extractionStatus: "ocr-required",
        paymentTerms: "Nao lido",
        freightTerms: "Nao lido",
        quoteDate: null,
        coverageCount: 0,
        quotedItemsCount: 0,
        totalValue: null,
        averageUnitPrice: null,
        notes: "ocr"
      }
    ],
    comparisonRows: [
      {
        sku: "SKU-1",
        description: "Item 1",
        unit: "UN",
        requestedQuantity: 10,
        bestSupplier: "Fornecedor A",
        bestUnitPrice: 10,
        bestTotal: 100,
        itemStatus: "quoted",
        source: "inferred-from-quote",
        selectionMode: "automatic",
        offers: [{ supplierName: "Fornecedor A", unitPrice: 10, totalValue: 100 }]
      },
      {
        sku: "SKU-2",
        description: "Item 2",
        unit: "UN",
        requestedQuantity: 5,
        bestSupplier: null,
        bestUnitPrice: null,
        bestTotal: null,
        itemStatus: "ocr-pending",
        source: "inferred-from-quote",
        selectionMode: "automatic",
        offers: []
      }
    ],
    auditEvents: [],
    diagnostics: {
      parsedSuppliers: 1,
      ocrSuppliers: 1,
      manualReviewSuppliers: 0,
      commercialTermsDetected: 1,
      mirrorStructured: true,
      mirrorFormat: "xlsx",
      storedForReviewAttachments: 0,
      warnings: []
    },
    totals: {
      attachmentsReceived: 3,
      parsedAttachments: 1,
      ocrQueue: 1,
      requestedItems: 2,
      quotedItems: 1,
      coverageRate: 50,
      quotedValue: 100
    }
  };
}

describe("PEPA derived snapshots", () => {
  it("marks unresolved items as manual review in validation", () => {
    const validation = derivePepaPurchaseValidationSnapshot(createSnapshot());

    expect(validation.totals.selectedItems).toBe(2);
    expect(validation.totals.manualReviewCount).toBe(1);
    expect(validation.alerts.some((alert) => alert.severity === "warning")).toBe(true);
  });

  it("builds final purchase rows with pending status for unresolved items", () => {
    const finalPurchase = derivePepaFinalPurchaseSnapshot(createSnapshot());

    expect(finalPurchase.rows).toHaveLength(2);
    expect(finalPurchase.rows[0].status).toBe("ready");
    expect(finalPurchase.rows[1].status).toBe("pending");
    expect(finalPurchase.totals.pendingItems).toBe(1);
  });

  it("derives workflow totals from the active round snapshot", () => {
    const workflow = derivePepaWorkflowTotals(createSnapshot());

    expect(workflow.ocrQueue).toBe(1);
    expect(workflow.manualReviewCount).toBe(1);
    expect(workflow.pendingItems).toBe(1);
  });
});
