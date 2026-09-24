// GET /api/audit — the organisation's audit trail.
//
// Audit G1: this used to be DERIVED from the business tables, which is why it
// could not name an actor — none of those tables stored one. It now reads the
// canonical AuditEvent log, where actorId is NOT NULL and each row is chained
// to its predecessor.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { findChainBreak } from "@/lib/audit-hash";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;

export async function GET() {
  // The trail is ORGANISATION-scoped, not per-user: an audit log whose whole
  // purpose is letting one person review another's actions cannot be filtered
  // to "your own events". What it should be is restricted to the people whose
  // job that review is, which is what this gate does — previously any signed-in
  // member could read it, including a Viewer.
  const auth = await requireUser("ADMIN");
  if (!auth.ok) return auth.response;
  const { orgId } = auth.user;

  try {
    const events = await prisma.auditEvent.findMany({
      where: { orgId },
      orderBy: { at: "asc" },
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

    return NextResponse.json({
      events: events
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
      integrity: {
        verified: breakAt === null,
        brokenAtIndex: breakAt,
        eventsChecked: events.length,
      },
    });
  } catch (err) {
    console.error("GET /api/audit failed:", err);
    return NextResponse.json({ error: "Failed to load audit trail" }, { status: 500 });
  }
}
