// POST /api/evidence/[id]/review — reconcile one evidence file against the
// coverage claimed for its control, with model assistance.
//
// The governance surface of this route, in the order it matters:
//
//  1. CAPABILITY. This handler reads evidence and writes a review row. It
//     cannot change control coverage — there is no code path here that
//     touches ControlCoverage, and that is the property that makes prompt
//     injection low-impact rather than merely "mitigated". A model that is
//     completely taken in by an instruction hidden in an uploaded CSV
//     produces a wrong suggestion on a screen that a human discards.
//
//  2. GROUNDING. Model output is verified against the evidence we hold before
//     anything is stored (src/lib/ai/evidence-review.ts). Findings that fail
//     are counted, not silently dropped, because how often a model fabricates
//     is exactly the thing an operator needs to know.
//
//  3. TRACEABILITY. Every run writes an AI_REVIEW audit event into the same
//     hash-chained trail as everything else, naming who asked for it and what
//     came back. That is the EU AI Act record-keeping obligation as code
//     rather than as a claim in a document.
//
//  4. COST AND ABUSE. This is the only endpoint in the product that spends
//     money per call, so it has the tightest rate limit.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import { createRateLimiter } from "@/lib/rate-limit";
import { providerFromEnv } from "@/lib/ai/client";
import { buildPrompt, verifyResponse, PROMPT_VERSION, type ReviewContext } from "@/lib/ai/evidence-review";

export const dynamic = "force-dynamic";

// Far tighter than the simulation limiters: every call is billable, and no
// legitimate workflow reviews the same evidence repeatedly in a minute.
const reviewLimiter = createRateLimiter({ limit: 10, windowMs: 5 * 60_000 });

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  // Running an analysis is analyst work. Note it is NOT the CONTROL_OWNER gate
  // that guards coverage changes — because this cannot change coverage, and
  // matching the gates would imply it could.
  const auth = await requireUser("ANALYST");
  if (!auth.ok) return auth.response;
  const { orgId } = auth.user;

  const provider = providerFromEnv();
  if (!provider) {
    // A missing key is a supported state, not a failure: the rest of the
    // product works without this feature.
    return NextResponse.json(
      { error: "AI evidence review is not configured on this deployment.", code: "NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const limit = reviewLimiter.check(`ai-review:${auth.user.id}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many analyses in a short period. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const evidence = await prisma.evidence.findFirst({
      where: { id: params.id, orgId },
      include: { control: { include: { coverage: { where: { orgId }, orderBy: { recordedAt: "desc" }, take: 1 } } } },
    });
    if (!evidence) {
      return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    }

    const latestCoverage = evidence.control.coverage[0];
    const claimedCoveragePct = latestCoverage?.coveragePct ?? 0;

    const ctx: ReviewContext = {
      controlId: evidence.control.id,
      controlName: evidence.control.name,
      controlDescription: evidence.control.description,
      claimedCoveragePct,
      coverageSource: latestCoverage?.source ?? "DEMO",
      filename: evidence.filename,
      rawText: evidence.rawText,
      // Prisma types this as JsonValue; the upload route is the only writer
      // and it always stores an array of flat string rows or null.
      parsedRows: (evidence.parsedRows as unknown as Record<string, string>[] | null) ?? null,
    };

    const prompt = buildPrompt(ctx);
    const completion = await provider.complete({ system: prompt.system, user: prompt.user });
    if (!completion.ok) {
      return NextResponse.json(
        { error: completion.error, retryable: completion.retryable },
        { status: completion.retryable ? 503 : 502 }
      );
    }

    const result = verifyResponse(completion.text, ctx, prompt.truncated);

    const review = await prisma.evidenceReview.create({
      data: {
        orgId,
        evidenceId: evidence.id,
        controlId: evidence.control.id,
        claimedCoveragePct,
        model: completion.model,
        promptVersion: PROMPT_VERSION,
        // EvidenceFinding has optional fields, so its type includes
        // `undefined`, which Prisma's JSON input type rejects. The values
        // themselves are plain JSON — they came out of JSON.parse and through
        // the validator — so the cast is about the type, not the data.
        findings: result.findings as unknown as Prisma.InputJsonValue,
        findingsDropped: result.dropped.length,
        truncated: result.truncated,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        requestedById: auth.user.id,
      },
    });

    await recordAuditEvent({
      orgId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      kind: "AI_REVIEW",
      detail: {
        action: "evidence_reconciled",
        reviewId: review.id,
        evidenceId: evidence.id,
        controlId: evidence.control.id,
        claimedCoveragePct,
        model: completion.model,
        promptVersion: PROMPT_VERSION,
        findingsKept: result.findings.length,
        findingsDropped: result.dropped.length,
        truncated: result.truncated,
        // The findings themselves live on the review row. The trail records
        // that the analysis happened and what it produced in aggregate, which
        // is what makes it auditable without duplicating user-supplied text
        // into an immutable record (the G8 lesson).
      },
    });

    return NextResponse.json({
      review: {
        id: review.id,
        model: completion.model,
        promptVersion: PROMPT_VERSION,
        claimedCoveragePct,
        truncated: result.truncated,
        createdAt: review.createdAt,
      },
      findings: result.findings,
      // Surfaced rather than hidden: an analyst who sees "3 findings shown,
      // 2 discarded as ungrounded" knows how much to trust the 3.
      dropped: result.dropped,
    });
  } catch (err) {
    console.error("POST /api/evidence/[id]/review failed:", err);
    return NextResponse.json({ error: "Failed to run evidence review" }, { status: 500 });
  }
}

// GET — past reviews for this evidence, newest first. Reviews are never
// overwritten, so an analyst can see what a model said last quarter as well as
// what it says today.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const reviews = await prisma.evidenceReview.findMany({
      where: { orgId: auth.user.orgId, evidenceId: params.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { requestedBy: { select: { email: true } } },
    });
    return NextResponse.json({ reviews });
  } catch (err) {
    console.error("GET /api/evidence/[id]/review failed:", err);
    return NextResponse.json({ error: "Failed to load evidence reviews" }, { status: 500 });
  }
}
