-- Phase 2 — department agents and automation.
--
-- Not yet applied to a live database (no Supabase project exists yet — see
-- README). Written now so it's ready the moment one does. Two scope notes:
--   * No `leads` table and no lead-scoring logic here. The founder chose to
--     wait and connect the real OSL lead database/model later rather than
--     have this migration invent a placeholder — see lib/integrations/apollo.ts.
--   * The pg_cron job at the bottom needs the real project ref and a Vault
--     secret filled in before it'll actually run — see the comment there.

-- ============================================================================
-- New action types. Same fail-safe default as Phase 1: anything not listed
-- here defaults to founder_only in application code.
-- ============================================================================

insert into public.action_policies (action_type, classification) values
  ('enrich_lead', 'approval_required'),
  ('generate_creative_asset', 'approval_required');

-- ============================================================================
-- Sales and Marketing/Creative departments + agents, under ODAX first (most
-- existing structured data to build on, per the architecture doc's Part 16).
-- True separate agent rows, not personas of the CEO agent — Part 6's "split
-- out a subagent only where the workload justifies it," applied to the two
-- departments the doc names for Phase 2.
-- ============================================================================

insert into public.departments (id, company_id, name, kind) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000002', 'Sales', 'sales'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', 'Marketing', 'marketing');

insert into public.agents (id, name, role_title, company_id, department_id, scope, persona, model, tools, status) values
  ('00000000-0000-0000-0000-000000000012', 'Sales Agent', 'Sales', '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000010', 'company',
    'You are the Sales Agent for ODAX. You help track and qualify leads. Apollo.io enrichment and the ' ||
    'OSL lead-scoring model are not connected to this app yet — if asked to enrich or score a lead, ' ||
    'propose it via enrich_lead (it will route to approval, then fail loudly until that''s wired up) ' ||
    'and say plainly that it is not yet connected rather than inventing a score.',
    'claude-sonnet-5', '["query_company_data", "search_documents", "enrich_lead"]'::jsonb, 'active'),
  ('00000000-0000-0000-0000-000000000013', 'Marketing Agent', 'Marketing / Creative', '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000011', 'company',
    'You are the Marketing/Creative Agent for ODAX. Higgsfield is not connected to this app yet — if ' ||
    'asked to generate an image or video, propose it via generate_creative_asset (it will route to ' ||
    'approval, then fail loudly until that''s wired up) and say plainly that it is not yet connected.',
    'claude-sonnet-5', '["query_company_data", "search_documents", "generate_creative_asset"]'::jsonb, 'active');

-- ============================================================================
-- Structural edges for the Part 8 knowledge-graph view. Deliberately only
-- facts that are already true elsewhere in the schema (ownership, which
-- agent belongs to which company) — never fabricated business activity.
-- ============================================================================

insert into public.edges (source_type, source_id, target_type, target_id, relation) values
  ('company', '00000000-0000-0000-0000-000000000001', 'company', '00000000-0000-0000-0000-000000000002', 'owns'),
  ('company', '00000000-0000-0000-0000-000000000001', 'company', '00000000-0000-0000-0000-000000000003', 'owns'),
  ('company', '00000000-0000-0000-0000-000000000001', 'company', '00000000-0000-0000-0000-000000000004', 'owns'),
  ('company', '00000000-0000-0000-0000-000000000002', 'agent', '00000000-0000-0000-0000-000000000012', 'has_agent'),
  ('company', '00000000-0000-0000-0000-000000000002', 'agent', '00000000-0000-0000-0000-000000000013', 'has_agent');

-- ============================================================================
-- memories.source — distinguishes a scheduled briefing from a manually
-- created memory or one sourced from a document, so the dashboard's
-- "Latest briefing" card can find the right row without guessing from
-- content text.
-- ============================================================================

alter table public.memories add column source text not null default 'manual'
  check (source in ('manual', 'briefing', 'document'));

-- ============================================================================
-- Scheduled daily briefing (Part 13). This is a TEMPLATE: it will not run
-- until you replace <PROJECT_REF> below and store the service role key in
-- Vault (Supabase Dashboard -> Project Settings -> Vault, or
-- `select vault.create_secret('<service-role-key>', 'service_role_key')`),
-- then re-run just this block. Left commented out so applying this
-- migration elsewhere doesn't silently try to schedule a job against a
-- placeholder URL.
-- ============================================================================

-- select cron.schedule(
--   'daily-briefing',
--   '0 6 * * *', -- 06:00 UTC daily
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-briefing',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
