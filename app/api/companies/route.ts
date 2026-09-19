import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFounderUserId } from "@/lib/agent/founder";
import { withApiErrorHandling } from "@/lib/api-error";

export const GET = withApiErrorHandling(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug, parent_id, industry")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ companies: data ?? [] });
});

/**
 * The company-creator wizard (Part 16/14). Always seeds a default Managing
 * Director agent along with the company — the same company-wide synthesis
 * role migration 0009 gives every real company, enforced here structurally
 * rather than left as a manual follow-up step someone could forget.
 */
export const POST = withApiErrorHandling(async (request: Request) => {
  const { name, slug, parentId, industry } = (await request.json()) as {
    name: string;
    slug: string;
    parentId: string | null;
    industry?: string;
  };
  if (!name || !slug) {
    return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const founderUserId = await getFounderUserId(supabase);

  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .insert({ name, slug, parent_id: parentId || null, industry: industry || null })
    .select("id, name, slug, parent_id")
    .single();
  if (companyErr || !company) {
    return NextResponse.json({ error: companyErr?.message ?? "Failed to create company" }, { status: 500 });
  }

  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .insert({
      name: "Managing Director",
      role_title: null,
      company_id: company.id,
      scope: "company",
      persona: `You are the Managing Director for ${name}, responsible for company-wide synthesis.`,
      model: "openai/gpt-oss-120b",
      tools: ["query_company_data", "search_documents", "send_email", "generate_board_report", "request_from_agent", "assign_task", "create_goal", "record_memory"],
      status: "active",
    })
    .select("id")
    .single();
  if (agentErr || !agent) {
    return NextResponse.json(
      { error: `Company created, but failed to seed its Managing Director agent: ${agentErr?.message}` },
      { status: 500 },
    );
  }

  await supabase.from("edges").insert([
    ...(parentId
      ? [{ source_type: "company", source_id: parentId, target_type: "company", target_id: company.id, relation: "owns" }]
      : []),
    { source_type: "company", source_id: company.id, target_type: "agent", target_id: agent.id, relation: "has_agent" },
  ]);

  await supabase.from("audit_log").insert({
    actor_type: "user",
    actor_id: founderUserId,
    action: "create_company",
    target_type: "company",
    target_id: company.id,
    company_id: company.id,
  });

  return NextResponse.json({ company, agentId: agent.id });
});
