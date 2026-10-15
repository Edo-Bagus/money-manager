import { getIngestToken } from "@/lib/env";
import { safeEqual } from "@/lib/security/safe-equal";

// Called by the Apps Script forwarder (SPEC §7) with a shared secret, not a
// login session; proxy.ts deliberately does not cover /api/ingest/*.

export const runtime = "nodejs"; // node:crypto

const MIN_TOKEN_LENGTH = 32;

export async function POST(request: Request): Promise<Response> {
  const expected = getIngestToken()?.trim();
  if (!expected || expected.length < MIN_TOKEN_LENGTH) {
    console.error(
      `ingest: INGEST_TOKEN is unset or shorter than ${MIN_TOKEN_LENGTH} characters; rejecting all requests`,
    );
    return unauthorized();
  }

  // Checked before the body is read.
  const provided = request.headers.get("x-ingest-token");
  if (provided === null || !safeEqual(provided, expected)) {
    return unauthorized();
  }

  // Phase 0 stub: accepted, not processed. Storage and parsing come in Phase 2.
  return new Response(null, { status: 202 });
}

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
