/**
 * Scripted agent-run scenarios: checks tool-call SHAPE (which tool, roughly
 * what it did), not exact wording — model output varies, the integration
 * contract shouldn't.
 *
 * Usage: npx tsx scripts/test-agent-scenarios.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { runChatTurn } from "../lib/agent/ceo-agent";

const ODAX_ID = "00000000-0000-0000-0000-000000000002";

type Check = { name: string; pass: boolean; detail?: string };
const results: Check[] = [];
function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const email = `agent-scenario-test-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const { data: user, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr) throw userErr;
  await admin.from("company_members").insert({
    company_id: ODAX_ID,
    user_id: user.user.id,
    role: "owner",
    controls_approvals: true,
  });
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

  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password });

  // Scenario 1: asking about open tasks should call query_company_data(list, tasks).
  const r1 = await runChatTurn(client as never, {
    agentId: agent!.id,
    activeCompanyId: ODAX_ID,
    userId: user.user.id,
    userMessage: "What open tasks do we have right now?",
    history: [],
  });
  const listedTasks = r1.toolCalls.some(
    (c) => c.name === "query_company_data" && (c.input as { resource?: string }).resource === "tasks",
  );
  record("Asking about open tasks calls query_company_data(tasks)", listedTasks);

  // Scenario 2: asking to send an email should call send_email and create a pending approval.
  const r2 = await runChatTurn(client as never, {
    agentId: agent!.id,
    activeCompanyId: ODAX_ID,
    userId: user.user.id,
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
  await admin.from("company_members").delete().eq("user_id", user.user.id);
  await admin.auth.admin.deleteUser(user.user.id);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed.`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
