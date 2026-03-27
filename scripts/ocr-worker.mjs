#!/usr/bin/env node
/**
 * OCR Worker — runs as a child process to avoid Tesseract.js crashing Next.js.
 * Usage: node scripts/ocr-worker.mjs <pdf-path>
 * Outputs: JSON array of extracted text lines to stdout.
 */
import { readFileSync } from "fs";
import { fromBuffer } from "pdf2pic";
import { createWorker } from "tesseract.js";

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error("Usage: node scripts/ocr-worker.mjs <pdf-path>");
  process.exit(1);
}

try {
  const buf = readFileSync(pdfPath);
  const converter = fromBuffer(buf, {
    density: 200,
    format: "png",
    width: 1600,
    height: 2200
  });

  const allLines = [];
  const worker = await createWorker("por");

  for (let pageNum = 1; pageNum <= 5; pageNum++) {
    try {
      const page = await converter(pageNum, { responseType: "buffer" });
      if (!page.buffer || page.buffer.length === 0) break;
      const { data } = await worker.recognize(page.buffer);
      const pageLines = data.text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      allLines.push(...pageLines);
    } catch {
      break;
    }
  }

  await worker.terminate();
  // Output lines as JSON to stdout
  process.stdout.write(JSON.stringify(allLines));
} catch (err) {
  console.error("[ocr-worker] Error:", err.message);
  process.stdout.write("[]");
  process.exit(1);
}
