/**
 * STUB — not a finished integration.
 *
 * Apollo.io is the Sales Agent's lead-enrichment tool per the architecture
 * doc, operating on the existing 0-100 lead-scoring model in the OSL lead
 * database. Neither is connected yet: this app has no Apollo.io API key,
 * and the OSL database/scoring model hasn't been wired in (the founder
 * chose to connect that for real later rather than have this stub invent a
 * placeholder scoring formula). This function exists so the approval-gated
 * architecture around it is correct and testable now, but it intentionally
 * fails loudly instead of pretending to enrich or score anything.
 *
 * To finish this integration:
 *   1. Add an APOLLO_API_KEY (server-only) once Apollo.io access exists for
 *      this app specifically — the MCP connector in a Claude Code session is
 *      not reachable by the deployed app at runtime, so this needs its own
 *      credential, the same situation Gmail was in.
 *   2. Connect the real OSL lead database (or replicate the leads it needs
 *      into this project) and the real scoring model — do not invent one.
 *   3. Replace the body below with a real Apollo.io API call.
 *   4. Delete this comment block once it's real.
 */
export async function enrichLeadViaApollo(_params: {
  domainOrEmail: string;
}): Promise<{ enriched: false; error: string }> {
  return {
    enriched: false,
    error:
      "Apollo.io is not connected for this app yet, and the OSL lead database/scoring model hasn't " +
      "been wired in. Add APOLLO_API_KEY and implement lib/integrations/apollo.ts before approving " +
      "lead-enrichment actions.",
  };
}
