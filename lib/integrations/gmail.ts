/**
 * STUB — not a finished integration.
 *
 * The brief assumes Gmail is already connected as an MCP server in the
 * founder's Claude account. As of this build it is NOT (ListConnectors
 * showed installState: "connect_incomplete"). This function exists so the
 * approval-gated architecture around it is correct and testable now, but it
 * intentionally fails loudly instead of pretending to send anything.
 *
 * To finish this integration once Gmail is connected:
 *   1. Complete Gmail OAuth at claude.ai Settings -> Connectors.
 *   2. Replace the body below with a real call through the Gmail MCP tool
 *      (or the Gmail API directly with a server-side OAuth token) — never
 *      give the model direct access to a mail-send credential; the
 *      approval-gate flow already keeps the credential out of any prompt.
 *   3. Delete this comment block once it's real.
 */
export async function sendEmailViaGmail(_params: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ sent: false; error: string }> {
  return {
    sent: false,
    error:
      "Gmail is not connected for this account yet. Connect it at claude.ai Settings -> Connectors, " +
      "then implement lib/integrations/gmail.ts before approving email actions.",
  };
}
