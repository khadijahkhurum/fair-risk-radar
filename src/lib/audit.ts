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

/**
 * A write that lost a Serializable race, rather than a write that is wrong.
 *
 * Prisma reports these as P2034; the underlying Postgres SQLSTATE is 40001
 * (serialization failure) or 40P01 (deadlock). Both mean "try again", and
 * neither means the data was rejected.
 */
export function isRetryableWriteConflict(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "P2034" || code === "40001" || code === "40P01";
}

const MAX_ATTEMPTS = 4;

export async function recordAuditEvent(input: AuditInput): Promise<void> {
  // Serializable, because the chain's correctness depends on no two writers
  // reading the same tail. Postgres aborts one of a conflicting pair rather
  // than letting both link to the same predecessor — so the loser has to come
  // back and link to the winner instead of giving up.
  //
  // The contention is real, not hypothetical: moving one framework slider
  // PATCHes every control mapped to that framework in parallel, and each PATCH
  // writes an event. Without the retry those losers were swallowed by the
  // catch below, and a coverage change with no audit record is exactly the
  // thing this table exists to make impossible.
  for (let attempt = 1; ; attempt++) {
    try {
      await writeOnce(input);
      return;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isRetryableWriteConflict(err)) {
        // Jittered backoff: a fixed delay just re-synchronises the losers into
        // colliding again on the next attempt.
        await new Promise((r) => setTimeout(r, attempt * 25 + Math.random() * 25));
        continue;
      }
      // An audit write must never take down the operation it describes, but a
      // silently missing audit record is its own incident — so it is logged
      // loudly rather than swallowed (audit P1's principle, applied server-side).
      console.error(
        "AUDIT WRITE FAILED",
        { kind: input.kind, orgId: input.orgId, actorId: input.actorId, attempts: attempt },
        err
      );
      return;
    }
  }
}

async function writeOnce(input: AuditInput): Promise<void> {
    await prisma.$transaction(
      async (tx) => {
        const prev = await tx.auditEvent.findFirst({
          where: { orgId: input.orgId },
          // seq, NOT at. `at` has millisecond resolution, so two events written
          // in the same millisecond sort arbitrarily — and the writer picking
          // "latest by timestamp" could disagree with the verifier walking
          // "oldest by timestamp first" about which came first. The chain then
          // reported itself broken with nothing tampered with. A database
          // sequence is monotonic and total, which is what an append-only log
          // needs; `at` stays as the human-facing timestamp it always was.
          orderBy: { seq: "desc" },
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
}
