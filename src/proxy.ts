import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  createContentSecurityPolicy,
  createCspNonce,
} from "@/lib/security/csp";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const skipSessionRefresh =
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname === "/offline.html" ||
    pathname === "/offline.css" ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp)$/i.test(pathname);

  const nonce = createCspNonce();
  const contentSecurityPolicy = createContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", contentSecurityPolicy);

  const response = skipSessionRefresh
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : await updateSession(request, requestHeaders);
  response.headers.set("content-security-policy", contentSecurityPolicy);
  return response;
}

export const config = {
  // Next's internal assets cannot render HTML. Public asset paths still pass
  // through so a missing asset that becomes an HTML 404 receives a nonce/CSP.
  matcher: ["/((?!_next/static/|_next/image$).*)"],
};
