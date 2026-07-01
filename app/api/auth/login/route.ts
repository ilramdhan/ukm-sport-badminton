import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { issueAdminCookie } from "@/lib/auth/session";

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json(
      { error: "Username dan password wajib." },
      { status: 400 },
    );
  }

  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedUsername || !expectedHash) {
    return NextResponse.json(
      { error: "Auth belum diconfigure di server." },
      { status: 500 },
    );
  }

  if (username !== expectedUsername) {
    return NextResponse.json(
      { error: "Username atau password salah." },
      { status: 401 },
    );
  }

  const ok = await bcrypt.compare(password, expectedHash);
  if (!ok) {
    return NextResponse.json(
      { error: "Username atau password salah." },
      { status: 401 },
    );
  }

  await issueAdminCookie();
  return NextResponse.json({ ok: true });
}
