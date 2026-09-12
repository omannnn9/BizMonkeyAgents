/**
 * STUB — not a finished integration.
 *
 * Higgsfield is the Marketing/Creative Agent's asset-generation tool per the
 * architecture doc. It's connected as an MCP server in the Claude Code
 * session that builds this app, but that connection is not reachable by the
 * deployed app at runtime — the app needs its own Higgsfield API key, the
 * same situation Gmail was in. This function exists so the approval-gated
 * architecture around it is correct and testable now, but it intentionally
 * fails loudly instead of pretending to generate anything.
 *
 * To finish this integration:
 *   1. Add a HIGGSFIELD_API_KEY (server-only) for this app.
 *   2. Replace the body below with a real Higgsfield API call.
 *   3. Delete this comment block once it's real.
 */
export async function generateAssetViaHiggsfield(_params: {
  prompt: string;
  assetType: "image" | "video";
}): Promise<{ generated: false; error: string }> {
  return {
    generated: false,
    error:
      "Higgsfield is not connected for this app yet. Add HIGGSFIELD_API_KEY and implement " +
      "lib/integrations/higgsfield.ts before approving creative-asset actions.",
  };
}
