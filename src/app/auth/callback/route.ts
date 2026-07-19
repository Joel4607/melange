import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Completes the email-confirmation / magic-link flow: Supabase redirects here
 * with a one-time `code`, which we exchange for a session before sending the
 * user on to their destination.
 */
function getSafeNextUrl(origin: string, next: string | null): string {
  if (!next) return "/app";
  try {
    const url = new URL(next, origin);
    if (url.origin === origin) {
      return url.pathname + url.search + url.hash;
    }
  } catch {
    // fall through to default
  }
  return "/app";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const dest = getSafeNextUrl(origin, next);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
