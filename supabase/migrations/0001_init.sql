-- OD Group AI Operating System — Phase 1 schema
--
-- Design notes (deviations from the brief's literal column list, made for
-- RLS correctness and defense-in-depth; each is additive, none removes a
-- named column):
--   * agent_runs, approvals, document_chunks gain a denormalized `company_id`,
--     kept authoritative by a BEFORE INSERT trigger that derives it from the
--     row's real parent (agent/document) rather than trusting client input.
--     This is what lets "every company-scoped table has an RLS policy keyed
--     on company_id" hold literally, including for log/derived tables that
--     the brief didn't give a company_id column in its sketch.
--   * audit_log gets a nullable `company_id` (null = founder/system-level
--     entry not tied to one company).
--   * action_policies is new: it's the classification table the brief's
--     approval-gating step requires but didn't spell out as a table.

create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_cron";

create schema if not exists private;

-- ============================================================================
-- Core tables
-- ============================================================================

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_id uuid references public.companies(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  industry text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.companies is 'Every business unit, including the group level (OD Holdings, parent_id null). Never hardcoded elsewhere.';

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'managing_director', 'member', 'viewer')),
  controls_approvals boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  kind text,
  created_at timestamptz not null default now()
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role_title text,
  -- Always set, never null: a 'group' scope agent points at OD Holdings
  -- (the group-level company row) rather than leaving this null, so RLS
  -- never needs a "null = visible/writable by everyone" escape hatch.
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  scope text not null default 'company' check (scope in ('company', 'group', 'project')),
  persona text not null default '',
  model text not null default 'claude-sonnet-5',
  tools jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'paused', 'retired')),
  created_at timestamptz not null default now()
);
comment on column public.agents.scope is 'company now; group/project reserved for Phase 2-3, not exercised yet.';

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  status text not null default 'active' check (status in ('active', 'on_hold', 'completed', 'cancelled')),
  owner_agent_id uuid references public.agents(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  assigned_agent_id uuid references public.agents(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  storage_path text not null,
  title text not null,
  mime_type text,
  uploaded_by uuid references auth.users(id) on delete set null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  content text not null,
  embedding vector(1024),
  chunk_index int not null,
  created_at timestamptz not null default now()
);
create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('founder', 'group', 'company', 'department', 'project', 'agent')),
  scope_id uuid,
  content text not null,
  embedding vector(1024),
  source_document_id uuid references public.documents(id) on delete set null,
  importance numeric not null default 0.5 check (importance >= 0 and importance <= 1),
  confidence numeric not null default 0.7 check (confidence >= 0 and confidence <= 1),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  promoted_from_id uuid references public.memories(id) on delete set null,
  check (scope = 'founder' or scope_id is not null)
);
create index memories_embedding_idx on public.memories
  using hnsw (embedding vector_cosine_ops);

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  relation text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index edges_source_idx on public.edges (source_type, source_id);
create index edges_target_idx on public.edges (target_type, target_id);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text,
  made_by uuid references auth.users(id) on delete set null,
  rationale text,
  related_task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  input text,
  output text,
  tool_calls jsonb not null default '[]'::jsonb,
  model text not null,
  tokens_in int,
  tokens_out int,
  cost_usd numeric,
  latency_ms int,
  status text not null default 'success' check (status in ('success', 'error', 'pending')),
  created_at timestamptz not null default now()
);

create table public.action_policies (
  action_type text primary key,
  classification text not null check (classification in ('automatic', 'approval_required', 'founder_only')),
  updated_at timestamptz not null default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  proposed_by_agent_id uuid not null references public.agents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  action_type text not null references public.action_policies(action_type),
  payload jsonb not null default '{}'::jsonb,
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'executed', 'failed')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  actor_type text not null check (actor_type in ('user', 'agent', 'system')),
  actor_id uuid,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_company_idx on public.audit_log (company_id, created_at desc);

-- ============================================================================
-- Denormalization triggers (company_id derived server-side, never trusted
-- from client input)
-- ============================================================================

create function private.set_agent_run_company_id() returns trigger
language plpgsql as $$
begin
  select company_id into new.company_id from public.agents where id = new.agent_id;
  return new;
end;
$$;
create trigger agent_runs_company_id before insert on public.agent_runs
  for each row execute function private.set_agent_run_company_id();

create function private.set_approval_company_id() returns trigger
language plpgsql as $$
begin
  select company_id into new.company_id from public.agents where id = new.proposed_by_agent_id;
  return new;
end;
$$;
create trigger approvals_company_id before insert on public.approvals
  for each row execute function private.set_approval_company_id();

create function private.set_document_chunk_company_id() returns trigger
language plpgsql as $$
begin
  select company_id into new.company_id from public.documents where id = new.document_id;
  return new;
end;
$$;
create trigger document_chunks_company_id before insert on public.document_chunks
  for each row execute function private.set_document_chunk_company_id();

-- ============================================================================
-- RLS helper functions
-- ============================================================================

-- All company_ids the current user may see: companies they're a direct
-- member of, plus every descendant of those companies (so a member of the
-- group sees every child company; a member of a single company does not
-- see siblings or the parent).
create function private.allowed_company_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  with recursive expanded(id) as (
    select company_id from public.company_members where user_id = auth.uid()
    union
    select c.id from public.companies c join expanded e on c.parent_id = e.id
  )
  select id from expanded;
$$;

-- A group-level controlling member (e.g. a controls_approvals row at OD
-- Holdings) can approve actions for any descendant company, without needing
-- a separate membership row at that company — so this walks UP from
-- p_company_id to its ancestors (including itself) rather than checking
-- only a direct company_id match.
create function private.controls_approvals_for(p_company_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive ancestors(id) as (
    select p_company_id
    union
    select c.parent_id from public.companies c
      join ancestors a on c.id = a.id
      where c.parent_id is not null
  )
  select exists (
    select 1 from public.company_members cm
    where cm.user_id = auth.uid()
      and cm.controls_approvals = true
      and cm.company_id in (select id from ancestors)
  );
$$;

-- Resolves the owning company_id for a memory, regardless of its scope, so
-- a single policy can gate every scope consistently.
create function private.memory_company_id(p_scope text, p_scope_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case p_scope
    when 'company' then p_scope_id
    when 'department' then (select company_id from public.departments where id = p_scope_id)
    when 'project' then (select company_id from public.projects where id = p_scope_id)
    when 'agent' then (select company_id from public.agents where id = p_scope_id)
    else null
  end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.departments enable row level security;
alter table public.agents enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.memories enable row level security;
alter table public.edges enable row level security;
alter table public.decisions enable row level security;
alter table public.agent_runs enable row level security;
alter table public.action_policies enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_log enable row level security;

-- companies: visible to allowed members; mutated only via service role /
-- migrations in Phase 1 (no self-service company creation yet).
create policy companies_select on public.companies for select
  using (id in (select private.allowed_company_ids()));

-- company_members: visible to anyone who can see the company; only
-- controls_approvals members of that company can manage membership.
create policy company_members_select on public.company_members for select
  using (company_id in (select private.allowed_company_ids()));
create policy company_members_write on public.company_members for all
  using (private.controls_approvals_for(company_id))
  with check (private.controls_approvals_for(company_id));

-- Standard company-scoped CRUD, applied uniformly.
create policy departments_all on public.departments for all
  using (company_id in (select private.allowed_company_ids()))
  with check (company_id in (select private.allowed_company_ids()));

create policy agents_all on public.agents for all
  using (company_id in (select private.allowed_company_ids()))
  with check (company_id in (select private.allowed_company_ids()));

create policy projects_all on public.projects for all
  using (company_id in (select private.allowed_company_ids()))
  with check (company_id in (select private.allowed_company_ids()));

create policy tasks_all on public.tasks for all
  using (company_id in (select private.allowed_company_ids()))
  with check (company_id in (select private.allowed_company_ids()));

create policy documents_all on public.documents for all
  using (company_id in (select private.allowed_company_ids()))
  with check (company_id in (select private.allowed_company_ids()));

create policy document_chunks_select on public.document_chunks for select
  using (company_id in (select private.allowed_company_ids()));
create policy document_chunks_insert on public.document_chunks for insert
  with check (
    exists (select 1 from public.documents d where d.id = document_id
      and d.company_id in (select private.allowed_company_ids()))
  );

create policy decisions_all on public.decisions for all
  using (company_id in (select private.allowed_company_ids()))
  with check (company_id in (select private.allowed_company_ids()));

create policy agent_runs_select on public.agent_runs for select
  using (company_id in (select private.allowed_company_ids()));
create policy agent_runs_insert on public.agent_runs for insert
  with check (
    exists (select 1 from public.agents a where a.id = agent_id
      and a.company_id in (select private.allowed_company_ids()))
  );

-- memories: scope-aware visibility. 'group' is visible to every member of
-- the hierarchy; 'founder' only to its creator; everything else resolves to
-- an owning company via memory_company_id().
create policy memories_select on public.memories for select
  using (
    scope = 'group'
    or (scope = 'founder' and created_by = auth.uid())
    or private.memory_company_id(scope, scope_id) in (select private.allowed_company_ids())
  );
create policy memories_write on public.memories for all
  using (
    scope = 'founder' and created_by = auth.uid()
    or private.memory_company_id(scope, scope_id) in (select private.allowed_company_ids())
  )
  with check (
    scope = 'founder' and created_by = auth.uid()
    or private.memory_company_id(scope, scope_id) in (select private.allowed_company_ids())
  );

-- edges: Phase 1 has no UI/agent consumer for this table yet, and a single
-- edge can span two different companies' entities. Conservative default:
-- visible only to members of the top-level group company (the founder, for
-- now) until Phase 2 designs real per-edge scoping for the graph view.
create policy edges_all on public.edges for all
  using (
    exists (
      select 1 from public.companies c
      join public.company_members cm on cm.company_id = c.id
      where c.parent_id is null and cm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.companies c
      join public.company_members cm on cm.company_id = c.id
      where c.parent_id is null and cm.user_id = auth.uid()
    )
  );

-- action_policies: read-only reference data for every allowed user;
-- managed by service role / migrations.
create policy action_policies_select on public.action_policies for select
  using (true);

create policy approvals_select on public.approvals for select
  using (company_id in (select private.allowed_company_ids()));
create policy approvals_insert on public.approvals for insert
  with check (
    exists (select 1 from public.agents a where a.id = proposed_by_agent_id
      and a.company_id in (select private.allowed_company_ids()))
  );
create policy approvals_update on public.approvals for update
  using (company_id in (select private.allowed_company_ids()))
  with check (private.controls_approvals_for(company_id));

create policy audit_log_select on public.audit_log for select
  using (
    (company_id is null and actor_id = auth.uid())
    or company_id in (select private.allowed_company_ids())
  );
create policy audit_log_insert on public.audit_log for insert
  with check (
    company_id is null or company_id in (select private.allowed_company_ids())
  );

-- ============================================================================
-- Retrieval RPCs for context assembly
--
-- Deliberately NOT `security definer`: these run as the calling session, so
-- the existing RLS policies on memories/document_chunks apply exactly as
-- they would to a direct select. No separate access-control logic to keep
-- in sync with the table policies.
-- ============================================================================

create function public.match_memories(p_query_embedding vector(1024), p_limit int default 8)
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
  order by (
    -- blended score: embedding similarity, stated importance, and recency
    (1 - (m.embedding <=> p_query_embedding)) * 0.5
    + m.importance * 0.3
    + (1.0 / (1.0 + extract(epoch from (now() - m.created_at)) / 86400.0)) * 0.2
  ) desc
  limit p_limit;
$$;

create function public.match_document_chunks(
  p_query_embedding vector(1024), p_company_ids uuid[], p_limit int default 6
)
returns table (id uuid, document_id uuid, content text, chunk_index int, similarity float)
language sql stable as $$
  select dc.id, dc.document_id, dc.content, dc.chunk_index,
         1 - (dc.embedding <=> p_query_embedding) as similarity
  from public.document_chunks dc
  where dc.embedding is not null
    and dc.company_id = any(p_company_ids)
  order by dc.embedding <=> p_query_embedding
  limit p_limit;
$$;
