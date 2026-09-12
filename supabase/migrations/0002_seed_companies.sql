-- Seed data: companies and the approval-policy table are real rows, never
-- hardcoded into application logic. company_members for the founder is
-- NOT seeded here because it needs a real auth.users row, which only
-- exists after Supabase Auth signup — see scripts/seed-founder-membership.ts,
-- run once after the founder's account is created.

insert into public.companies (id, name, slug, parent_id, status, industry, config) values
  ('00000000-0000-0000-0000-000000000001', 'OD Holdings', 'od-holdings', null, 'active', 'holding group',
    '{"level": "group"}'::jsonb);

insert into public.companies (id, name, slug, parent_id, status, industry, config) values
  ('00000000-0000-0000-0000-000000000002', 'ODAX', 'odax', '00000000-0000-0000-0000-000000000001', 'active', 'bookings SaaS',
    '{"ownership": {"founder_pct": 60, "partner_pct": 40}, "has_managing_director": true, "market": "Mauritius"}'::jsonb),
  ('00000000-0000-0000-0000-000000000003', 'Tablo', 'tablo', '00000000-0000-0000-0000-000000000001', 'active', 'QR ordering for restaurants',
    '{"ownership": {"founder_pct": 50, "partner_pct": 50}}'::jsonb),
  ('00000000-0000-0000-0000-000000000004', 'NOVA', 'nova', '00000000-0000-0000-0000-000000000001', 'active', 'dev / web studio',
    '{"ownership": {"founder_pct": 100}, "single_member": true}'::jsonb);

-- Only send_email is a real external action in Phase 1 (Gmail tool).
-- Anything not listed here defaults to founder_only in application code
-- (fail safe, never fail open).
insert into public.action_policies (action_type, classification) values
  ('send_email', 'approval_required');

-- One CEO / Chief of Staff agent per company, matching the brief's "one
-- agent" scope for Phase 1 (no department agents yet).
insert into public.agents (name, role_title, company_id, scope, persona, model, tools, status) values
  ('CEO Agent', 'Chief of Staff', '00000000-0000-0000-0000-000000000001', 'company',
    'You are the CEO / Chief of Staff agent for OD Holdings, the group level of OD Group.',
    'claude-sonnet-5', '["query_company_data", "search_documents", "send_email"]'::jsonb, 'active'),
  ('CEO Agent', 'Chief of Staff', '00000000-0000-0000-0000-000000000002', 'company',
    'You are the CEO / Chief of Staff agent for ODAX, a bookings SaaS product for local service businesses in Mauritius.',
    'claude-sonnet-5', '["query_company_data", "search_documents", "send_email"]'::jsonb, 'active'),
  ('CEO Agent', 'Chief of Staff', '00000000-0000-0000-0000-000000000003', 'company',
    'You are the CEO / Chief of Staff agent for Tablo, a QR-code ordering product for restaurants.',
    'claude-sonnet-5', '["query_company_data", "search_documents", "send_email"]'::jsonb, 'active'),
  ('CEO Agent', 'Chief of Staff', '00000000-0000-0000-0000-000000000004', 'company',
    'You are the CEO / Chief of Staff agent for NOVA, a dev/web studio.',
    'claude-sonnet-5', '["query_company_data", "search_documents", "send_email"]'::jsonb, 'active');
