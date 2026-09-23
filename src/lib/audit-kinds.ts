// The audit event taxonomy, in ONE place.
//
// This existed three times: the Prisma enum, the AuditKind union in audit.ts,
// and a third copy in the audit page's own union, KIND_STYLE record and filter
// array. Adding ERASURE to the schema and one of the unions left the other two
// behind — and because the page indexes KIND_STYLE by the event's kind, the
// missing entry would have been an undefined lookup and a runtime crash on the
// audit page rather than merely a missing filter chip.
//
// Zero imports on purpose, exactly like session-cookie.ts: the audit page is a
// client component, and audit.ts pulls in Prisma. Sharing the list through
// this module means the client can have the taxonomy without the database
// client coming with it.
//
// The Prisma enum still has to list these separately — that is the schema
// language, not TypeScript. It is the one remaining copy, and a mismatch there
// fails at the database boundary rather than silently.

export const AUDIT_KINDS = [
  "SIMULATION",
  "COVERAGE",
  "EVIDENCE",
  "RISK",
  "AUTH",
  "APPROVAL",
  "ERASURE",
] as const;

export type AuditKind = (typeof AUDIT_KINDS)[number];
