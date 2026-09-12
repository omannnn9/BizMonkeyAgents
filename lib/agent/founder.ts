import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * There is no login, so there's no session to read a user id from — but
 * FK constraints (documents.uploaded_by, approvals.decided_by, etc.) still
 * point at auth.users, and audit_log/agent_runs still want a real actor.
 * Resolved from the table (the one seeded founder row) rather than a
 * hardcoded literal, so it still comes from data, not application logic.
 */
export async function getFounderUserId(supabase: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await supabase.from("company_members").select("user_id").limit(1).single();
  if (error || !data) {
    throw new Error(
      "No founder membership found. Run `npm run seed:founder` after applying the migrations.",
    );
  }
  return data.user_id;
}
