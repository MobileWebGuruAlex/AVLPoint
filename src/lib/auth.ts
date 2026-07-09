/**
 * Session management — signed JWT in an httpOnly cookie (jose, HS256).
 * Users/sessions tables already exist via migrations/001_auth_tables.sql.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "avl_session";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "avlpoint-dev-secret-change-me-in-production"
);

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export async function createSession(user: {
  id: string;
  email: string;
  first_name?: string | null;
  role: string;
}): Promise<void> {
  const token = await new SignJWT({
    email: user.email,
    name: user.first_name ?? user.email.split("@")[0],
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export async function getSession(): Promise<Session | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? "Account"),
      role: String(payload.role ?? "buyer"),
    };
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
