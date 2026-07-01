import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "mabar_admin_session";

export const config = {
  // Gate /admin/* dan /api/admin/*. Public: /, /login, /api/auth/*.
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.JWT_SECRET;

  if (token && secret) {
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(secret),
      );
      if (payload.role === "admin") {
        return NextResponse.next();
      }
    } catch {
      // fall through ke redirect
    }
  }

  // Not authenticated
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
