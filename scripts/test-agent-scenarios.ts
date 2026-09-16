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
import { embedDocuments } from "../lib/embeddings/voyage";
import { requestFromAgentTool } from "../lib/agent/tools/request-from-agent";
import { recordMemoryTool } from "../lib/agent/tools/record-memory";
import { updateMemoryTool } from "../lib/agent/tools/update-memory";
import { assignTaskTool } from "../lib/agent/tools/assign-task";
import { recordDecisionTool } from "../lib/agent/tools/record-decision";
import { createGoalTool } from "../lib/agent/tools/create-goal";
import type { Database } from "../lib/supabase/types";

const OD_HOLDINGS_ID = "00000000-0000-0000-0000-000000000001";
const ODAX_ID = "00000000-0000-0000-0000-000000000002";
const TABLO_ID = "00000000-0000-0000-0000-000000000003";
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

  // Scenario 7: asking the Group CFO to find synergies should call
  // detect_synergies and surface a real cross-company pair — seeded with
  // real embeddings (not just similar text) since match_cross_company_memories
  // filters on actual cosine similarity, same as production data would.
  const synergyText =
    "Most F&B leads prospected so far turned out to be home-based producers, not dine-in restaurants.";
  const [synergyEmbeddingA, synergyEmbeddingB] = await embedDocuments([
    synergyText,
    synergyText + " Same pattern showed up independently here too.",
  ]);
  const { data: synergyMemoryA } = await admin
    .from("memories")
    .insert({
      scope: "company",
      scope_id: ODAX_ID,
      content: synergyText,
      embedding: JSON.stringify(synergyEmbeddingA),
      created_by: userId,
    })
    .select("id")
    .single();
  const { data: synergyMemoryB } = await admin
    .from("memories")
    .insert({
      scope: "company",
      scope_id: TABLO_ID,
      content: synergyText + " Same pattern showed up independently here too.",
      embedding: JSON.stringify(synergyEmbeddingB),
      created_by: userId,
    })
    .select("id")
    .single();

  const r7 = await runAgentTurn(admin, {
    agentId: GROUP_CFO_ID,
    activeCompanyId: OD_HOLDINGS_ID,
    userId,
    userMessage: "Are there any cross-company synergies worth flagging right now?",
    history: [],
  });
  const synergyCall = r7.toolCalls.find((c) => c.name === "detect_synergies");
  record("Asking the Group CFO for synergies calls detect_synergies", !!synergyCall);
  record(
    "detect_synergies finds the seeded cross-company pair",
    !!synergyCall && synergyCall.result.includes("home-based producers"),
  );

  // Scenario 8: request_from_agent's handler is exercised directly (not
  // through the LLM tool loop, unlike every scenario above) since it's the
  // depth guard's behavior under test, not whether a model chooses to call
  // it — deterministic input/output, same reasoning `demoChatReply()`'s own
  // fixtures don't route through a real model either.
  const collabRequest = "Status of the Q3 creative brief?";
  const collabCtx = { supabase: admin, agentId: agent!.id, activeCompanyId: ODAX_ID, userId };

  const missingAgentResult = await requestFromAgentTool.handler(
    { targetAgentId: "00000000-0000-0000-0000-00000000dead", request: collabRequest },
    collabCtx,
  );
  record("request_from_agent errors on a nonexistent target agent", missingAgentResult.isError === true);

  const depthGuardResult = await requestFromAgentTool.handler(
    { targetAgentId: MARKETING_AGENT_ID, request: collabRequest },
    { ...collabCtx, depth: 2 },
  );
  record(
    "request_from_agent refuses to recurse past MAX_COLLAB_DEPTH",
    depthGuardResult.isError === true && !depthGuardResult.content.includes("Marketing"),
  );

  const collabResult = await requestFromAgentTool.handler(
    { targetAgentId: MARKETING_AGENT_ID, request: collabRequest },
    collabCtx,
  );
  record("request_from_agent's success path returns the target agent's reply", !collabResult.isError);

  const { data: targetRun } = await admin
    .from("agent_runs")
    .select("id")
    .eq("agent_id", MARKETING_AGENT_ID)
    .eq("input", collabRequest)
    .maybeSingle();
  record("The target agent gets its own independent agent_runs row", !!targetRun);

  const { data: collabAuditRow } = await admin
    .from("audit_log")
    .select("id")
    .eq("actor_id", agent!.id)
    .eq("action", "collaborate:request_from_agent")
    .eq("target_id", MARKETING_AGENT_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  record("The calling agent's audit_log records the collaboration", !!collabAuditRow);

  // Scenario 9: the Phase 1 knowledge-flow tools (record_memory,
  // update_memory, assign_task, record_decision, create_goal) — exercised
  // directly against the real handler, same reasoning as Scenario 8.
  const knowledgeCtx = { supabase: admin, agentId: agent!.id, activeCompanyId: ODAX_ID, userId };

  const recordedMemory = await recordMemoryTool.handler(
    { scope: "company", scopeId: ODAX_ID, content: "Test-agent-scenarios: a real recorded memory.", importance: 0.6 },
    knowledgeCtx,
  );
  record("record_memory creates a real, embedded memory", !recordedMemory.isError);
  const recordedMemoryId = recordedMemory.content.match(/memory id ([0-9a-f-]+)/)?.[1];

  const { data: matchedAfterRecord } = recordedMemoryId
    ? await admin.rpc("match_memories", {
        p_query_embedding: JSON.stringify(
          (await admin.from("memories").select("embedding").eq("id", recordedMemoryId).single()).data?.embedding ?? [],
        ),
        p_limit: 5,
      })
    : { data: null };
  record(
    "The recorded memory is retrievable via match_memories",
    !!matchedAfterRecord?.some((m: { id: string }) => m.id === recordedMemoryId),
  );

  const outOfScopeMemory = await recordMemoryTool.handler(
    { scope: "company", scopeId: TABLO_ID, content: "Should be rejected — Tablo isn't in ODAX's scope." },
    knowledgeCtx,
  );
  record("record_memory rejects an out-of-scope company", outOfScopeMemory.isError === true);

  const archived = recordedMemoryId
    ? await updateMemoryTool.handler({ memoryId: recordedMemoryId, archive: true }, knowledgeCtx)
    : { isError: true, content: "no memory id" };
  record("update_memory archives a memory", !archived.isError);
  const { data: archivedRow } = recordedMemoryId
    ? await admin.from("memories").select("archived_at").eq("id", recordedMemoryId).single()
    : { data: null };
  record("An archived memory has a real archived_at timestamp", !!archivedRow?.archived_at);

  const assignedTask = await assignTaskTool.handler(
    { title: "Test-agent-scenarios: a real assigned task.", assigneeAgentId: SALES_AGENT_ID, priority: "high" },
    knowledgeCtx,
  );
  record("assign_task creates and assigns a real task", !assignedTask.isError);
  const assignedTaskId = assignedTask.content.match(/task id ([0-9a-f-]+)/)?.[1];
  const { data: assignedRow } = assignedTaskId
    ? await admin.from("tasks").select("assigned_agent_id, priority").eq("id", assignedTaskId).single()
    : { data: null };
  record(
    "The assigned task has the real assignee and priority",
    assignedRow?.assigned_agent_id === SALES_AGENT_ID && assignedRow?.priority === "high",
  );

  const decisionResult = await recordDecisionTool.handler(
    { title: "Test-agent-scenarios: a real decision.", rationale: "Because the test says so." },
    knowledgeCtx,
  );
  record("record_decision writes a real decision row", !decisionResult.isError);
  const decisionId = decisionResult.content.match(/decision id ([0-9a-f-]+)/)?.[1];

  const groupGoalResult = await createGoalTool.handler(
    { objective: "Test-agent-scenarios: a real group goal.", companyId: OD_HOLDINGS_ID },
    { supabase: admin, agentId: GROUP_CFO_ID, activeCompanyId: OD_HOLDINGS_ID, userId },
  );
  record("create_goal creates a real group-level goal", !groupGoalResult.isError);
  const groupGoalId = groupGoalResult.content.match(/goal id ([0-9a-f-]+)/)?.[1];

  const companyGoalResult = groupGoalId
    ? await createGoalTool.handler({ objective: "Test-agent-scenarios: a cascaded company goal.", parentGoalId: groupGoalId }, knowledgeCtx)
    : { isError: true, content: "no parent goal id" };
  record("create_goal cascades a company goal from a real parent", !companyGoalResult.isError);
  const companyGoalId = companyGoalResult.content.match(/goal id ([0-9a-f-]+)/)?.[1];
  const { data: cascadedRow } = companyGoalId
    ? await admin.from("goals").select("parent_goal_id").eq("id", companyGoalId).single()
    : { data: null };
  record("The cascaded goal's parent_goal_id points at the real group goal", cascadedRow?.parent_goal_id === groupGoalId);

  // Cleanup.
  await admin.from("memories").delete().in("id", [synergyMemoryA!.id, synergyMemoryB!.id]);
  await admin
    .from("agent_runs")
    .delete()
    .eq("agent_id", GROUP_CFO_ID)
    .eq("input", "Are there any cross-company synergies worth flagging right now?");
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
  await admin.from("agent_runs").delete().eq("agent_id", MARKETING_AGENT_ID).eq("input", collabRequest);
  if (collabAuditRow) await admin.from("audit_log").delete().eq("id", collabAuditRow.id);
  if (companyGoalId) await admin.from("goals").delete().eq("id", companyGoalId);
  if (groupGoalId) await admin.from("goals").delete().eq("id", groupGoalId);
  if (decisionId) await admin.from("decisions").delete().eq("id", decisionId);
  if (assignedTaskId) await admin.from("tasks").delete().eq("id", assignedTaskId);
  if (recordedMemoryId) await admin.from("memories").delete().eq("id", recordedMemoryId);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed.`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
