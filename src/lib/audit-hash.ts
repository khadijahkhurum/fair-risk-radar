// The tamper-evidence primitives for the audit trail (audit S6).
//
// Kept separate from the database writer so the hashing is pure, testable and
// independent of Prisma — the chain is the part an auditor would want to
// re-derive themselves.
import { createHash } from "node:crypto";

/**
 * Deterministic JSON: object keys sorted at every depth.
 *
 * A hash chain is worthless if the same logical payload can serialise two
 * ways, because verification would then fail on key order rather than on
 * tampering. Arrays keep their order — that is data, not formatting.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export interface HashableEvent {
  prevHash: string | null;
  orgId: string;
  actorId: string;
  kind: string;
  at: Date | string;
  detail: unknown;
}

/** Each link binds the previous hash, so altering any earlier row breaks every later one. */
export function computeEventHash(e: HashableEvent): string {
  const at = typeof e.at === "string" ? e.at : e.at.toISOString();
  const payload = [
    e.prevHash ?? "GENESIS",
    e.orgId,
    e.actorId,
    e.kind,
    at,
    createHash("sha256").update(canonicalJson(e.detail)).digest("base64url"),
  ].join("|");
  return createHash("sha256").update(payload).digest("base64url");
}

/** Recompute the chain end to end; returns the first index that fails, or null. */
export function findChainBreak(events: (HashableEvent & { hash: string })[]): number | null {
  let prev: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const expected = computeEventHash({ ...events[i], prevHash: prev });
    if (expected !== events[i].hash) return i;
    prev = events[i].hash;
  }
  return null;
}
