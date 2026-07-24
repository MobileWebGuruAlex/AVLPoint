/**
 * Edge gate for /admin — defense in depth, not the authority.
 *
 * This proxy runs before rendering and cheaply bounces requests that carry
 * no valid session token, or whose token's role *hint* isn't staff. It
 * cannot reach SQLite, so the authoritative check (live role + status +
 * session revocation from the DB) happens again in the admin layout and in
 * every server action / route handler. A stale role hint here can only
 * cause an extra redirect, never grant access.
 */
import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "avl_session";
const STAFF = new Set(["super_admin", "admin", "support"]);

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "avlpoint-dev-secret-change-me-in-production"
);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);

  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.redirect(loginUrl);

  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || !payload.jti) return NextResponse.redirect(loginUrl);
    if (!STAFF.has(String(payload.role ?? ""))) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  } catch {
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
