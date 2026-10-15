import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 name for what used to be middleware.ts.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Every route requires a session, except:
    // - /login (handled inside updateSession)
    // - /api/ingest/* (authenticated by X-Ingest-Token, not by session)
    // - Next.js build assets
    "/((?!api/ingest/|_next/static|_next/image|favicon\\.ico).*)",
  ],
};
