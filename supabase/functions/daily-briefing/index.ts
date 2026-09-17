// Daily briefing — Supabase Edge Function (Deno runtime).
//
// NOT YET DEPLOYED. Once a project exists:
//   supabase functions deploy daily-briefing
//   supabase secrets set GROQ_API_KEY=...
// then fill in and re-run the pg_cron block at the bottom of
// supabase/migrations/0004_phase2.sql to schedule it daily.
//
// For each active company, gathers open tasks / pending approvals / recent
// decisions, asks Groq's gpt-oss-20b (free self-serve tier — see
// lib/agent/model-pricing.ts) for a short plain-language summary, and
// inserts it as a `memories` row (scope='company', source='briefing') — the
// same row app/api/dashboard/route.ts reads back as the "Latest briefing"
// card. Never fabricates a summary: if a company has nothing to report, it
// says so rather than inventing activity.

import { createClient } from "jsr:@supabase/supabase-js@2";

const BRIEFING_MODEL = "openai/gpt-oss-20b";

interface CompanyBriefingInput {
  companyName: string;
  openTasks: Array<{ title: string; priority: string }>;
  pendingApprovals: Array<{ action_type: string }>;
  recentDecisions: Array<{ title: string }>;
}

async function summarize(input: CompanyBriefingInput): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY is not set for this Edge Function.");

  if (
    input.openTasks.length === 0 &&
    input.pendingApprovals.length === 0 &&
    input.recentDecisions.length === 0
  ) {
    return `Nothing open or pending for ${input.companyName} today.`;
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: BRIEFING_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "Write a short (3-5 sentence) daily briefing for a founder, in plain prose, based only on " +
            "the structured data given below. Never invent activity beyond it. If something is empty, " +
            "say so briefly rather than skipping it.",
        },
        {
          role: "user",
          content:
            `Company: ${input.companyName}\n` +
            `Open tasks: ${JSON.stringify(input.openTasks)}\n` +
            `Pending approvals: ${JSON.stringify(input.pendingApprovals)}\n` +
            `Recent decisions: ${JSON.stringify(input.recentDecisions)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  return body.choices?.[0]?.message?.content ?? "(empty response)";
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY", { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: companies, error: companiesErr } = await supabase
    .from("companies")
    .select("id, name")
    .eq("status", "active");
  if (companiesErr) {
    return new Response(`Failed to list companies: ${companiesErr.message}`, { status: 500 });
  }

  const results: Array<{ company: string; ok: boolean; error?: string }> = [];

  for (const company of companies ?? []) {
    try {
      const [tasksRes, approvalsRes, decisionsRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("title, priority")
          .eq("company_id", company.id)
          .not("status", "in", "(done,cancelled)")
          .limit(10),
        supabase
          .from("approvals")
          .select("action_type")
          .eq("company_id", company.id)
          .eq("status", "pending")
          .limit(10),
        supabase
          .from("decisions")
          .select("title")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const content = await summarize({
        companyName: company.name,
        openTasks: tasksRes.data ?? [],
        pendingApprovals: approvalsRes.data ?? [],
        recentDecisions: decisionsRes.data ?? [],
      });

      const { error: insertErr } = await supabase.from("memories").insert({
        scope: "company",
        scope_id: company.id,
        content,
        source: "briefing",
        importance: 0.6,
      });
      if (insertErr) throw insertErr;

      results.push({ company: company.name, ok: true });
    } catch (err) {
      results.push({ company: company.name, ok: false, error: String(err) });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { "content-type": "application/json" },
  });
});
