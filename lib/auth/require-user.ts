import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/auth/allowed-email";
import { getAllowedEmail } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Call at the top of every protected page, Server Action and Route Handler.
 * proxy.ts already guards routes, but a proxy can be misconfigured or
 * bypassed, so each page checks again. getUser() asks the Auth server, so a
 * deleted or banned user is caught even while their JWT is still valid.
 */
export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (!isAllowedEmail(user.email, getAllowedEmail())) {
    console.warn("requireUser: rejecting a user whose email is not ALLOWED_EMAIL");
    // Revokes the session server-side; proxy.ts clears the cookies on the
    // next request.
    await supabase.auth.signOut({ scope: "global" });
    redirect("/login?error=not_allowed");
  }

  return user;
}
