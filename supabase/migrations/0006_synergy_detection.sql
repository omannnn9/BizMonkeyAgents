-- Cross-company synergy detection.
--
-- Not yet applied to a live database (no Supabase project exists yet — see
-- README). Written now so it's ready the moment one does.
--
-- The architecture doc names this feature (Parts 5 and 14) but never gives
-- a mechanism. This is deliberately a modest, honest one: memories that
-- read similarly across two different companies, found via the embedding
-- similarity already computed for every memory (no new embedding calls,
-- no new "AI detection" claim beyond what cosine similarity actually is).

-- Deliberately NOT `security definer`, same reasoning as match_memories /
-- match_document_chunks — runs as the calling session so existing RLS on
-- memories applies exactly as a direct select would.
create function public.match_cross_company_memories(p_limit int default 5, p_min_similarity float default 0.75)
returns table (
  memory_a_id uuid, memory_a_content text, company_a_id uuid, company_a_name text,
  memory_b_id uuid, memory_b_content text, company_b_id uuid, company_b_name text,
  similarity float
)
language sql stable as $$
  select
    a.id, a.content, a.scope_id, ca.name,
    b.id, b.content, b.scope_id, cb.name,
    1 - (a.embedding <=> b.embedding) as similarity
  from public.memories a
  join public.memories b
    on a.id < b.id
    and a.scope = 'company' and b.scope = 'company'
    and a.scope_id <> b.scope_id
  join public.companies ca on ca.id = a.scope_id
  join public.companies cb on cb.id = b.scope_id
  where a.embedding is not null and b.embedding is not null
    and (1 - (a.embedding <=> b.embedding)) >= p_min_similarity
  order by similarity desc
  limit p_limit;
$$;

-- Granted to the two group-scope agents only — cross-company comparison is
-- inherently a group-level concern, same reasoning as generate_board_report
-- being granted broadly to CEO-style agents in 0005 but this one staying
-- narrower.
update public.agents
set tools = tools || '["detect_synergies"]'::jsonb
where name in ('Group CFO', 'Group Strategy');
