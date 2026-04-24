import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { sessionCookieName } from "@/lib/auth-config";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/login" ||
    pathname === "/demo" ||
    pathname === "/recuperar-senha" ||
    pathname === "/redefinir-senha" ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/pepa/n8n-import") ||
    pathname.startsWith("/api/pepa/n8n-file") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  const hasSession = Boolean(request.cookies.get(sessionCookieName)?.value);

  if (!hasSession && !isPublic) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  }

  const response = NextResponse.next();
  if (pathname === "/" || pathname === "/login") {
    response.headers.set("Cache-Control", "no-store, max-age=0");
  }
  return response;
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"]
};
