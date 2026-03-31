#!/usr/bin/env node
/**
 * PDF Table Extractor — uses pdfjs-dist to extract text with x,y positions,
 * then reconstructs the table by grouping into rows and columns.
 * Outputs JSON array of row objects.
 *
 * Usage: node scripts/pdf-to-table.mjs <pdf-path>
 * Output: JSON to stdout
 */
import { readFileSync } from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error("Usage: node scripts/pdf-to-table.mjs <pdf-path>");
  process.exit(1);
}

try {
  const buf = readFileSync(pdfPath);
  const doc = await getDocument({ data: new Uint8Array(buf) }).promise;

  const allItems = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      allItems.push({
        text: item.str.trim(),
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
        page: pageNum
      });
    }
  }

  // Sort by page, then by Y descending (top to bottom), then by X ascending (left to right)
  allItems.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (Math.abs(a.y - b.y) > 5) return b.y - a.y; // higher Y = higher on page
    return a.x - b.x;
  });

  // Group into rows: items with similar Y (within 5 units) are in the same row
  const rows = [];
  let currentRow = [];
  let currentY = null;

  for (const item of allItems) {
    if (currentY === null || Math.abs(item.y - currentY) > 5) {
      if (currentRow.length > 0) rows.push(currentRow);
      currentRow = [item];
      currentY = item.y;
    } else {
      currentRow.push(item);
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  // Convert rows to simple text arrays
  const textRows = rows.map(row =>
    row.sort((a, b) => a.x - b.x).map(item => item.text)
  );

  // Output as JSON
  process.stdout.write(JSON.stringify(textRows));
} catch (err) {
  console.error("[pdf-to-table] Error:", err.message);
  process.stdout.write("[]");
  process.exit(1);
}
