# OD Group Cockpit — Phase 1

Internal AI command center for OD Group (ODAX, Tablo, NOVA, OD Holdings). See the original build
prompt and architecture doc for full context; this README covers what exists and how to bring it
online.

## Status

Everything that doesn't require a live Supabase project is built and passes `npm run build` /
`npm run lint`: schema + RLS, the CEO agent (Messages API + custom tool loop), the approval gate,
and the full cockpit UI. **Nothing has been applied to a live database or run end-to-end yet** —
that's blocked on a Supabase project existing (see below). Until then, treat the RLS policies, the
agent's tool behavior, and the auth flow as reviewed-but-unverified, not tested.

Known stub: `lib/integrations/gmail.ts` — Gmail isn't connected yet, so approved email actions fail
loudly with a clear error instead of sending anything.

## One-time setup

1. **Create a Supabase project** (new, dedicated — don't reuse another project's database) and
   note its project ref, URL, anon key, and service role key.
2. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `VOYAGE_API_KEY` (free tier at voyageai.com)
3. Apply the migrations in order, via the Supabase MCP's `apply_migration` (or the Supabase CLI /
   SQL editor): `supabase/migrations/0001_init.sql`, `0002_seed_companies.sql`, `0003_storage.sql`.
4. **Run the RLS isolation test before building anything further on top — this must pass:**
   ```
   npm run test:rls
   ```
5. Sign up through `/login` with your own founder account, then grant yourself membership across
   all four companies:
   ```
   FOUNDER_EMAIL=you@example.com npm run seed:founder
   ```
6. Optional but recommended: regenerate `lib/supabase/types.ts` from the real schema instead of the
   hand-written version here (`mcp__Supabase__generate_typescript_types`, or
   `supabase gen types typescript`).
7. Run the remaining scripted tests:
   ```
   npm run test:prompt-injection
   npm run test:agent-scenarios
   ```
8. `npm run dev` and walk the cockpit yourself: switch companies, upload a `.txt` doc and ask the
   agent about it, ask it to draft an email and confirm it shows up in Approvals (not sent).

## Deploying

Deploy to Vercel with the same env vars as `.env.local` set in the project settings. Connect
Sentry once the first deployment exists (the brief's own sequencing) and wire `@sentry/nextjs` in
— not done yet, since there's no deployment to point it at.

## Scripts

| Script | What it does |
|---|---|
| `npm run test:rls` | Proves a Company A member can't read/write Company B's rows. Run first. |
| `npm run seed:founder` | Grants a signed-up founder account membership across all 4 companies. |
| `npm run test:prompt-injection` | Seeds a document with an embedded fake instruction, asserts the agent reports rather than obeys it. |
| `npm run test:agent-scenarios` | Scripted tool-call-shape checks (not wording) for the CEO agent. |

## What's genuinely not built yet (by design, out of Phase 1 scope)

Department agents beyond the single CEO agent, PDF/DOCX document parsing (text/markdown/CSV only),
the interactive knowledge-graph view, scheduled briefings, group-scope/project-scope agents in
practice (the schema supports them; nothing creates one), and anything from the roadmap's Phase
2-4 list.
