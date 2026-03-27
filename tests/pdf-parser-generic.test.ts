import { describe, it, expect } from "vitest";
import { parseGenericSupplierPdf } from "@/lib/pdf/parser-generic";

describe("parseGenericSupplierPdf", () => {
  describe("Strategy 1: Header-based extraction", () => {
    it("parses well-spaced lines after an explicit header", () => {
      const lines = [
        "ORCAMENTO 12345",
        "Codigo Descricao Qtd Un Vlr.Unit Vlr.Total %IPI",
        "ABC-001 Cabo Flex 2.5mm Azul 100 RL 5,50 550,00 0,00",
        "ABC-002 Disjuntor 32A Tripolar 20 UN 18,90 378,00 0,00",
      ];
      const items = parseGenericSupplierPdf(lines);
      expect(items).toHaveLength(2);

      expect(items[0].sku).toBe("ABC-001");
      expect(items[0].description).toContain("Cabo Flex");
      expect(items[0].quantity).toBe(100);
      expect(items[0].unit).toBe("RL");
      expect(items[0].unitPrice).toBeCloseTo(5.5, 2);
      expect(items[0].totalValue).toBeCloseTo(550, 2);
      expect(items[0].ipiPercent).toBeCloseTo(0, 2);

      expect(items[1].sku).toBe("ABC-002");
      expect(items[1].quantity).toBe(20);
      expect(items[1].unit).toBe("UN");
      expect(items[1].unitPrice).toBeCloseTo(18.9, 2);
      expect(items[1].totalValue).toBeCloseTo(378, 2);
    });
  });

  describe("Strategy 2: Concatenated CORFIO format", () => {
    it("parses REAL CORFIO Pedido de Vendas data", () => {
      const lines = [
        "Pedido de Vendas ClientePEDIDO NR: 12040718",
        "ELETROCAL IND E COM MAT ELETRICOS LTDA",
        "Qt. Ped UNCódigoDescrição dos itensVariar   Mad.LancesVlr. UnitVlr.Prod.%IPI",
        "8,00RL0007N-BC        Cordão paralelo 300V 2x1,5mm2 - Branco                1239,55361.916,430,00",
        "19,00RL0008N-BC        Cordão paralelo 300V 2x2,5mm2 - Branco                1385,71057.328,500,00",
        "1.500,00M B1025E-AZ       Cabo flexível 1KV 1x10,0mm2 HEPR - Azul               SimNao17,969011.953,450,00",
        "1.000,00M B1025E-BC       Cabo flexível 1KV 1x10,0mm2 HEPR - Branco             SimNao17,96907.968,970,00",
        "Valor do Produto:111.482,07",
      ];
      const items = parseGenericSupplierPdf(lines);
      expect(items.length).toBeGreaterThanOrEqual(4);

      // First item: 8,00 RL 0007N-BC
      const first = items[0];
      expect(first.sku).toBe("0007N-BC");
      expect(first.quantity).toBe(8);
      expect(first.unit).toBe("RL");
      expect(first.unitPrice).toBeCloseTo(239.5536, 3);
      expect(first.totalValue).toBeCloseTo(1916.43, 2);
      expect(first.ipiPercent).toBeCloseTo(0, 2);

      // Second item: 19,00 RL 0008N-BC
      const second = items[1];
      expect(second.sku).toBe("0008N-BC");
      expect(second.quantity).toBe(19);
      expect(second.unit).toBe("RL");
      expect(second.unitPrice).toBeCloseTo(385.71, 1);
      expect(second.totalValue).toBeCloseTo(7328.5, 1);

      // Bobina item: 1.500,00 M B1025E-AZ
      const bobina = items[2];
      expect(bobina.sku).toBe("B1025E-AZ");
      expect(bobina.quantity).toBe(1500);
      expect(bobina.unit).toBe("M");
      expect(bobina.unitPrice).toBeCloseTo(7.969, 3);
      expect(bobina.totalValue).toBeCloseTo(11953.45, 2);
      expect(bobina.ipiPercent).toBeCloseTo(0, 2);

      // Second bobina: 1.000,00 M B1025E-BC
      const bobina2 = items[3];
      expect(bobina2.sku).toBe("B1025E-BC");
      expect(bobina2.quantity).toBe(1000);
      expect(bobina2.unit).toBe("M");
      expect(bobina2.unitPrice).toBeCloseTo(7.969, 3);
      expect(bobina2.totalValue).toBeCloseTo(7968.97, 2);
    });
  });

  describe("Strategy 3: Token-based extraction", () => {
    it("parses lines with seq number prefix", () => {
      const lines = [
        "1 CAB-001 Cabo Flex 2.5mm 100 MT 5,50 550,00",
        "2 CAB-002 Fio Rigido 4mm 200 RL 3,90 780,00",
      ];
      const items = parseGenericSupplierPdf(lines);
      expect(items).toHaveLength(2);

      expect(items[0].sku).toBe("CAB-001");
      expect(items[0].quantity).toBe(100);
      expect(items[0].unit).toBe("MT");
      expect(items[0].unitPrice).toBeCloseTo(5.5, 2);
      expect(items[0].totalValue).toBeCloseTo(550, 2);

      expect(items[1].sku).toBe("CAB-002");
      expect(items[1].quantity).toBe(200);
      expect(items[1].unit).toBe("RL");
    });
  });

  describe("Edge cases", () => {
    it("returns empty array for non-tabular content", () => {
      const lines = [
        "Prezado cliente,",
        "Segue abaixo nossa proposta comercial.",
        "Atenciosamente,",
        "Equipe Vendas",
      ];
      const items = parseGenericSupplierPdf(lines);
      expect(items).toHaveLength(0);
    });

    it("skips headers, footers, metadata lines", () => {
      const lines = [
        "CNPJ: 12.345.678/0001-99",
        "Rua das Flores, 123 - CEP 01234-567",
        "Fone: (11) 1234-5678",
        "1 CAB-001 Cabo Flex 2.5mm 100 MT 5,50 550,00",
        "2 CAB-002 Fio Rigido 4mm 200 RL 3,90 780,00",
        "Valor Total: 1.330,00",
        "Observação: Entrega em 10 dias",
        "Transportadora: XYZ",
      ];
      const items = parseGenericSupplierPdf(lines);
      expect(items).toHaveLength(2);
      // Verify no metadata leaked into items
      for (const item of items) {
        expect(item.description).not.toMatch(/cnpj|cep|fone|valor total|observ/i);
      }
    });
  });
});
