-- LLM provider swap: Anthropic -> Groq.
--
-- The app's agent runtime (lib/agent/agent-runtime.ts) now calls Groq's
-- OpenAI-compatible chat completions API instead of the Anthropic Messages
-- API, for a genuinely free self-serve tier (no card, no trial expiry).
-- Every seeded agent's `model` column (previously the literal string
-- 'claude-sonnet-5', set by 0002/0004/0005_phase3.sql) needs to point at a
-- real Groq model id instead. lib/agent/model-pricing.ts carries the real
-- published per-token rates for both models below.

alter table public.agents alter column model set default 'openai/gpt-oss-120b';

update public.agents
set model = 'openai/gpt-oss-120b'
where model = 'claude-sonnet-5';
