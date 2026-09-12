/**
 * Cross-company RLS isolation test. Creates two throwaway users, each a
 * member of exactly one company (ODAX and Tablo), then proves a member of
 * one company cannot read or write the other's rows in any company-scoped
 * table — enforced by Postgres RLS, not application code.
 *
 * The app itself no longer relies on this (there's no login, so it always
 * talks to Supabase as the service role, which bypasses RLS by design —
 * see lib/supabase/server.ts). RLS stays in the schema as defense-in-depth
 * for the anon key, so this test still matters: it's what proves that key
 * is actually safe if it were ever exposed or a future feature reintroduces
 * browser-side Supabase access.
 *
 * Usage: npx tsx scripts/test-rls-isolation.ts
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY in the environment (.env.local).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const ODAX_ID = "00000000-0000-0000-0000-000000000002";
const TABLO_ID = "00000000-0000-0000-0000-000000000003";

type Check = { name: string; pass: boolean; detail?: string };
const results: Check[] = [];
function record(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY must be set",
    );
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const odaxUserEmail = `rls-test-odax-${randomUUID()}@example.invalid`;
  const tabloUserEmail = `rls-test-tablo-${randomUUID()}@example.invalid`;
  const password = randomUUID();

  const { data: odaxUser, error: e1 } = await admin.auth.admin.createUser({
    email: odaxUserEmail,
    password,
    email_confirm: true,
  });
  if (e1) throw e1;
  const { data: tabloUser, error: e2 } = await admin.auth.admin.createUser({
    email: tabloUserEmail,
    password,
    email_confirm: true,
  });
  if (e2) throw e2;

  await admin.from("company_members").insert([
    { company_id: ODAX_ID, user_id: odaxUser.user.id, role: "member", controls_approvals: false },
    { company_id: TABLO_ID, user_id: tabloUser.user.id, role: "member", controls_approvals: false },
  ]);

  // Seed one private row per company so there's something to try to leak.
  const { data: odaxTask } = await admin
    .from("tasks")
    .insert({ company_id: ODAX_ID, title: "ODAX-private-task" })
    .select("id")
    .single();
  const { data: tabloTask } = await admin
    .from("tasks")
    .insert({ company_id: TABLO_ID, title: "Tablo-private-task" })
    .select("id")
    .single();
  const { data: odaxDecision } = await admin
    .from("decisions")
    .insert({ company_id: ODAX_ID, title: "ODAX-private-decision" })
    .select("id")
    .single();

  async function signInAs(email: string): Promise<SupabaseClient> {
    const client = createClient(url!, anonKey!);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  const asOdax = await signInAs(odaxUserEmail);
  const asTablo = await signInAs(tabloUserEmail);

  // 1. ODAX member cannot SELECT Tablo's tasks.
  const { data: leakedTasks } = await asOdax
    .from("tasks")
    .select("id")
    .eq("company_id", TABLO_ID);
  record(
    "ODAX member cannot SELECT Tablo tasks",
    !leakedTasks || leakedTasks.length === 0,
    `rows returned: ${leakedTasks?.length ?? 0}`,
  );

  // 2. ODAX member cannot SELECT Tablo's company row itself.
  const { data: leakedCompany } = await asOdax
    .from("companies")
    .select("id")
    .eq("id", TABLO_ID);
  record(
    "ODAX member cannot SELECT Tablo company row",
    !leakedCompany || leakedCompany.length === 0,
  );

  // 3. ODAX member cannot SELECT Tablo's decisions.
  const { data: leakedDecisions } = await asOdax
    .from("decisions")
    .select("id")
    .eq("company_id", TABLO_ID);
  record(
    "ODAX member cannot SELECT Tablo decisions",
    !leakedDecisions || leakedDecisions.length === 0,
  );

  // 4. ODAX member cannot INSERT a task into Tablo.
  const { error: insertErr } = await asOdax
    .from("tasks")
    .insert({ company_id: TABLO_ID, title: "cross-company-injection-attempt" });
  record("ODAX member cannot INSERT a Tablo task", !!insertErr, insertErr?.message);

  // 5. ODAX member cannot UPDATE an existing Tablo task.
  const { error: updateErr, data: updateData } = await asOdax
    .from("tasks")
    .update({ title: "hijacked" })
    .eq("id", tabloTask!.id)
    .select();
  record(
    "ODAX member cannot UPDATE a Tablo task",
    !!updateErr || !updateData || updateData.length === 0,
    updateErr?.message,
  );

  // 6. ODAX member cannot DELETE a Tablo task.
  const { error: deleteErr, data: deleteData } = await asOdax
    .from("tasks")
    .delete()
    .eq("id", tabloTask!.id)
    .select();
  record(
    "ODAX member cannot DELETE a Tablo task",
    !!deleteErr || !deleteData || deleteData.length === 0,
    deleteErr?.message,
  );

  // 7. ODAX member CAN see their own company's task (sanity check — proves
  //    the test isn't just failing everything).
  const { data: ownTasks } = await asOdax
    .from("tasks")
    .select("id")
    .eq("company_id", ODAX_ID);
  record(
    "ODAX member CAN see their own ODAX task (sanity check)",
    !!ownTasks && ownTasks.some((t) => t.id === odaxTask!.id),
  );

  // 8. Tablo member cannot see ODAX's company_members roster.
  const { data: leakedMembers } = await asTablo
    .from("company_members")
    .select("id")
    .eq("company_id", ODAX_ID);
  record(
    "Tablo member cannot SELECT ODAX company_members",
    !leakedMembers || leakedMembers.length === 0,
  );

  // 9. Tablo member cannot read ODAX's agent_runs (via the denormalized
  //    company_id + trigger).
  const { data: odaxAgent } = await admin
    .from("agents")
    .select("id")
    .eq("company_id", ODAX_ID)
    .limit(1)
    .single();
  const { data: odaxRun } = await admin
    .from("agent_runs")
    .insert({ agent_id: odaxAgent!.id, input: "test", model: "claude-sonnet-5" })
    .select("id, company_id")
    .single();
  record(
    "agent_runs trigger derived company_id correctly",
    odaxRun?.company_id === ODAX_ID,
    `got ${odaxRun?.company_id}`,
  );
  const { data: leakedRuns } = await asTablo
    .from("agent_runs")
    .select("id")
    .eq("id", odaxRun!.id);
  record("Tablo member cannot SELECT ODAX agent_runs", !leakedRuns || leakedRuns.length === 0);

  // Cleanup
  await admin.from("tasks").delete().in("id", [odaxTask!.id, tabloTask!.id]);
  await admin.from("decisions").delete().eq("id", odaxDecision!.id);
  await admin.from("agent_runs").delete().eq("id", odaxRun!.id);
  await admin.auth.admin.deleteUser(odaxUser.user.id);
  await admin.auth.admin.deleteUser(tabloUser.user.id);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.error(`${failed.length} ISOLATION CHECK(S) FAILED — do not proceed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
