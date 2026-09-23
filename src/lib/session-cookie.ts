// Cookie name and attributes, in a module with NO imports.
//
// middleware.ts runs on the Edge runtime. If it imported these from lib/auth,
// it would pull in Prisma and next/headers with them and fail to build — so
// the two things the edge needs live on their own.
export const SESSION_COOKIE = "frr_session";

export function sessionCookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(expiresAt ? { expires: expiresAt } : { maxAge: 0 }),
  };
}
