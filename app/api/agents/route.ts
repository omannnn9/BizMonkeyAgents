import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFounderUserId } from "@/lib/agent/founder";
import { getToolByName } from "@/lib/agent/tools/registry";
import { withApiErrorHandling } from "@/lib/api-error";
import { isDemoMode, demoAgents } from "@/lib/demo-mode";

export const GET = withApiErrorHandling(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  if (isDemoMode()) return NextResponse.json(demoAgents(companyId));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, role_title")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data ?? [] });
});

/** The agent-creator wizard (Part 16/14). A founder-direct action, not agent-proposed — no approval gate. */
export const POST = withApiErrorHandling(async (request: Request) => {
  const { name, roleTitle, companyId, scope, persona, model, tools } = (await request.json()) as {
    name: string;
    roleTitle?: string;
    companyId: string;
    scope: "company" | "group" | "project";
    persona: string;
    model?: string;
    tools: string[];
  };
  if (!name || !companyId || !scope || !persona) {
    return NextResponse.json(
      { error: "name, companyId, scope, and persona are required" },
      { status: 400 },
    );
  }

  // Every requested tool must be a real, registered tool — silently
  // dropping an unknown name would leave the agent quietly missing a
  // capability the founder thought they'd granted.
  const unknownTools = tools.filter((t) => !getToolByName(t));
  if (unknownTools.length > 0) {
    return NextResponse.json({ error: `Unknown tool(s): ${unknownTools.join(", ")}` }, { status: 400 });
  }

  if (isDemoMode()) {
    return NextResponse.json({
      agent: { id: "demo-agent", name, role_title: roleTitle ?? null },
      demo: true,
    });
  }

  const supabase = await createClient();
  const founderUserId = await getFounderUserId(supabase);

  const { data: agent, error: insertErr } = await supabase
    .from("agents")
    .insert({
      name,
      role_title: roleTitle || null,
      company_id: companyId,
      scope,
      persona,
      model: model || "claude-sonnet-5",
      tools,
      status: "active",
    })
    .select("id, name, role_title")
    .single();
  if (insertErr || !agent) {
    return NextResponse.json({ error: insertErr?.message ?? "Failed to create agent" }, { status: 500 });
  }

  await supabase.from("edges").insert({
    source_type: "company",
    source_id: companyId,
    target_type: "agent",
    target_id: agent.id,
    relation: "has_agent",
  });

  await supabase.from("audit_log").insert({
    actor_type: "user",
    actor_id: founderUserId,
    action: "create_agent",
    target_type: "agent",
    target_id: agent.id,
    company_id: companyId,
  });

  return NextResponse.json({ agent });
});
