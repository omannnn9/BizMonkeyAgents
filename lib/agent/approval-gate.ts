import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Json = Database["public"]["Tables"]["approvals"]["Row"]["payload"];

/**
 * Centralized pre-execution check for anything an agent wants to *do*
 * rather than just say. Every tool that reaches outside the system (email
 * today; anything customer- or money-adjacent later) must call this before
 * acting — never decide automatic/gated inline in the tool body.
 *
 * Unknown action types fail safe to founder_only: an action_policies row
 * must explicitly say "automatic" before anything skips human approval.
 */
export async function gateAction(
  supabase: SupabaseClient<Database>,
  params: {
    agentId: string;
    actionType: string;
    payload: Json;
    riskLevel?: "low" | "medium" | "high";
  },
): Promise<
  | { allowed: true; reason: "automatic" }
  | { allowed: false; approvalId: string; reason: "pending_approval" }
> {
  const { data: policy } = await supabase
    .from("action_policies")
    .select("classification")
    .eq("action_type", params.actionType)
    .maybeSingle();

  const classification = policy?.classification ?? "founder_only";

  if (classification === "automatic") {
    await supabase.from("audit_log").insert({
      actor_type: "agent",
      actor_id: params.agentId,
      action: `auto_execute:${params.actionType}`,
      target_type: "action_policies",
      target_id: null,
      metadata: { payload: params.payload },
    });
    return { allowed: true, reason: "automatic" };
  }

  const { data: approval, error } = await supabase
    .from("approvals")
    .insert({
      proposed_by_agent_id: params.agentId,
      action_type: params.actionType,
      payload: params.payload,
      risk_level: params.riskLevel ?? (classification === "founder_only" ? "high" : "medium"),
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !approval) {
    throw new Error(`Failed to create approval record: ${error?.message}`);
  }

  await supabase.from("audit_log").insert({
    actor_type: "agent",
    actor_id: params.agentId,
    action: `propose:${params.actionType}`,
    target_type: "approval",
    target_id: approval.id,
    metadata: { classification },
  });

  return { allowed: false, approvalId: approval.id, reason: "pending_approval" };
}
