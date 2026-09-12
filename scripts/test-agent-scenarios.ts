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
import { runChatTurn } from "../lib/agent/ceo-agent";
import { getFounderUserId } from "../lib/agent/founder";
import type { Database } from "../lib/supabase/types";

const ODAX_ID = "00000000-0000-0000-0000-000000000002";

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

  const { data: agent } = await admin
    .from("agents")
    .select("id")
    .eq("company_id", ODAX_ID)
    .eq("scope", "company")
    .single();

  // Scenario 1: asking about open tasks should call query_company_data(list, tasks).
  const r1 = await runChatTurn(admin, {
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
  const r2 = await runChatTurn(admin, {
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

  // Cleanup.
  if (pendingApprovals) {
    await admin.from("approvals").delete().in("id", pendingApprovals.map((a) => a.id));
  }
  await admin.from("tasks").delete().eq("id", seededTask!.id);
  await admin.from("agent_runs").delete().eq("agent_id", agent!.id).in("input", [
    "What open tasks do we have right now?",
    "Draft and send an email to md@example.com letting them know the Q3 numbers follow-up is in progress.",
  ]);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed.`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
