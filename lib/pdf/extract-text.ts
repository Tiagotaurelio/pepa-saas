import pdfParse from "pdf-parse";
import type { TextExtractionResult } from "./types";

/**
 * Extract text lines from a PDF buffer.
 * Strategy: pdf-parse first (fast). If 0 lines, use pdf2pic + Tesseract OCR.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<TextExtractionResult> {
  // Step 1: Try pdf-parse (fast, works for text-based PDFs)
  const textLines = await extractWithPdfParse(buffer);
  if (textLines.length > 0) {
    return { lines: textLines, method: "pdf-parse" };
  }

  // Step 2: OCR fallback — only when explicitly enabled.
  // Tesseract.js worker crashes inside Next.js/Turbopack server due to module
  // resolution issues. OCR should be run via CLI script or background job instead.
  if (process.env.PEPA_OCR_ENABLED === "true") {
    try {
      const ocrLines = await Promise.race([
        extractWithOcr(buffer),
        new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 60_000))
      ]);
      if (ocrLines.length > 0) {
        return { lines: ocrLines, method: "tesseract-ocr" };
      }
    } catch {
      // OCR failed, fall through to empty result
    }
  }

  return { lines: [], method: "pdf-parse" };
}

async function extractWithPdfParse(buffer: Buffer): Promise<string[]> {
  try {
    const parsed = await pdfParse(buffer);
    return parsed.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function extractWithOcr(buffer: Buffer): Promise<string[]> {
  try {
    const { fromBuffer } = await import("pdf2pic");
    const { createWorker } = await import("tesseract.js");

    const converter = fromBuffer(buffer, {
      density: 200,
      format: "png",
      width: 1600,
      height: 2200
    });

    const allLines: string[] = [];
    const worker = await createWorker("por");

    try {
      // Process up to 5 pages (safety limit)
      for (let pageNum = 1; pageNum <= 5; pageNum++) {
        try {
          const page = await converter(pageNum, { responseType: "buffer" });
          if (!page.buffer || page.buffer.length === 0) break;

          const { data } = await worker.recognize(page.buffer);
          const pageLines = data.text
            .split(/\r?\n/)
            .map((l: string) => l.trim())
            .filter(Boolean);
          allLines.push(...pageLines);
        } catch {
          // No more pages or rendering failed
          break;
        }
      }
    } finally {
      await worker.terminate();
    }

    return allLines;
  } catch (err) {
    console.error("[extract-text] OCR fallback failed:", err);
    return [];
  }
}
