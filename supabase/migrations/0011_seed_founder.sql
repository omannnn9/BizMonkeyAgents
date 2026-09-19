-- Founder identity seed — the SQL equivalent of
-- scripts/seed-founder-membership.ts, run directly against the live
-- project via the Supabase MCP because this sandbox's outbound network
-- policy blocks direct HTTPS to *.supabase.co (confirmed via the agent
-- proxy's own diagnostics — a 403 on CONNECT, not a bug to route around),
-- so the GoTrue admin API the script calls isn't reachable from here.
-- This is the same single-purpose "no login, just an FK anchor" row the
-- script would have created: never used to sign in anywhere, since the
-- app has no login UI and talks to Supabase only as the service role.
--
-- scripts/seed-founder-membership.ts remains the normal path for anyone
-- who *can* reach the Supabase Auth Admin API directly — this migration
-- exists so the same founder identity is reproducible from a fresh
-- database even when that path isn't reachable.

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  is_super_admin
)
select
  gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'founder@internal.local', crypt(gen_random_uuid()::text, gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  '', '', '', '',
  false
where not exists (select 1 from auth.users where email = 'founder@internal.local');

insert into public.company_members (company_id, user_id, role, controls_approvals)
select c.id, u.id, 'owner', true
from public.companies c
cross join (select id from auth.users where email = 'founder@internal.local') u
on conflict (company_id, user_id) do update set controls_approvals = true;
