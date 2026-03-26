// lib/pdf/types.ts

/** Item extracted from any PDF (mirror or supplier) */
export type ExtractedPdfItem = {
  sku: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalValue: number | null;
  ipiPercent: number | null;
  supplierRef?: string;
};

/** Result of text extraction from a PDF */
export type TextExtractionResult = {
  lines: string[];
  method: "pdf-parse" | "tesseract-ocr";
};

/** Detected column mapping from header analysis */
export type ColumnMapping = {
  sku: number;
  description: number;
  quantity: number;
  unit: number;
  unitPrice: number;
  totalValue: number;
  ipi: number;
};
