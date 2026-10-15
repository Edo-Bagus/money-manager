/**
 * Single-user gate (SPEC §4): only the account whose email equals
 * ALLOWED_EMAIL may use the app, even if another user somehow exists in
 * Supabase Auth. Fails closed: an unset or blank ALLOWED_EMAIL allows nobody.
 */
export function isAllowedEmail(
  email: string | null | undefined,
  allowedEmail: string | null | undefined,
): boolean {
  const allowed = normalize(allowedEmail);
  if (!allowed) return false;
  return normalize(email) === allowed;
}

function normalize(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}
