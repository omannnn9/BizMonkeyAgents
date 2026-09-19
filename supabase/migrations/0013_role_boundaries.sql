-- Role boundaries — per explicit founder direction: every agent should
-- know everything about OD Group's real structure (parent company, real
-- subsidiaries, mission, the founder), everything about its own job, only
-- summarized information about other departments, and nothing about other
-- agents' private memories or data outside its permission scope. Two real
-- things change here, not just prompt text:
--
--   1. Real, structured group/company data — founder profile and each
--      subsidiary's real purpose/competitors — lands in `companies.config`
--      (the same place market/ownership already live), so every agent's
--      system prompt can build its "who we are" section from a live query
--      instead of a hardcoded string. New subsidiaries added later are
--      picked up automatically the same way, with zero code change.
--   2. `match_memories()` gains real scoping: it currently searches the
--      *entire* memories table regardless of which agent/company is
--      asking — a genuine cross-company and cross-agent leak (a Tablo
--      agent's chat could surface a Group CFO memory about ODAX, or any
--      agent's private `scope: 'agent'` collaboration memory, purely by
--      semantic similarity). It's rebuilt here to mirror
--      resolveMemoryOwnerCompanyId() (lib/agent/scoped-companies.ts): a
--      memory is only returned when its resolved owning company is in the
--      caller's own scoped companies, `scope: 'agent'` memories are only
--      returned to the exact agent they belong to (private, not summarized
--      — the founder's rule is "no access" here, not "less detail"), and
--      `scope: 'founder'` stays global since it has no company boundary.

update public.companies set config = config || jsonb_build_object(
  'founder', jsonb_build_object('name', 'Oman Sharma Dilloo', 'title', 'Founder and Group CEO'),
  'mission', 'Strategic direction, capital allocation, investment decisions, governance, and ' ||
    'performance monitoring across every OD Group subsidiary.'
)
where id = '00000000-0000-0000-0000-000000000001'; -- OD Holdings

update public.companies set config = config || jsonb_build_object(
  'purpose', 'Online booking and appointment management platform: business booking management, ' ||
    'customer self-service booking, staff scheduling, availability management, calendar ' ||
    'synchronization, and business operations automation.',
  'competitors', jsonb_build_array('Fresha', 'Calendly', 'Booksy')
)
where id = '00000000-0000-0000-0000-000000000002'; -- ODAX

update public.companies set config = config || jsonb_build_object(
  'purpose', 'Restaurant technology platform: QR ordering, menu management, customer experience ' ||
    'improvements, and restaurant operational tools. Completely separate from ODAX.'
)
where id = '00000000-0000-0000-0000-000000000003'; -- Tablo

update public.companies set
  industry = 'software, AI & automation studio',
  config = config || jsonb_build_object(
    'purpose', 'Software, AI, automation, and digital solutions company — OD Group''s technology ' ||
      'builder: custom software, AI systems, web applications, internal technology products, and ' ||
      'client technology solutions.'
  )
where id = '00000000-0000-0000-0000-000000000004'; -- NOVA

-- The old 2-arg signature (p_query_embedding, p_limit) from 0008 is a
-- distinct overload from the 4-arg one below, not the same function —
-- `create or replace` never drops a differently-shaped overload, so it
-- has to be dropped explicitly or it stays callable as an unscoped
-- backdoor around everything below.
drop function if exists public.match_memories(vector(1024), int);

create or replace function public.match_memories(
  p_query_embedding vector(1024),
  p_company_ids uuid[],
  p_agent_id uuid default null,
  p_limit int default 8
)
returns table (
  id uuid, content text, scope text, scope_id uuid,
  importance numeric, confidence numeric, created_at timestamptz, similarity float
)
language sql stable as $$
  select m.id, m.content, m.scope, m.scope_id, m.importance, m.confidence, m.created_at,
         1 - (m.embedding <=> p_query_embedding) as similarity
  from public.memories m
  where m.embedding is not null
    and (m.expires_at is null or m.expires_at > now())
    and m.archived_at is null
    and (
      m.scope = 'founder'
      or (m.scope in ('company', 'group') and m.scope_id = any(p_company_ids))
      or (m.scope = 'department' and exists (
            select 1 from public.departments d where d.id = m.scope_id and d.company_id = any(p_company_ids)))
      or (m.scope = 'project' and exists (
            select 1 from public.projects p where p.id = m.scope_id and p.company_id = any(p_company_ids)))
      or (m.scope = 'agent' and m.scope_id = p_agent_id)
    )
  order by (
    (1 - (m.embedding <=> p_query_embedding)) * 0.5
    + m.importance * 0.3
    + (1.0 / (1.0 + extract(epoch from (now() - m.created_at)) / 86400.0)) * 0.2
  ) desc
  limit p_limit;
$$;
