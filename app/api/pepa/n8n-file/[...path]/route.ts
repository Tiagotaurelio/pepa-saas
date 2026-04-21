import { readFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";

function getUploadsRoot() {
  const dataRoot = process.env.PEPA_DATA_DIR?.trim() || path.join(process.cwd(), "data");
  return path.join(dataRoot, "pepa-uploads");
}

function hasObjectStorageConfig() {
  return Boolean(
    process.env.PEPA_OBJECT_STORAGE_BUCKET &&
      process.env.PEPA_OBJECT_STORAGE_ACCESS_KEY_ID &&
      process.env.PEPA_OBJECT_STORAGE_SECRET_ACCESS_KEY
  );
}

function getS3Client() {
  return new S3Client({
    region: process.env.PEPA_OBJECT_STORAGE_REGION?.trim() || "sa-east-1",
    endpoint: process.env.PEPA_OBJECT_STORAGE_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.PEPA_OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.PEPA_OBJECT_STORAGE_ACCESS_KEY_ID?.trim() || "",
      secretAccessKey: process.env.PEPA_OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim() || "",
    },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const token = process.env.PEPA_N8N_TOKEN;
  const authHeader = request.headers.get("Authorization");
  if (!token || authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path: segments } = await params;
  if (!segments || segments.length < 3) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const [tenantId, roundId, ...fileNameParts] = segments;
  const fileName = fileNameParts.join("/");
  const relativeKey = `${tenantId}/${roundId}/${fileName}`;

  try {
    if (hasObjectStorageConfig()) {
      const prefix = process.env.PEPA_OBJECT_STORAGE_PREFIX?.trim();
      const objectKey = prefix ? `${prefix.replace(/\/+$/, "")}/${relativeKey}` : relativeKey;
      const result = await getS3Client().send(
        new GetObjectCommand({
          Bucket: process.env.PEPA_OBJECT_STORAGE_BUCKET,
          Key: objectKey,
        })
      );
      const buffer = Buffer.from(await result.Body!.transformToByteArray());
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": result.ContentType || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }

    const filePath = path.join(getUploadsRoot(), relativeKey);
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
