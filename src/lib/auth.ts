// Session handling and the authorisation gate (audit S1).
//
// Every mutating endpoint previously reached business logic with no credential
// presented — a 400 "field required" proved the request had traversed the whole
// stack without meeting an auth check. requireUser() is that check, and it is
// the AUTHORITATIVE one: middleware only redirects, because a cookie a client
// controls can never be the security boundary.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { hashSessionToken, newSessionToken } from "./password";
import { atLeast, type Role } from "./roles";
import { SESSION_COOKIE } from "./session-cookie";

export { SESSION_COOKIE, sessionCookieOptions } from "./session-cookie";

// Short by web-app standards, deliberately. This tool holds an organisation's
// unmitigated weaknesses and named accountable individuals; a month-long
// session on that is not a trade worth making.
const SESSION_HOURS = 12;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgId: string;
  orgName: string;
  isDemo: boolean;
}

export async function startSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await prisma.session.create({
    data: { tokenHash: hashSessionToken(token), userId, expiresAt },
  });
  return { token, expiresAt };
}

export async function endSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

/** Resolve the caller from their session cookie, or null. Never throws. */
export async function currentUser(): Promise<AuthUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { include: { org: true } } },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    // Expired sessions are removed on use rather than by a scheduled job —
    // the row is worthless once expired and this keeps the table honest.
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as Role,
    orgId: session.user.orgId,
    orgName: session.user.org.name,
    isDemo: session.user.isDemo,
  };
}

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; response: NextResponse };

/**
 * The gate every API route calls first.
 *
 * 401 when there is no valid session, 403 when the session exists but the role
 * is insufficient — distinguished because "log in" and "you may not do this"
 * are different instructions to the caller.
 */
export async function requireUser(minRole: Role = "VIEWER"): Promise<AuthResult> {
  const user = await currentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }
  if (!atLeast(user.role, minRole)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `This action requires the ${minRole} role or higher`, yourRole: user.role },
        { status: 403 }
      ),
    };
  }
  return { ok: true, user };
}

