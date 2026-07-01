import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "mabar_admin_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 hari

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET tidak diset di environment");
  return new TextEncoder().encode(secret);
}

export interface AdminSession {
  sub: string;
  role: "admin";
  iat: number;
  exp: number;
}

export async function issueAdminCookie(): Promise<void> {
  const jwt = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(process.env.ADMIN_USERNAME ?? "Admin")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearAdminCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.role !== "admin") return null;
    return payload as unknown as AdminSession;
  } catch {
    return null;
  }
}

/**
 * Panggil di setiap Server Action / API route yang butuh admin.
 * Karena Server Actions bypass proxy matcher, kita WAJIB cek di sini juga.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;
