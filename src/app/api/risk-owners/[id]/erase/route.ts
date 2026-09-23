// POST /api/risk-owners/[id]/erase — erase a risk owner's name (audit G8).
//
// The tension the auditor identified: the audit trail is append-only by
// design, which is correct for integrity and directly at odds with GDPR
// Art. 17 / UK DPA erasure obligations and CCPA deletion rights, because
// ownerName was personal data embedded in immutable records.
//
// The resolution is not to weaken the trail. Nothing here rewrites a single
// historical event, and the hash chain verifies exactly as before. The name
// lived in one directory row; tombstoning that row removes it from every risk
// and every past record simultaneously, because they all reference the ID.
//
// The erasure is itself an auditable act: an ERASURE event records who did it
// and which ID was affected. It does NOT record the name — writing the name
// into the trail as part of erasing it would be self-defeating, and that is
// the whole reason the finding existed.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  // Erasure is destructive and irreversible, so it sits with the same role
  // that signs off assessments rather than with anyone who can edit a risk.
  const auth = await requireUser("ADMIN");
  if (!auth.ok) return auth.response;
  const { orgId } = auth.user;

  try {
    const owner = await prisma.riskOwner.findFirst({ where: { id: params.id, orgId } });
    if (!owner) {
      return NextResponse.json({ error: "Owner not found" }, { status: 404 });
    }
    if (owner.erasedAt !== null) {
      return NextResponse.json(
        { error: "This owner has already been erased.", code: "ALREADY_ERASED" },
        { status: 409 }
      );
    }

    const affected = await prisma.risk.count({ where: { orgId, ownerId: owner.id } });

    // The stored value becomes a unique, meaningless placeholder rather than a
    // literal "[erased]" — the unique constraint on (orgId, displayName) would
    // otherwise collide on the second erasure. What users see is decided by
    // ownerDisplayName(), which reads erasedAt, not this string.
    await prisma.riskOwner.update({
      where: { id: owner.id },
      data: {
        displayName: `erased-${owner.id}`,
        erasedAt: new Date(),
        erasedById: auth.user.id,
      },
    });

    await recordAuditEvent({
      orgId,
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.user.role,
      kind: "ERASURE",
      detail: {
        action: "risk_owner_erased",
        ownerId: owner.id,
        risksAffected: affected,
        // Deliberately absent: the name. Recording what was erased, in the
        // permanent record, would defeat the erasure.
      },
    });

    return NextResponse.json({ ok: true, ownerId: owner.id, risksAffected: affected });
  } catch (err) {
    console.error("POST /api/risk-owners/[id]/erase failed:", err);
    return NextResponse.json({ error: "Failed to erase owner" }, { status: 500 });
  }
}
