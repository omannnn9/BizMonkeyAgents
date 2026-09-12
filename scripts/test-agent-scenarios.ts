/**
 * Scripted agent-run scenarios: checks tool-call SHAPE (which tool, roughly
 * what it did), not exact wording — model output varies, the integration
 * contract shouldn't.
 *
 * Uses the service-role client + the seeded founder identity directly (no
 * throwaway signed-in user) — that's what the real app does too, since
 * there's no login. Run `npm run seed:founder` first.
 *
 * Usage: npx tsx scripts/test-agent-scenarios.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { runAgentTurn } from "../lib/agent/agent-runtime";
import { getFounderUserId } from "../lib/agent/founder";
import type { Database } from "../lib/supabase/types";

const OD_HOLDINGS_ID = "00000000-0000-0000-0000-000000000001";
const ODAX_ID = "00000000-0000-0000-0000-000000000002";
const SALES_AGENT_ID = "00000000-0000-0000-0000-000000000012";
const MARKETING_AGENT_ID = "00000000-0000-0000-0000-000000000013";
const GROUP_CFO_ID = "00000000-0000-0000-0000-000000000030";

type Check = { name: string; pass: boolean; detail?: string };
const results: Check[] = [];
function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

  const userId = await getFounderUserId(admin);
  const { data: seededTask } = await admin
    .from("tasks")
    .insert({ company_id: ODAX_ID, title: "Follow up with MD on Q3 numbers", status: "open" })
    .select("id")
    .single();

  // ODAX has three company-scope agents since migration 0004 (CEO, Sales,
  // Marketing) — name it explicitly rather than .single() on scope alone.
  const { data: agent } = await admin
    .from("agents")
    .select("id")
    .eq("company_id", ODAX_ID)
    .eq("name", "CEO Agent")
    .single();

  // Scenario 1: asking about open tasks should call query_company_data(list, tasks).
  const r1 = await runAgentTurn(admin, {
    agentId: agent!.id,
    activeCompanyId: ODAX_ID,
    userId,
    userMessage: "What open tasks do we have right now?",
    history: [],
  });
  const listedTasks = r1.toolCalls.some(
    (c) => c.name === "query_company_data" && (c.input as { resource?: string }).resource === "tasks",
  );
  record("Asking about open tasks calls query_company_data(tasks)", listedTasks);

  // Scenario 2: asking to send an email should call send_email and create a pending approval.
  const r2 = await runAgentTurn(admin, {
    agentId: agent!.id,
    activeCompanyId: ODAX_ID,
    userId,
    userMessage:
      "Draft and send an email to md@example.com letting them know the Q3 numbers follow-up is in progress.",
    history: [],
  });
  const calledSendEmail = r2.toolCalls.some((c) => c.name === "send_email");
  record("Asking to send an email calls send_email", calledSendEmail);

  const { data: pendingApprovals } = await admin
    .from("approvals")
    .select("id, status, action_type")
    .eq("company_id", ODAX_ID)
    .eq("action_type", "send_email")
    .eq("status", "pending");
  record(
    "send_email creates a pending approval (never sends directly)",
    !!pendingApprovals && pendingApprovals.length > 0,
  );

  // Scenario 3: asking the Sales Agent to enrich a lead should call
  // enrich_lead and create a pending approval — never silently "done",
  // since Apollo.io isn't connected (see lib/integrations/apollo.ts).
  const r3 = await runAgentTurn(admin, {
    agentId: SALES_AGENT_ID,
    activeCompanyId: ODAX_ID,
    userId,
    userMessage: "Enrich the lead at acme.com and score it.",
    history: [],
  });
  record("Asking the Sales Agent to enrich a lead calls enrich_lead", r3.toolCalls.some((c) => c.name === "enrich_lead"));

  const { data: pendingLeadApprovals } = await admin
    .from("approvals")
    .select("id")
    .eq("company_id", ODAX_ID)
    .eq("action_type", "enrich_lead")
    .eq("status", "pending");
  record(
    "enrich_lead creates a pending approval (never enriches directly)",
    !!pendingLeadApprovals && pendingLeadApprovals.length > 0,
  );

  // Scenario 4: asking the Marketing Agent to generate an asset should call
  // generate_creative_asset and create a pending approval — Higgsfield
  // isn't connected (see lib/integrations/higgsfield.ts).
  const r4 = await runAgentTurn(admin, {
    agentId: MARKETING_AGENT_ID,
    activeCompanyId: ODAX_ID,
    userId,
    userMessage: "Generate a promo image for the new ODAX pricing page.",
    history: [],
  });
  record(
    "Asking the Marketing Agent to generate an asset calls generate_creative_asset",
    r4.toolCalls.some((c) => c.name === "generate_creative_asset"),
  );

  const { data: pendingAssetApprovals } = await admin
    .from("approvals")
    .select("id")
    .eq("company_id", ODAX_ID)
    .eq("action_type", "generate_creative_asset")
    .eq("status", "pending");
  record(
    "generate_creative_asset creates a pending approval (never generates directly)",
    !!pendingAssetApprovals && pendingAssetApprovals.length > 0,
  );

  // Scenario 5: asking the CEO agent to promote a memory should call
  // promote_memory and create a new group-scope row pointing back at the
  // original via promoted_from_id — never silently no-op.
  const { data: seededMemory } = await admin
    .from("memories")
    .insert({
      scope: "company",
      scope_id: ODAX_ID,
      content: "Test-agent-scenarios: temporary memory for promote_memory scenario.",
      created_by: userId,
    })
    .select("id")
    .single();

  const r5 = await runAgentTurn(admin, {
    agentId: agent!.id,
    activeCompanyId: ODAX_ID,
    userId,
    userMessage: `Promote memory ${seededMemory!.id} to the group so every company can see it.`,
    history: [],
  });
  record("Asking to promote a memory calls promote_memory", r5.toolCalls.some((c) => c.name === "promote_memory"));

  const { data: promotedMemory } = await admin
    .from("memories")
    .select("id")
    .eq("promoted_from_id", seededMemory!.id)
    .eq("scope", "group")
    .maybeSingle();
  record("promote_memory creates a new group-scope row referencing the original", !!promotedMemory);

  // Scenario 6: asking the Group CFO for a board report should call
  // generate_board_report and reference the real seeded goal, never invent figures.
  const { data: seededGoal } = await admin
    .from("goals")
    .insert({ company_id: ODAX_ID, objective: "Test-agent-scenarios temporary goal", status: "on_track" })
    .select("id")
    .single();

  const r6 = await runAgentTurn(admin, {
    agentId: GROUP_CFO_ID,
    activeCompanyId: OD_HOLDINGS_ID,
    userId,
    userMessage: "Generate a board report for Q3 2025.",
    history: [],
  });
  const boardReportCall = r6.toolCalls.find((c) => c.name === "generate_board_report");
  record("Asking the Group CFO for a board report calls generate_board_report", !!boardReportCall);
  record(
    "The board report references the real seeded goal",
    !!boardReportCall && boardReportCall.result.includes("Test-agent-scenarios temporary goal"),
  );

  // Cleanup.
  await admin.from("memories").delete().in("id", [seededMemory!.id, ...(promotedMemory ? [promotedMemory.id] : [])]);
  await admin.from("goals").delete().eq("id", seededGoal!.id);
  await admin
    .from("agent_runs")
    .delete()
    .eq("agent_id", agent!.id)
    .eq("input", `Promote memory ${seededMemory!.id} to the group so every company can see it.`);
  await admin.from("agent_runs").delete().eq("agent_id", GROUP_CFO_ID).eq("input", "Generate a board report for Q3 2025.");

  const allPendingApprovalIds = [
    ...(pendingApprovals ?? []),
    ...(pendingLeadApprovals ?? []),
    ...(pendingAssetApprovals ?? []),
  ].map((a) => a.id);
  if (allPendingApprovalIds.length > 0) {
    await admin.from("approvals").delete().in("id", allPendingApprovalIds);
  }
  await admin.from("tasks").delete().eq("id", seededTask!.id);
  await admin.from("agent_runs").delete().eq("agent_id", agent!.id).in("input", [
    "What open tasks do we have right now?",
    "Draft and send an email to md@example.com letting them know the Q3 numbers follow-up is in progress.",
  ]);
  await admin.from("agent_runs").delete().eq("agent_id", SALES_AGENT_ID).eq("input", "Enrich the lead at acme.com and score it.");
  await admin
    .from("agent_runs")
    .delete()
    .eq("agent_id", MARKETING_AGENT_ID)
    .eq("input", "Generate a promo image for the new ODAX pricing page.");

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed.`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
