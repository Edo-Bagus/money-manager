import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth/allowed-email";
import { getAllowedEmail, getSupabaseEnv } from "@/lib/env";

const LOGIN_PATH = "/login";

/**
 * Runs on every request matched by proxy.ts: refreshes the Supabase session
 * cookies, sends anonymous visitors to /login, and signs out any session
 * whose email is not ALLOWED_EMAIL.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Keep this the first call after createServerClient: it verifies the JWT
  // and refreshes an expiring session before any response is produced.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const onLoginPage = request.nextUrl.pathname === LOGIN_PATH;

  if (!claims) {
    return onLoginPage ? response : redirect(request, LOGIN_PATH, response);
  }

  if (!isAllowedEmail(claims.email, getAllowedEmail())) {
    console.warn("proxy: signing out a session whose email is not ALLOWED_EMAIL");
    await supabase.auth.signOut({ scope: "global" });
    const target = onLoginPage
      ? response
      : redirect(request, `${LOGIN_PATH}?error=not_allowed`, response);
    clearAuthCookies(request, target);
    return target;
  }

  return onLoginPage ? redirect(request, "/", response) : response;
}

/** Redirect that keeps any cookies/cache headers Supabase set on `from`. */
function redirect(request: NextRequest, location: string, from: NextResponse): NextResponse {
  const response = NextResponse.redirect(new URL(location, request.url));
  for (const cookie of from.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) response.headers.set(header, value);
  }
  return response;
}

/**
 * Belt and braces: signOut() already removes the session cookies, but a
 * rejected session must never survive, whatever signOut returned.
 */
function clearAuthCookies(request: NextRequest, response: NextResponse): void {
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith("sb-")) response.cookies.delete(name);
  }
}
