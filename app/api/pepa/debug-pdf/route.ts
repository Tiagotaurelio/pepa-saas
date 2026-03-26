import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const lines = parsed.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    return NextResponse.json({ fileName: file.name, totalLines: lines.length, lines });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
