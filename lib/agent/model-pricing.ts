/**
 * Real published Groq API rates (USD per million tokens, input/output),
 * checked against current pricing as of this writing — not invented
 * numbers. These are the self-serve, on-demand rates that apply once the
 * free tier's daily/per-minute token allowance is exhausted; within the
 * free tier the founder's actual out-of-pocket cost is $0, but this table
 * still gives a real dollar figure for what that usage would have cost,
 * which is what the Command Center's spend tracking (Phase 7) shows.
 * Update this table if Groq's pricing changes; `runAgentTurn()` uses it to
 * compute a real `agent_runs.cost_usd` from the actual token counts a turn
 * used, rather than leaving the column permanently unpopulated.
 */
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
  "openai/gpt-oss-20b": { input: 0.075, output: 0.3 },
};

/** Falls back to gpt-oss-120b's rate for an unrecognized model id — the
 *  seeded default every agent uses unless configured otherwise — rather
 *  than silently returning 0 and understating real spend. */
export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const rate = PRICING_PER_MILLION_TOKENS[model] ?? PRICING_PER_MILLION_TOKENS["openai/gpt-oss-120b"];
  const cost = (tokensIn / 1_000_000) * rate.input + (tokensOut / 1_000_000) * rate.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
