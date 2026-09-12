-- Phase 3 — scale out and depth.
--
-- Not yet applied to a live database (no Supabase project exists yet — see
-- README). Written now so it's ready the moment one does.

-- ============================================================================
-- Tablo and NOVA onboarded the same way ODAX was in 0004_phase2.sql — a
-- Sales Agent + Marketing/Creative Agent each, same departments/tools
-- pattern, not a new department design per company.
-- ============================================================================

insert into public.departments (id, company_id, name, kind) values
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000003', 'Sales', 'sales'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000003', 'Marketing', 'marketing'),
  ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000004', 'Sales', 'sales'),
  ('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000004', 'Marketing', 'marketing');

insert into public.agents (id, name, role_title, company_id, department_id, scope, persona, model, tools, status) values
  ('00000000-0000-0000-0000-000000000022', 'Sales Agent', 'Sales', '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000020', 'company',
    'You are the Sales Agent for Tablo, a QR-code ordering product for restaurants. Apollo.io ' ||
    'enrichment and the OSL lead-scoring model are not connected to this app yet — if asked to ' ||
    'enrich or score a lead, propose it via enrich_lead and say plainly it is not yet connected.',
    'claude-sonnet-5', '["query_company_data", "search_documents", "enrich_lead"]'::jsonb, 'active'),
  ('00000000-0000-0000-0000-000000000023', 'Marketing Agent', 'Marketing / Creative', '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000021', 'company',
    'You are the Marketing/Creative Agent for Tablo. Higgsfield is not connected to this app yet — ' ||
    'if asked to generate an image or video, propose it via generate_creative_asset and say plainly ' ||
    'it is not yet connected.',
    'claude-sonnet-5', '["query_company_data", "search_documents", "generate_creative_asset"]'::jsonb, 'active'),
  ('00000000-0000-0000-0000-000000000026', 'Sales Agent', 'Sales', '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000024', 'company',
    'You are the Sales Agent for NOVA, a dev/web studio. Apollo.io enrichment and the OSL ' ||
    'lead-scoring model are not connected to this app yet — if asked to enrich or score a lead, ' ||
    'propose it via enrich_lead and say plainly it is not yet connected.',
    'claude-sonnet-5', '["query_company_data", "search_documents", "enrich_lead"]'::jsonb, 'active'),
  ('00000000-0000-0000-0000-000000000027', 'Marketing Agent', 'Marketing / Creative', '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000025', 'company',
    'You are the Marketing/Creative Agent for NOVA. Higgsfield is not connected to this app yet — ' ||
    'if asked to generate an image or video, propose it via generate_creative_asset and say plainly ' ||
    'it is not yet connected.',
    'claude-sonnet-5', '["query_company_data", "search_documents", "generate_creative_asset"]'::jsonb, 'active');

-- ============================================================================
-- Group-scope agents (Part 6/16). Cross-company read access needs no new
-- plumbing — lib/agent/scoped-companies.ts's getScopedCompanyIds() already
-- returns every descendant of OD Holdings, so these are new personas/tools
-- on the existing mechanism, not a new access model.
-- ============================================================================

insert into public.agents (id, name, role_title, company_id, scope, persona, model, tools, status) values
  ('00000000-0000-0000-0000-000000000030', 'Group CFO', 'Chief Financial Officer', '00000000-0000-0000-0000-000000000001',
    'group',
    'You are the Group CFO for OD Group, spanning OD Holdings, ODAX, Tablo, and NOVA. You focus on ' ||
    'financial health across all companies: open tasks and decisions with cost/revenue implications, ' ||
    'and board-report generation. You never see one company''s data as more privileged than another''s.',
    'claude-sonnet-5', '["query_company_data", "search_documents", "generate_board_report"]'::jsonb, 'active'),
  ('00000000-0000-0000-0000-000000000031', 'Group Strategy', 'Head of Strategy', '00000000-0000-0000-0000-000000000001',
    'group',
    'You are Group Strategy for OD Group, spanning OD Holdings, ODAX, Tablo, and NOVA. You focus on ' ||
    'cross-company goals, priorities, and decisions, and board-report generation.',
    'claude-sonnet-5', '["query_company_data", "search_documents", "generate_board_report"]'::jsonb, 'active');

-- Every existing CEO-style agent also gets generate_board_report (its own
-- company's board report, not just the group's).
update public.agents
set tools = tools || '["generate_board_report"]'::jsonb
where name = 'CEO Agent';

-- ============================================================================
-- Structural edges for the new agents and the Tablo/NOVA companies — same
-- rule as 0004: only facts already true elsewhere in the schema.
-- ============================================================================

insert into public.edges (source_type, source_id, target_type, target_id, relation) values
  ('company', '00000000-0000-0000-0000-000000000003', 'agent', '00000000-0000-0000-0000-000000000022', 'has_agent'),
  ('company', '00000000-0000-0000-0000-000000000003', 'agent', '00000000-0000-0000-0000-000000000023', 'has_agent'),
  ('company', '00000000-0000-0000-0000-000000000004', 'agent', '00000000-0000-0000-0000-000000000026', 'has_agent'),
  ('company', '00000000-0000-0000-0000-000000000004', 'agent', '00000000-0000-0000-0000-000000000027', 'has_agent'),
  ('company', '00000000-0000-0000-0000-000000000001', 'agent', '00000000-0000-0000-0000-000000000030', 'has_agent'),
  ('company', '00000000-0000-0000-0000-000000000001', 'agent', '00000000-0000-0000-0000-000000000031', 'has_agent');

-- ============================================================================
-- memories.source gains 'promoted' — a memory the founder or an agent moved
-- to a broader scope via promote_memory, distinct from 'manual' (created at
-- its current scope directly).
-- ============================================================================

alter table public.memories drop constraint memories_source_check;
alter table public.memories add constraint memories_source_check
  check (source in ('manual', 'briefing', 'document', 'promoted'));

-- ============================================================================
-- goals — OKR-style tracking (Part 14 names this feature but Part 11 gives
-- it no schema; this is a minimal design, not a literal spec). Powers the
-- generate_board_report tool and the query_company_data tool's new
-- 'goals' resource.
-- ============================================================================

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  objective text not null,
  key_results jsonb not null default '[]'::jsonb,
  period text not null default '',
  status text not null default 'on_track' check (status in ('on_track', 'at_risk', 'off_track', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.goals enable row level security;
create policy goals_all on public.goals for all
  using (company_id in (select private.allowed_company_ids()))
  with check (company_id in (select private.allowed_company_ids()));
