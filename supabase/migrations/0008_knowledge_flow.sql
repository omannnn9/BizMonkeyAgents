-- Knowledge flow foundation — Phase 1 of the founder-operating-system build.
--
-- Not yet applied to a live database (no Supabase project exists yet — see
-- README). Written now so it's ready the moment one does.
--
-- Closes the single biggest gap the Ecosystem Audit found: no tool creates
-- the first memory, so the AI Brain and cross-company synergy detection had
-- nothing to draw on. Adds real archiving (distinct from the existing
-- time-based expires_at) and a real goal cascade (Founder -> Group ->
-- Company -> Department -> Task), neither of which existed in the schema.

-- ============================================================================
-- memories: archiving + an 'agent' source value (a memory an agent records
-- directly, distinct from 'manual' which implies the founder authored it).
-- ============================================================================

alter table public.memories add column archived_at timestamptz;
comment on column public.memories.archived_at is
  'Set by update_memory''s archive operation — a deliberate "no longer useful" '
  'mark, distinct from expires_at''s time-based decay.';

alter table public.memories drop constraint memories_source_check;
alter table public.memories add constraint memories_source_check
  check (source in ('manual', 'briefing', 'document', 'promoted', 'agent'));

-- match_memories now excludes archived rows too, the same way it already
-- excludes expired ones — archiving should actually remove a memory from
-- retrieval, not just add a flag nothing reads.
create or replace function public.match_memories(p_query_embedding vector(1024), p_limit int default 8)
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
  order by (
    (1 - (m.embedding <=> p_query_embedding)) * 0.5
    + m.importance * 0.3
    + (1.0 / (1.0 + extract(epoch from (now() - m.created_at)) / 86400.0)) * 0.2
  ) desc
  limit p_limit;
$$;

-- ============================================================================
-- goals: a real cascade. Today a goal is a flat company-scoped row with no
-- way to trace it back to the group goal it came from, or down to a
-- specific department. Founder Goal -> Group Goal -> Company Goal ->
-- Department Goal -> Task is the create_goal/cascade_goal tool's shape;
-- this is the schema it needs.
-- ============================================================================

alter table public.goals add column parent_goal_id uuid references public.goals(id) on delete set null;
alter table public.goals add column department_id uuid references public.departments(id) on delete set null;
comment on column public.goals.parent_goal_id is
  'The goal this one cascades from (a company goal''s parent is a group goal, etc). Null at the top of a chain.';
