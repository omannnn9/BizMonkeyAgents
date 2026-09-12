import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Single-user internal tool, no login: the app always talks to Supabase as
 * the service role, server-side only. This key must never reach the
 * browser — every page that needs data now goes through a Next.js API
 * route or a Server Component, not a browser Supabase client (there isn't
 * one anymore; see the deleted lib/supabase/client.ts).
 *
 * RLS policies stay in the schema as defense-in-depth (harmless — the
 * service role bypasses them by design), but the app's own authorization
 * for "who can approve" is enforced in code (lib/agent/founder.ts /
 * lib/agent/approvals-authz.ts), not by a Postgres session's auth.uid().
 */
let client: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export async function createClient() {
  if (!client) {
    client = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
  }
  return client;
}
