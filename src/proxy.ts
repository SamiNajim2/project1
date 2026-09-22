import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./lib/supabase/config";

const PROTECTED_PREFIXES = ["/projects", "/billing"];
const AUTH_PAGES = ["/login", "/signup"];

/** Refreshes the Supabase session cookie on every request and routes visitors by sign-in state. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Must run before any redirect so a refreshed token is written to the response.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!signedIn && PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (signedIn && AUTH_PAGES.includes(pathname)) {
    return redirectTo("/projects");
  }
  return response;
}

export const config = {
  // Skip static assets and the Stripe webhook (it authenticates with its signature, not a session).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|samples/|api/stripe/webhook|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
