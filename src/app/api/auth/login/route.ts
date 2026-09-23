// POST /api/auth/login — exchange credentials for a session cookie.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { startSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { parseBody, Login } from "@/lib/api-schemas";
import { recordAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

// A real scrypt hash of a value nobody holds. When the email is unknown we
// still run a full verification against this, so a missing account costs the
// same wall-clock time as a wrong password and the endpoint cannot be used to
// enumerate who has an account.
const DECOY_HASH =
  "scrypt$32768$8$1$/njj3HN0KexUYoAgTY8vcA==$dzlrkYhvnCiHmxahYhMlR593M8pYlAcz3AK1bv2lBKs=";

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, Login);
  if (!parsed.ok) return parsed.response;
  const email = parsed.data.email.toLowerCase();

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DECOY_HASH);

    // One message for both failure modes — "no such user" and "wrong password"
    // are the same answer to anyone who is not the account holder.
    if (!user || !ok) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const { token, expiresAt } = await startSession(user.id);
    await recordAuditEvent({
      orgId: user.orgId,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      kind: "AUTH",
      detail: { action: "sign_in" },
    });

    const res = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return res;
  } catch (err) {
    console.error("POST /api/auth/login failed:", err);
    return NextResponse.json({ error: "Sign-in failed" }, { status: 500 });
  }
}
