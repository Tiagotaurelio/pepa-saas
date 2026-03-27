import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pdfParse from "pdf-parse";
import type { TextExtractionResult } from "./types";

/**
 * Extract text lines from a PDF buffer.
 * Strategy: pdf-parse first (fast). If 0 lines, spawn OCR worker process.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<TextExtractionResult> {
  // Step 1: Try pdf-parse (fast, works for text-based PDFs)
  const textLines = await extractWithPdfParse(buffer);
  if (textLines.length > 0) {
    return { lines: textLines, method: "pdf-parse" };
  }

  // Step 2: OCR via child process (avoids Tesseract crashing Next.js server)
  const ocrLines = await extractWithOcrWorker(buffer);
  if (ocrLines.length > 0) {
    return { lines: ocrLines, method: "tesseract-ocr" };
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

/**
 * Run OCR in a separate Node.js process to avoid Tesseract.js
 * worker module resolution issues inside Next.js/Turbopack.
 */
async function extractWithOcrWorker(buffer: Buffer): Promise<string[]> {
  const tempPath = join(tmpdir(), `pepa-ocr-${randomUUID()}.pdf`);

  try {
    // Write buffer to temp file
    await writeFile(tempPath, buffer);

    // Spawn the OCR worker script as a child process
    const workerScript = join(process.cwd(), "scripts", "ocr-worker.mjs");
    const lines = await new Promise<string[]>((resolve) => {
      const timeout = setTimeout(() => resolve([]), 90_000); // 90s timeout

      execFile("node", [workerScript, tempPath], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        clearTimeout(timeout);
        if (err) {
          console.error("[extract-text] OCR worker failed:", err.message);
          resolve([]);
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve(Array.isArray(parsed) ? parsed : []);
        } catch {
          resolve([]);
        }
      });
    });

    return lines;
  } catch (err) {
    console.error("[extract-text] OCR worker error:", err);
    return [];
  } finally {
    // Clean up temp file
    unlink(tempPath).catch(() => {});
  }
}
