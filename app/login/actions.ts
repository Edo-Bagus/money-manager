"use server";

import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/auth/allowed-email";
import { NOT_ALLOWED_MESSAGE } from "@/lib/auth/messages";
import { getAllowedEmail } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Isi email dan password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "invalid_credentials") {
      return { error: "Email atau password salah." };
    }
    console.error("login: signInWithPassword failed", error.code, error.message);
    return { error: "Login gagal. Coba lagi sebentar lagi." };
  }

  // Defence in depth: sign-up is disabled in Supabase, but if any other
  // account exists it still must not get in.
  const allowedEmail = getAllowedEmail();
  if (!isAllowedEmail(data.user.email, allowedEmail)) {
    if (!allowedEmail?.trim()) console.error("login: ALLOWED_EMAIL is not set");
    await supabase.auth.signOut({ scope: "global" });
    return { error: NOT_ALLOWED_MESSAGE };
  }

  redirect("/");
}
