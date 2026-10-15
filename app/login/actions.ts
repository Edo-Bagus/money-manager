"use server";

import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/auth/allowed-email";
import { NOT_ALLOWED_MESSAGE } from "@/lib/auth/messages";
import { getAllowedEmail } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// `email` is echoed back so the field survives React's automatic form reset
// after a failed attempt.
export type LoginState = { error?: string; email?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Isi email dan password.", email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "invalid_credentials") {
      return { error: "Email atau password salah.", email };
    }
    console.error("login: signInWithPassword failed", error.code, error.message);
    return { error: "Login gagal. Coba lagi sebentar lagi.", email };
  }

  // Defence in depth: sign-up is disabled in Supabase, but if any other
  // account exists it still must not get in.
  const allowedEmail = getAllowedEmail();
  if (!isAllowedEmail(data.user.email, allowedEmail)) {
    if (!allowedEmail?.trim()) console.error("login: ALLOWED_EMAIL is not set");
    await supabase.auth.signOut({ scope: "global" });
    return { error: NOT_ALLOWED_MESSAGE, email };
  }

  redirect("/");
}
