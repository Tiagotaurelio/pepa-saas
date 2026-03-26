import pdfParse from "pdf-parse";
import type { TextExtractionResult } from "./types";

export async function extractTextFromPdf(buffer: Buffer): Promise<TextExtractionResult> {
  // Step 1: Try pdf-parse
  const textLines = await extractWithPdfParse(buffer);
  if (textLines.length > 0) {
    return { lines: textLines, method: "pdf-parse" };
  }

  // Step 2: Fallback to Tesseract OCR
  const ocrLines = await extractWithTesseract(buffer);
  return { lines: ocrLines, method: "tesseract-ocr" };
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

async function extractWithTesseract(buffer: Buffer): Promise<string[]> {
  try {
    const { createWorker } = await import("tesseract.js");
    // tesseract.js v5 can work with PDF buffers directly via recognize
    // However, it works best with images. For now, try to use it with the buffer.
    // If it fails, return empty gracefully.

    const worker = await createWorker("por+eng", 1, {
      // Provide a no-op errorHandler to prevent tesseract from throwing uncaught
      // exceptions on invalid input. The Promise rejection (line 211 in createWorker)
      // already propagates the error to our outer try/catch.
      errorHandler: (_err: unknown) => { /* swallow — caught via Promise rejection */ },
    });
    try {
      // Try to recognize - tesseract.js can handle various formats
      const { data } = await worker.recognize(buffer);
      return data.text
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter(Boolean);
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    console.error("[extract-text] OCR fallback failed:", err);
    return [];
  }
}
