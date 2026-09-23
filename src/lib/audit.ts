// Writing the audit trail (audit G1, S6).
//
// Before: the trail was DERIVED from the business tables, so it could only
// report what those tables happened to store — and none of them stored an
// actor. Every one of the 93 events was unattributed.
//
// Now the trail is its own append-only table whose actor columns are NOT NULL,
// so an unattributed event is not expressible. Each row is hash-chained to its
// predecessor, which makes the append-only claim demonstrable rather than
// merely architectural.
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { computeEventHash } from "./audit-hash";
import type { Role } from "./roles";

// Re-exported so existing importers keep working; the list itself lives in
// audit-kinds.ts, which has no imports and can therefore be shared with
// client components without dragging Prisma along.
export type { AuditKind } from "./audit-kinds";
import type { AuditKind } from "./audit-kinds";

export interface AuditInput {
  orgId: string;
  actorId: string;
  actorEmail: string;
  actorRole: Role;
  kind: AuditKind;
  /** Structured, so an auditor can filter and recompute rather than parse English. */
  detail: Record<string, unknown>;
}

export async function recordAuditEvent(input: AuditInput): Promise<void> {
  try {
    // Serializable, because the chain's correctness depends on no two writers
    // reading the same tail. Postgres will abort one of a conflicting pair
    // rather than let both link to the same predecessor.
    //
    // ponytail: a retry loop would make this resilient under real concurrency;
    // at demo write volumes a failed audit write is logged, not retried. Add
    // the retry when write contention is actually observed.
    await prisma.$transaction(
      async (tx) => {
        const prev = await tx.auditEvent.findFirst({
          where: { orgId: input.orgId },
          orderBy: { at: "desc" },
          select: { hash: true },
        });
        const at = new Date();
        const hash = computeEventHash({
          prevHash: prev?.hash ?? null,
          orgId: input.orgId,
          actorId: input.actorId,
          kind: input.kind,
          at,
          detail: input.detail,
        });
        await tx.auditEvent.create({
          data: {
            orgId: input.orgId,
            actorId: input.actorId,
            actorEmail: input.actorEmail,
            actorRole: input.actorRole,
            kind: input.kind,
            at,
            detail: input.detail as Prisma.InputJsonObject,
            prevHash: prev?.hash ?? null,
            hash,
          },
        });
      },
      { isolationLevel: "Serializable" }
    );
  } catch (err) {
    // An audit write must never take down the operation it describes, but a
    // silently missing audit record is its own incident — so it is logged
    // loudly rather than swallowed (audit P1's principle, applied server-side).
    console.error("AUDIT WRITE FAILED", { kind: input.kind, orgId: input.orgId, actorId: input.actorId }, err);
  }
}
