// tests/pdf-parser-flex.test.ts
import { describe, expect, it } from "vitest";
import { parseFlexPdf } from "../lib/pdf/parser-flex";

describe("parseFlexPdf", () => {
  it("parses standard Flex line-mode items", () => {
    const lines = [
      "COMPRA DE MERCADORIA / RETORNO ORCAMENTO",
      "Seq Cod.Pepa Descrição Ref.Forn Un Qtde Prev.Fat. Vl.Unit Vl.Total %Ipi",
      "1 5559 BOBINA CABO FLEXIVEL HEPR 1KV 10MM AZUL CORFIO WB1025E-AZ MT 1.500 05/03/2026 7,18 10770,00 0,00",
      "2 5560 BOBINA CABO FLEXIVEL HEPR 1KV 10MM BRANCO CORFIO WB1025E-BC MT 1.000 05/03/2026 7,18 7180,00 0,00",
      "3 1234 DISJUNTOR TRIPOLAR 32A ABB UN 20 05/03/2026 18,50 370,00 0,00"
    ];

    const items = parseFlexPdf(lines);

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      sku: "5559",
      description: expect.stringContaining("BOBINA CABO FLEXIVEL"),
      unit: "MT",
      quantity: 1500,
      unitPrice: 7.18,
      supplierRef: "WB1025E-AZ"
    });
    expect(items[2]).toMatchObject({
      sku: "1234",
      unit: "UN",
      quantity: 20,
      unitPrice: 18.5
    });
  });

  it("returns empty array for non-Flex PDF", () => {
    const lines = ["Some random PDF content", "Not a Flex order"];
    expect(parseFlexPdf(lines)).toEqual([]);
  });

  it("parses cell-mode Flex PDF (one value per line)", () => {
    const lines = [
      "PEPA DISTRIBUIDORA MAT. ELETRICOS",
      "COMPRA DE MERCADORIA PARA",
      "Seq",
      "Código",
      "Descrição",
      "Un",
      "Ref. Fornecedor",
      "Qtde.",
      "Prev.Fat.",
      "Vl. Unit.",
      "Vl. Total",
      "%Ipi",
      "1",
      "14290",
      "ABRACADEIRA NYLON 100X2.5MM 100PC PRETA FERTAK",
      "PCT",
      "1306",
      "150",
      "16/03/2026",
      "1,06",
      "159.00",
      "9.75",
      "2",
      "14297",
      "ABRACADEIRA NYLON 200X3.6MM 100PC PRETA FERTAK",
      "PCT",
      "1324",
      "100",
      "16/03/2026",
      "2,95",
      "295.00",
      "9.75"
    ];

    const items = parseFlexPdf(lines);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      sku: "14290",
      description: "ABRACADEIRA NYLON 100X2.5MM 100PC PRETA FERTAK",
      unit: "PCT",
      quantity: 150,
      unitPrice: 1.06,
      supplierRef: "1306"
    });
    expect(items[1]).toMatchObject({
      sku: "14297",
      quantity: 100,
      unitPrice: 2.95
    });
  });

  it("handles OCR text with minor spacing variations", () => {
    const lines = [
      "COMPRA DE MERCADORIA",
      "1  5559  BOBINA CABO FLEXIVEL HEPR 1KV 10MM AZUL CORFIO  WB1025E-AZ  MT  1.500  05/03/2026  7,18  10770,00  0,00"
    ];
    const items = parseFlexPdf(lines);
    expect(items).toHaveLength(1);
    expect(items[0].sku).toBe("5559");
  });
});
