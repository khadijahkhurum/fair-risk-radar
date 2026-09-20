// GET  /api/controls/[id]/evidence — list evidence attached to a control.
// POST /api/controls/[id]/evidence — upload + parse a .csv or .txt evidence
//                                     file, persisted (additive, never
//                                     overwritten — same audit-trail spirit
//                                     as everything else in this app).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseEvidence, EvidenceParseError } from "@/lib/evidence-parser";

const MAX_UPLOAD_BYTES = 1024 * 1024; // 1MB

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const evidence = await prisma.evidence.findMany({
      where: { controlId: params.id },
      orderBy: { uploadedAt: "desc" },
    });
    return NextResponse.json({ evidence });
  } catch (err) {
    console.error("GET /api/controls/[id]/evidence failed:", err);
    return NextResponse.json({ error: "Failed to load evidence" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const control = await prisma.control.findUnique({ where: { id: params.id } });
  if (!control) {
    return NextResponse.json({ error: `Unknown controlId "${params.id}"` }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Request must be multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File exceeds 1MB limit" }, { status: 413 });
  }
  if (!/\.(csv|txt)$/i.test(file.name)) {
    return NextResponse.json({ error: "Only .csv or .txt files are supported" }, { status: 422 });
  }

  try {
    const text = await file.text();
    const parsed = parseEvidence(text, file.name);
    const evidence = await prisma.evidence.create({
      data: {
        controlId: params.id,
        filename: file.name,
        contentType: parsed.contentType,
        sizeBytes: file.size,
        summary: parsed.summary,
        parsedRows: parsed.parsedRows ?? undefined,
        rawText: parsed.rawText,
      },
    });
    return NextResponse.json({ evidence });
  } catch (err) {
    if (err instanceof EvidenceParseError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("POST /api/controls/[id]/evidence failed:", err);
    return NextResponse.json({ error: "Failed to parse evidence" }, { status: 500 });
  }
}
