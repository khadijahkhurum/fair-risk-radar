import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

// Deny by default at the edge (audit S1).
//
// This is a ROUTING decision, not the security boundary: a cookie is client
// controlled, so presence proves nothing. Middleware runs on the Edge runtime
// where the database is not reachable, so the authoritative check — does this
// token map to a live session, and does that user hold the required role — is
// requireUser() inside each route handler and server component.
//
// What this does buy: an unauthenticated caller gets 401 (or a redirect)
// before reaching any handler, so a route that forgot its own check leaks an
// empty response rather than the risk register.
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const login = new URL("/login", req.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own static output and the icons the manifest needs.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-|apple-touch-icon|manifest.webmanifest).*)"],
};
