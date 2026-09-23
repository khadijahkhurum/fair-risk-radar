// POST /api/auth/logout — revoke the session server-side and clear the cookie.
import { NextRequest, NextResponse } from "next/server";
import { endSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  // Deleting the row is what actually ends the session; clearing the cookie is
  // only tidiness. An opaque server-side session can be revoked, which is the
  // main reason not to use a self-contained signed token here.
  if (token) await endSession(token).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions());
  return res;
}
