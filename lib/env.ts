// Environment access, read lazily so that importing a module never throws
// (tests run with no env vars at all). See .env.example for every variable.

export function getSupabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set",
    );
  }
  return { url, publishableKey };
}

/** Server-only. Undefined means nobody is allowed in (see isAllowedEmail). */
export function getAllowedEmail(): string | undefined {
  return process.env.ALLOWED_EMAIL;
}

/** Server-only. Shared secret for POST /api/ingest/*. */
export function getIngestToken(): string | undefined {
  return process.env.INGEST_TOKEN;
}
