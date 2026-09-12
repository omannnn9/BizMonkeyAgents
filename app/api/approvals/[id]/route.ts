import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmailViaGmail } from "@/lib/integrations/gmail";

/**
 * Approve or reject a pending action. The controls_approvals check is RLS's
 * job alone (private.controls_approvals_for, which also honors group-level
 * controllers approving a descendant company's actions) — duplicating that
 * logic here with a simpler direct-membership check would just make this
 * route stricter than the DB and wrongly 403 a legitimate group-level
 * approver. So this attempts the UPDATE directly and reads RLS's answer
 * off whether a row came back, then records real execution outcome (e.g.
 * Gmail not connected) as a failure, never silently treated as success.
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

  const { data: updatedRows, error: updateErr } = await supabase
    .from("approvals")
    .update({ status: decision, decided_by: userData.user.id, decided_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");

  // Two distinct RLS outcomes both mean "not authorized to decide this":
  // a row outside the user's visible companies just matches nothing
  // (empty result, no error), while a visible-but-non-controlling member
  // fails the policy's WITH CHECK, which Postgres raises as an error.
  const isRlsDenial = updateErr?.message?.toLowerCase().includes("row-level security");
  if (isRlsDenial || (!updateErr && (!updatedRows || updatedRows.length === 0))) {
    return NextResponse.json(
      { error: "Only a controlling member of this company (or its group level) can decide approvals" },
      { status: 403 },
    );
  }
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
