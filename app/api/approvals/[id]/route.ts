import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmailViaGmail } from "@/lib/integrations/gmail";
import { getFounderUserId } from "@/lib/agent/founder";
import { controlsApprovalsFor } from "@/lib/agent/approvals-authz";
import { withApiErrorHandling } from "@/lib/api-error";

/**
 * Approve or reject a pending action. With no login/session, this can't
 * lean on RLS + auth.uid() for the controls_approvals check anymore (the
 * service-role client has no per-request user identity) — so it's
 * re-implemented explicitly here via controlsApprovalsFor(), same
 * ancestor-walk semantics as the (now-unused, RLS-only) SQL function.
 * Real execution outcome (e.g. Gmail not connected) is still recorded as
 * a failure, never silently treated as success.
 */
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const { decision } = (await request.json()) as { decision: "approved" | "rejected" };
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 });
  }

  const supabase = await createClient();
  const founderUserId = await getFounderUserId(supabase);

  const { data: approval, error: fetchErr } = await supabase
    .from("approvals")
    .select("id, company_id, action_type, payload, status")
    .eq("id", id)
    .single();
  if (fetchErr || !approval) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }
  if (approval.status !== "pending") {
    return NextResponse.json({ error: `Approval already ${approval.status}` }, { status: 409 });
  }

  const canDecide = await controlsApprovalsFor(supabase, founderUserId, approval.company_id);
  if (!canDecide) {
    return NextResponse.json(
      { error: "Only a controlling member of this company (or its group level) can decide approvals" },
      { status: 403 },
    );
  }

  const { error: updateErr } = await supabase
    .from("approvals")
    .update({ status: decision, decided_by: founderUserId, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await supabase.from("audit_log").insert({
    actor_type: "user",
    actor_id: founderUserId,
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
      actor_id: founderUserId,
      action: `approval:execute:${finalStatus}`,
      target_type: "approval",
      target_id: id,
      company_id: approval.company_id,
      metadata: result.sent ? {} : { error: result.error },
    });
    return NextResponse.json({ status: finalStatus, error: result.sent ? undefined : result.error });
  }

  return NextResponse.json({ status: "approved" });
});
