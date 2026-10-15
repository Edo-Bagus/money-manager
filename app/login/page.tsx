import type { Metadata } from "next";
import { NOT_ALLOWED_MESSAGE } from "@/lib/auth/messages";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk · Money Tracker" };

// No sign-up page by design: the single account is created in the
// Supabase dashboard (SPEC §4).
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Masuk</h1>
      <LoginForm initialError={error === "not_allowed" ? NOT_ALLOWED_MESSAGE : undefined} />
    </main>
  );
}
