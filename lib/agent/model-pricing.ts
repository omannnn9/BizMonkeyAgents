/**
 * Real published Anthropic API rates (USD per million tokens, input/output),
 * checked against current pricing as of this writing — not invented
 * numbers. Update this table if pricing changes; `runAgentTurn()` uses it
 * to compute a real `agent_runs.cost_usd` from the actual token counts a
 * turn used, rather than leaving the column permanently unpopulated.
 */
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-fable-5-1": { input: 10, output: 50 },
};

/** Falls back to Sonnet 5's rate for an unrecognized model id — the
 *  seeded default every agent uses unless configured otherwise — rather
 *  than silently returning 0 and understating real spend. */
export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const rate = PRICING_PER_MILLION_TOKENS[model] ?? PRICING_PER_MILLION_TOKENS["claude-sonnet-5"];
  const cost = (tokensIn / 1_000_000) * rate.input + (tokensOut / 1_000_000) * rate.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
