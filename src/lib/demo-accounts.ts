// The demo accounts, defined ONCE.
//
// These existed twice: prisma/seed.ts hashed a password and listed four
// emails, and the sign-in page listed the same four emails and its own copy of
// the password. The seed's copy was `process.env.DEMO_PASSWORD ?? "demo-password"`
// while the page's was the literal, so setting that variable — or re-seeding on
// a machine where it was set — hashed one password and left the buttons sending
// a different one. Every demo button then failed, with nothing in the code
// looking wrong, because each half was correct on its own.
//
// Same reasoning as audit-kinds.ts: two copies of one fact will diverge, so the
// fix is to have one copy. Zero imports beyond the role type, so the seed
// script and a client component can both use it.
//
// The DEMO_PASSWORD environment override is deliberately gone. It was config
// for a value that cannot vary: the sign-in page has to know this password to
// offer one-click access, so it is public by construction and there is nothing
// for an override to protect. A deployment that wants no public access sets
// DEMO_ACCOUNTS=off, which removes the accounts rather than hiding their
// password.
import type { Role } from "./roles";

/** Published on the sign-in page on purpose — see the note above. */
export const DEMO_PASSWORD = "demo-password";

export const DEMO_USERS: { email: string; name: string; role: Role }[] = [
  { email: "viewer@demo.fairriskradar.app", name: "Dana Viewer", role: "VIEWER" },
  { email: "analyst@demo.fairriskradar.app", name: "Alex Analyst", role: "ANALYST" },
  { email: "owner@demo.fairriskradar.app", name: "Omar Owner", role: "CONTROL_OWNER" },
  { email: "admin@demo.fairriskradar.app", name: "Ada Admin", role: "ADMIN" },
];

/** Role → email, for the sign-in page's one-click buttons. */
export const DEMO_EMAIL = Object.fromEntries(
  DEMO_USERS.map((u) => [u.role, u.email])
) as Record<Role, string>;
