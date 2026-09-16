-- Agent-to-agent collaboration.
--
-- Not yet applied to a live database (no Supabase project exists yet — see
-- README). Written now so it's ready the moment one does.
--
-- Grants request_from_agent to every seeded agent — unlike detect_synergies
-- (0006, narrowed to the two group-scope agents since cross-company
-- comparison is inherently a group-level concern), collaboration itself is
-- general: the CEO Agent delegating to Marketing, Sales asking the Group
-- CFO for context, and so on all use the same tool. Not approval-gated
-- (see request-from-agent.ts's own comment) so no action_policies row is
-- needed — the target agent's own tools still go through their own gates
-- independently.
update public.agents
set tools = tools || '["request_from_agent"]'::jsonb
where name in ('CEO Agent', 'Sales Agent', 'Marketing Agent', 'Group CFO', 'Group Strategy');
