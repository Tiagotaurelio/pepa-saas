import { describe, expect, it } from "vitest";
import { extractTextFromPdf } from "../lib/pdf/extract-text";

describe("extractTextFromPdf", () => {
  it("extracts text from a text-based PDF buffer", async () => {
    // Create a minimal valid PDF with embedded text
    const pdfBuffer = createMinimalTextPdf("Hello World\nLine Two");
    const result = await extractTextFromPdf(pdfBuffer);
    expect(result.method).toBe("pdf-parse");
    expect(result.lines.length).toBeGreaterThan(0);
  });

  it("returns empty lines for invalid buffer without crashing", async () => {
    const result = await extractTextFromPdf(Buffer.from("not a pdf"));
    expect(result.lines).toEqual([]);
  });
});

function createMinimalTextPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 100 700 Td (${text.replace(/\n/g, ") Tj T* (")}) Tj ET`;
  const content = [
    "%PDF-1.0",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    `3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>>/Contents 5 0 R>>endobj`,
    "4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    `5 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream\nendobj`,
    "xref", "0 6",
    "0000000000 65535 f ",
    "trailer<</Size 6/Root 1 0 R>>",
    "startxref", "0", "%%EOF"
  ].join("\n");
  return Buffer.from(content);
}
