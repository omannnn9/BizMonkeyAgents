/**
 * One-time setup script for the no-login architecture: creates a single
 * auth.users row (there's no sign-up flow — this exists purely to satisfy
 * FK constraints on documents.uploaded_by, approvals.decided_by,
 * audit_log.actor_id, etc., and is never used to sign in anywhere) and
 * grants it membership (with controls_approvals) across OD Holdings + all
 * three companies. Idempotent — safe to re-run.
 *
 * Usage: FOUNDER_EMAIL=you@example.com npx tsx scripts/seed-founder-membership.ts
 * (FOUNDER_EMAIL is just a label for your own reference in the Supabase
 * dashboard's user list — defaults to founder@internal.local if omitted.)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const ALL_COMPANY_IDS = [
  "00000000-0000-0000-0000-000000000001", // OD Holdings
  "00000000-0000-0000-0000-000000000002", // ODAX
  "00000000-0000-0000-0000-000000000003", // Tablo
  "00000000-0000-0000-0000-000000000004", // NOVA
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const founderEmail = process.env.FOUNDER_EMAIL ?? "founder@internal.local";

  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  let user = usersPage.users.find((u) => u.email === founderEmail);

  if (!user) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: founderEmail,
      password: randomUUID(), // never used — there is no login UI
      email_confirm: true,
    });
    if (createErr) throw createErr;
    user = created.user;
    console.log(`Created auth.users row for ${founderEmail} (${user.id}).`);
  }

  const rows = ALL_COMPANY_IDS.map((company_id) => ({
    company_id,
    user_id: user!.id,
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
