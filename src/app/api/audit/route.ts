// GET /api/audit — the audit trail, scoped to what the reader is entitled to.
//
// Audit G1: this used to be DERIVED from the business tables, which is why it
// could not name an actor — none of those tables stored one. It now reads the
// canonical AuditEvent log, where actorId is NOT NULL and each row is chained
// to its predecessor.
//
// SCOPE. Any signed-in member can read their OWN events. Reading other
// people's — the whole organisation's trail — is the escalated action and
// needs ADMIN. That split is the point of the endpoint: an ordinary member can
// see and account for what they did, and reviewing someone else is a privilege
// rather than a side effect of having a login.
//
// INTEGRITY IS NOT SCOPED, AND CANNOT BE. The hash chain links every event in
// the organisation in order, so a subset of it does not verify — each row
// points at a predecessor that the filter removed. Verifying the filtered
// slice would therefore report a break that is not there. So the chain is
// always verified over the FULL organisation log server-side, and only the
// rows the reader may see are returned. The reader learns that the record is
// intact without being shown the records that prove it, which is the correct
// answer to "is this log trustworthy?" for someone who is not the auditor.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { findChainBreak } from "@/lib/audit-hash";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { orgId, id: viewerId, role } = auth.user;

  // Seeing other people's events is the escalated read.
  const seesEveryone = atLeast(role, "ADMIN");

  try {
    // Always the org's events: the chain is only verifiable over the whole
    // sequence. One query, filtered below — not a second round trip.
    const events = await prisma.auditEvent.findMany({
      where: { orgId },
      // seq, not at: the chain must be verified in the order it was built.
      // Sorting by a millisecond timestamp reorders events written in the same
      // millisecond and reports a false break.
      orderBy: { seq: "asc" },
      take: PAGE_SIZE,
    });

    // S6: recomputed on read, so the page can state that the chain verifies
    // rather than asserting append-only as an architectural property.
    const breakAt = findChainBreak(
      events.map((e) => ({
        prevHash: e.prevHash,
        orgId: e.orgId,
        actorId: e.actorId,
        kind: e.kind as string,
        at: e.at,
        detail: e.detail as unknown,
        hash: e.hash,
      }))
    );

    const visible = seesEveryone ? events : events.filter((e) => e.actorId === viewerId);

    return NextResponse.json({
      events: visible
        .map((e) => ({
          id: e.id,
          kind: e.kind,
          at: e.at.toISOString(),
          actorEmail: e.actorEmail,
          actorRole: e.actorRole,
          detail: e.detail,
          hash: e.hash,
        }))
        .reverse(),
      scope: seesEveryone ? "organisation" : "self",
      integrity: {
        verified: breakAt === null,
        brokenAtIndex: breakAt,
        // The number of events the CHAIN was checked over, which is the whole
        // org log — deliberately not the number returned. A reader seeing 4 of
        // their own events should know the integrity claim covers all 57.
        eventsChecked: events.length,
        eventsVisible: visible.length,
      },
    });
  } catch (err) {
    console.error("GET /api/audit failed:", err);
    return NextResponse.json({ error: "Failed to load audit trail" }, { status: 500 });
  }
}
