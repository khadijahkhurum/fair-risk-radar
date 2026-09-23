// GET  /api/controls/[id]/evidence — list evidence attached to a control.
// POST /api/controls/[id]/evidence — upload + parse a .csv or .txt evidence
//                                     file, persisted (additive, never
//                                     overwritten — same audit-trail spirit
//                                     as everything else in this app).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseEvidence, EvidenceParseError } from "@/lib/evidence-parser";
import { requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { inspectTextUpload, EVIDENCE_MAX_BYTES } from "@/lib/upload-guard";

// Read hits the live DB on every request. Without this, Next.js 14 treats a
// no-arg GET route handler as static and bakes a build-time response into the
// deployment — so manual coverage overrides never show up in production.
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const evidence = await prisma.evidence.findMany({
      where: { orgId: auth.user.orgId, controlId: params.id },
      orderBy: { uploadedAt: "desc" },
    });
    return NextResponse.json({ evidence });
  } catch (err) {
    console.error("GET /api/controls/[id]/evidence failed:", err);
    return NextResponse.json({ error: "Failed to load evidence" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Evidence is access-review exports and patch-compliance reports — employee
  // identities and a target list. It was anonymously uploadable and readable
  // (audit S9).
  const auth = await requireUser("CONTROL_OWNER");
  if (!auth.ok) return auth.response;
  const { orgId } = auth.user;

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
  // S9: reject before reading the whole body into memory where we can. The
  // size on the File is the client's framing of it, so the guard re-checks the
  // actual byte length below rather than trusting this.
  if (file.size > EVIDENCE_MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${Math.round(EVIDENCE_MAX_BYTES / 1024)}KB limit.` },
      { status: 413 }
    );
  }

  // S9: `accept=".csv,.txt"` and a filename regex are client-side hints. This
  // inspects the bytes — signature check, strict UTF-8 decode, no NULs, no
  // stray control characters — so a renamed ZIP or PDF is refused by name.
  const verdict = inspectTextUpload(new Uint8Array(await file.arrayBuffer()), file.name);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason }, { status: verdict.status });
  }

  try {
    const parsed = parseEvidence(verdict.text, file.name);
    const evidence = await prisma.evidence.create({
      data: {
        orgId,
        controlId: params.id,
        filename: file.name,
        contentType: parsed.contentType,
        sizeBytes: file.size,
        summary: parsed.summary,
        parsedRows: parsed.parsedRows ?? undefined,
        rawText: parsed.rawText,
      },
    });
    await recordAuditEvent({
      orgId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      kind: "EVIDENCE",
      detail: {
        evidenceId: evidence.id,
        controlId: params.id,
        filename: file.name,
        sizeBytes: file.size,
        contentType: parsed.contentType,
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
