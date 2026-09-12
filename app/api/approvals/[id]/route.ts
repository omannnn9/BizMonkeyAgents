import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmailViaGmail } from "@/lib/integrations/gmail";

/**
 * Approve or reject a pending action. RLS already restricts the UPDATE to
 * controls_approvals members of the approval's company, but we re-check
 * explicitly here too (defense in depth) before attempting to execute
 * anything — and execution failure (e.g. Gmail not connected) is recorded
 * as a failure, never silently treated as success.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { decision } = (await request.json()) as { decision: "approved" | "rejected" };
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: approval, error: fetchErr } = await supabase
    .from("approvals")
    .select("id, company_id, action_type, payload, status")
    .eq("id", id)
    .single();
  if (fetchErr || !approval) {
    return NextResponse.json({ error: "Approval not found or not visible" }, { status: 404 });
  }
  if (approval.status !== "pending") {
    return NextResponse.json({ error: `Approval already ${approval.status}` }, { status: 409 });
  }

  const { data: membership } = await supabase
    .from("company_members")
    .select("controls_approvals")
    .eq("company_id", approval.company_id)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!membership?.controls_approvals) {
    return NextResponse.json(
      { error: "Only a controlling member of this company can decide approvals" },
      { status: 403 },
    );
  }

  const { error: updateErr } = await supabase
    .from("approvals")
    .update({ status: decision, decided_by: userData.user.id, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await supabase.from("audit_log").insert({
    actor_type: "user",
    actor_id: userData.user.id,
    action: `approval:${decision}`,
    target_type: "approval",
    target_id: id,
    company_id: approval.company_id,
  });

  if (decision === "rejected") {
    return NextResponse.json({ status: "rejected" });
  }

  // Approved — attempt real execution. Only send_email exists in Phase 1.
  if (approval.action_type === "send_email") {
    const payload = approval.payload as { to: string; subject: string; body: string };
    const result = await sendEmailViaGmail(payload);
    const finalStatus = result.sent ? "executed" : "failed";
    await supabase.from("approvals").update({ status: finalStatus }).eq("id", id);
    await supabase.from("audit_log").insert({
      actor_type: "user",
      actor_id: userData.user.id,
      action: `approval:execute:${finalStatus}`,
      target_type: "approval",
      target_id: id,
      company_id: approval.company_id,
      metadata: result.sent ? {} : { error: result.error },
    });
    return NextResponse.json({ status: finalStatus, error: result.sent ? undefined : result.error });
  }

  return NextResponse.json({ status: "approved" });
}
