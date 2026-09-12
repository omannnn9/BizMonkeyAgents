/**
 * One-time setup script: grants the founder's auth.users account membership
 * (with controls_approvals) across OD Holdings + all three companies.
 * Run once, after the founder has signed up via Supabase Auth.
 *
 * Usage: FOUNDER_EMAIL=you@example.com npx tsx scripts/seed-founder-membership.ts
 *
 * Uses the service role key because this is one-time admin setup, not a
 * request-time code path — the key never touches the agent/runtime.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const ALL_COMPANY_IDS = [
  "00000000-0000-0000-0000-000000000001", // OD Holdings
  "00000000-0000-0000-0000-000000000002", // ODAX
  "00000000-0000-0000-0000-000000000003", // Tablo
  "00000000-0000-0000-0000-000000000004", // NOVA
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const founderEmail = process.env.FOUNDER_EMAIL;

  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  if (!founderEmail) {
    throw new Error("Set FOUNDER_EMAIL to the email the founder signed up with");
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  const user = usersPage.users.find((u) => u.email === founderEmail);
  if (!user) {
    throw new Error(
      `No auth.users row for ${founderEmail} yet — sign up via the app first, then re-run this script.`,
    );
  }

  const rows = ALL_COMPANY_IDS.map((company_id) => ({
    company_id,
    user_id: user.id,
    role: "owner" as const,
    controls_approvals: true,
  }));

  const { error: insertErr } = await admin
    .from("company_members")
    .upsert(rows, { onConflict: "company_id,user_id" });
  if (insertErr) throw insertErr;

  console.log(`Granted ${founderEmail} (${user.id}) membership on ${rows.length} companies.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
