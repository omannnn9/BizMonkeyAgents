/**
 * Frontend-preview mode: when there's no Supabase project configured yet,
 * every page shows realistic-looking mock data instead of erroring, so the
 * UI can be reviewed before the backend exists. Every value here is
 * fabricated — nothing in this file is ever mixed with real data, and the
 * UI shows a persistent "Demo mode" banner whenever it's active so there's
 * no ambiguity about what's real. Roster mirrors migration 0009's real
 * 20-agent org rebuild (Managing Director / Sales Lead / Marketing Lead for
 * ODAX; the five OD Holdings group-scope agents), not the old templated
 * CEO/Sales/Marketing Agent names.
 */
export function isDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export const DEMO_COMPANIES = [
  { id: "00000000-0000-0000-0000-000000000001", name: "OD Holdings", slug: "od-holdings", parent_id: null, industry: "holding group" },
  { id: "00000000-0000-0000-0000-000000000002", name: "ODAX", slug: "odax", parent_id: "00000000-0000-0000-0000-000000000001", industry: "bookings SaaS" },
  { id: "00000000-0000-0000-0000-000000000003", name: "Tablo", slug: "tablo", parent_id: "00000000-0000-0000-0000-000000000001", industry: "QR ordering for restaurants" },
  { id: "00000000-0000-0000-0000-000000000004", name: "NOVA", slug: "nova", parent_id: "00000000-0000-0000-0000-000000000001", industry: "dev / web studio" },
];

export function demoDashboard() {
  return {
    openTasksCount: 4,
    pendingApprovalsCount: 1,
    lastAgentRun: { created_at: hoursAgo(2), status: "success", model: "claude-sonnet-5" },
    recentDecisions: [
      { id: "d1", title: "Raise ODAX booking fee from 2% to 2.5%", created_at: daysAgo(2) },
      { id: "d2", title: "Pause Tablo paid ads until QR scan flow is fixed", created_at: daysAgo(5) },
    ],
    latestBriefing: {
      content:
        "**Example only — the daily briefing isn't deployed yet** (needs a live Supabase project + " +
        "the daily-briefing Edge Function). Once it is, this card summarizes what's outstanding for " +
        "this company once a day, drawn from the same data as the stat cards above.",
      created_at: hoursAgo(14),
    },
  };
}

export function demoActivity(agentId?: string | null) {
  const runs = [
    {
      id: "r1",
      agent_id: DEMO_AGENT_IDS.salesLead,
      created_at: hoursAgo(2),
      status: "success",
      model: "claude-sonnet-5",
      input: "What open tasks do we have for the MD follow-up?",
      output: "Two open: confirm the pricing tier with the MD, and send the updated proposal by Friday.",
      tool_calls: [],
    },
    {
      id: "r2",
      agent_id: DEMO_AGENT_IDS.marketingLead,
      created_at: hoursAgo(20),
      status: "error",
      model: "claude-sonnet-5",
      input: "Draft an email to the MD about the Q3 numbers",
      output: null,
      tool_calls: [],
    },
    {
      // Recent enough (within the 2-minute "delivered"/"collaborating"
      // window lib/agent-visual-state.ts already uses) that the Colony's
      // collaboration beam has something real to show in demo mode too —
      // not a separate fabricated signal, the same request_from_agent
      // shape a real agent_runs.tool_calls row would carry. Sales Lead ->
      // Marketing Lead, both real figures in demoMap()'s ODAX district, so
      // the beam connects two Operators actually on screen together.
      id: "r3",
      agent_id: DEMO_AGENT_IDS.salesLead,
      created_at: minutesAgo(1),
      status: "success",
      model: "claude-sonnet-5",
      input: "Ask Marketing to check in on the Q3 creative brief",
      output: "Marketing Lead replied: on track, first drafts due Friday.",
      tool_calls: [
        {
          name: "request_from_agent",
          input: { targetAgentId: DEMO_AGENT_IDS.marketingLead, request: "Status of the Q3 creative brief?" },
          result: "Marketing Lead replied: on track, first drafts due Friday.",
        },
      ],
    },
  ];
  return {
    runs: agentId ? runs.filter((r) => r.agent_id === agentId) : runs,
    logs: [
      { id: "l1", created_at: hoursAgo(1), actor_type: "user", action: "approval:approved", target_type: "approval" },
      { id: "l2", created_at: hoursAgo(6), actor_type: "agent", action: "propose:send_email", target_type: "approval" },
      { id: "l3", created_at: daysAgo(1), actor_type: "user", action: "upload_document", target_type: "document" },
    ],
  };
}

export function demoApprovals(agentId?: string | null) {
  const all = [
    {
      id: "a1",
      proposed_by_agent_id: DEMO_AGENT_IDS.salesLead,
      action_type: "send_email",
      payload: {
        to: "md@example.com",
        subject: "Q3 numbers follow-up",
        body: "Hi — following up on the Q3 numbers review. Can we grab 15 minutes this week?",
      },
      risk_level: "medium",
      status: "pending",
      created_at: hoursAgo(6),
    },
    {
      id: "a2",
      proposed_by_agent_id: DEMO_AGENT_IDS.salesLead,
      action_type: "send_email",
      payload: { to: "partner@example.com", subject: "Welcome", body: "Thanks for joining ODAX." },
      risk_level: "low",
      status: "executed",
      created_at: daysAgo(3),
    },
  ];
  return { approvals: agentId ? all.filter((a) => a.proposed_by_agent_id === agentId) : all };
}

export function demoDocuments() {
  return {
    documents: [
      { id: "doc1", title: "Q3 board update.md", mime_type: "text/markdown", tags: ["finance", "quarterly"], created_at: daysAgo(1) },
      { id: "doc2", title: "ODAX pricing notes.txt", mime_type: "text/plain", tags: ["pricing"], created_at: daysAgo(4) },
    ],
  };
}

const DEMO_AGENT_IDS = {
  managingDirector: "agent-managing-director",
  salesLead: "agent-sales-lead",
  marketingLead: "agent-marketing-lead",
  groupCfo: "agent-group-cfo",
  groupStrategy: "agent-group-strategy",
  groupOperations: "agent-group-operations",
  groupIntelligence: "agent-group-intelligence",
  chiefOfStaff: "agent-chief-of-staff",
} as const;

/**
 * Agents visible for a given demo company — ODAX gets Managing Director /
 * Sales Lead / Marketing Lead, OD Holdings gets the five group-scope
 * agents, matching migration 0009's real org rebuild. Tablo and NOVA fall
 * back to a generic Managing Director entry — this fixture doesn't attempt
 * to model their full rosters (Restaurant Growth Lead, Studio Director,
 * etc.), only ODAX and OD Holdings, which is all the rest of demo mode
 * (activity/approvals/chat fixtures) actually exercises.
 */
export function demoAgents(companyId: string) {
  if (companyId === DEMO_COMPANIES[0].id) {
    return {
      agents: [
        { id: DEMO_AGENT_IDS.groupCfo, name: "Group CFO", role_title: "Chief Financial Officer", scope: "group", department_id: null },
        { id: DEMO_AGENT_IDS.groupStrategy, name: "Group Strategy", role_title: "Head of Strategy", scope: "group", department_id: null },
        { id: DEMO_AGENT_IDS.groupOperations, name: "Group Operations", role_title: "Head of Operations", scope: "group", department_id: null },
        { id: DEMO_AGENT_IDS.groupIntelligence, name: "Group Intelligence", role_title: "Head of Intelligence", scope: "group", department_id: null },
        { id: DEMO_AGENT_IDS.chiefOfStaff, name: "Chief of Staff", role_title: null, scope: "group", department_id: null },
      ],
    };
  }
  if (companyId === DEMO_COMPANIES[1].id) {
    return {
      agents: [
        { id: DEMO_AGENT_IDS.managingDirector, name: "Managing Director", role_title: null, scope: "company", department_id: null },
        { id: DEMO_AGENT_IDS.salesLead, name: "Sales Lead", role_title: null, scope: "company", department_id: "demo-dept-sales" },
        { id: DEMO_AGENT_IDS.marketingLead, name: "Marketing Lead", role_title: null, scope: "company", department_id: "demo-dept-marketing" },
      ],
    };
  }
  return {
    agents: [{ id: DEMO_AGENT_IDS.managingDirector, name: "Managing Director", role_title: null, scope: "company", department_id: null }],
  };
}

/** The architecture doc's own example of a promotable finding — company-scope, then its group-scope promotion. */
export function demoMemories(companyId: string) {
  const [holdings, odax] = DEMO_COMPANIES;
  const groupMemory = {
    id: "mem-group-1",
    scope: "group",
    scope_id: holdings.id,
    content:
      "Most F&B leads prospected so far turned out to be home-based producers, not dine-in " +
      "restaurants — re-qualify before outreach on any new food & beverage segment.",
    importance: 0.75,
    confidence: 0.8,
    source: "promoted",
    created_at: daysAgo(1),
    promoted_from_id: "mem-company-1",
  };
  if (companyId !== odax.id) {
    return { memories: [groupMemory] };
  }
  return {
    memories: [
      groupMemory,
      {
        id: "mem-company-1",
        scope: "company",
        scope_id: odax.id,
        content: groupMemory.content,
        importance: 0.65,
        confidence: 0.8,
        source: "manual",
        created_at: daysAgo(3),
        promoted_from_id: null,
      },
    ],
  };
}

/**
 * The AI Brain's org-wide view — built from the exact same memories
 * `demoMemories()` already defines (plus one addition, below), not a
 * separate invented fixture. `mem-company-2` and its synergy pairing are
 * new here, but not new *content*: they're the Tablo-side counterpart to
 * the ODAX finding `demoChatReply()`'s Group CFO branch already claims a
 * real `detect_synergies` call would surface (same similarity, same
 * wording) — so the Brain, the memories page, and the chat demo all tell
 * the same consistent story instead of three different ones.
 */
export function demoBrain() {
  const [holdings, odax, tablo] = DEMO_COMPANIES;
  const memories = [
    {
      id: "mem-group-1",
      scope: "group",
      scopeId: holdings.id,
      scopeLabel: "Group",
      content:
        "Most F&B leads prospected so far turned out to be home-based producers, not dine-in " +
        "restaurants — re-qualify before outreach on any new food & beverage segment.",
      importance: 0.75,
      confidence: 0.8,
      source: "promoted",
      createdAt: daysAgo(1),
    },
    {
      id: "mem-company-1",
      scope: "company",
      scopeId: odax.id,
      scopeLabel: odax.name,
      content: "Most F&B leads prospected so far turned out to be home-based producers, not dine-in restaurants.",
      importance: 0.65,
      confidence: 0.8,
      source: "manual",
      createdAt: daysAgo(3),
    },
    {
      id: "mem-company-2",
      scope: "company",
      scopeId: tablo.id,
      scopeLabel: tablo.name,
      content: "Tablo's own F&B outreach has hit the same home-based-producer mismatch.",
      importance: 0.6,
      confidence: 0.75,
      source: "manual",
      createdAt: daysAgo(2),
    },
  ];
  return {
    totalMemoryCount: memories.length,
    memories,
    // Matches demoDocuments()'s two fixture documents, attributed to ODAX
    // (the pricing-notes one clearly is; the board update reads group-wide
    // but this fixture doesn't need to split hairs to stay honest).
    documentCounts: [{ companyId: odax.id, companyName: odax.name, count: 2 }],
    // Same two rows demoDocuments() defines (same ids, same titles/mime
    // types) — the Knowledge layer's document nodes and /documents' own
    // list agree on what's real, not two different fixture stories.
    documents: [
      {
        id: "doc1",
        title: "Q3 board update.md",
        mimeType: "text/markdown",
        companyId: odax.id,
        companyName: odax.name,
        createdAt: daysAgo(1),
      },
      {
        id: "doc2",
        title: "ODAX pricing notes.txt",
        mimeType: "text/plain",
        companyId: odax.id,
        companyName: odax.name,
        createdAt: daysAgo(4),
      },
    ],
    synergies: [{ memoryAId: "mem-company-1", memoryBId: "mem-company-2", similarity: 0.891 }],
  };
}

/**
 * The Founder Command Center's org-wide view — every number here traces to
 * the same fixtures every other demo function already defines (demoApprovals's
 * a1, demoActivity's r1-r3, demoBrain's synergy pair), never a fresh
 * invention just for this page: the Command Center and the pages it
 * summarizes have to agree on what's real, same discipline as demoBrain()
 * reusing demoMemories(). The one genuinely new fixture is a small,
 * clearly-plausible set of blocked/overdue/at-risk items (Attention Center
 * needs *something* to show) — still labeled Demo mode like everything else here.
 */
export function demoCommand() {
  const [holdings, odax, tablo, nova] = DEMO_COMPANIES;
  const pendingApproval = demoApprovals().approvals[0];

  const blockedTasks = [
    {
      id: "task-blocked-1",
      title: "QR scan flow fix blocked on App Store review",
      companyId: tablo.id,
      companyName: tablo.name,
      createdAt: daysAgo(2),
    },
  ];
  const overdueTasks = [
    {
      id: "task-overdue-1",
      title: "Confirm ODAX pricing tier with the MD",
      companyId: odax.id,
      companyName: odax.name,
      dueAt: daysAgo(1),
    },
  ];
  const atRiskGoals = [
    {
      id: "goal-at-risk-1",
      objective: "Grow Tablo restaurant partners to 50 by end of quarter",
      companyId: tablo.id,
      companyName: tablo.name,
      status: "at_risk" as const,
    },
  ];

  // ownership/market mirror 0002_seed_companies.sql's real seeded `config`
  // exactly — the same fields the Ecosystem Audit flagged as real, seeded,
  // and invisible anywhere in the UI until Phase 6.
  const companyHealth = [
    { companyId: odax.id, companyName: odax.name, industry: odax.industry, ownership: { founder_pct: 60, partner_pct: 40 }, market: "Mauritius", openTasks: 4, blockedTasks: 0, pendingApprovals: 1, lastRunAt: hoursAgo(2), lastRunStatus: "success" as const, goalsOnTrack: 1, goalsAtRisk: 0, goalsOffTrack: 0 },
    { companyId: tablo.id, companyName: tablo.name, industry: tablo.industry, ownership: { founder_pct: 50, partner_pct: 50 }, market: null, openTasks: 2, blockedTasks: 1, pendingApprovals: 0, lastRunAt: daysAgo(3), lastRunStatus: "success" as const, goalsOnTrack: 0, goalsAtRisk: 1, goalsOffTrack: 0 },
    { companyId: nova.id, companyName: nova.name, industry: nova.industry, ownership: { founder_pct: 100 }, market: null, openTasks: 1, blockedTasks: 0, pendingApprovals: 0, lastRunAt: null, lastRunStatus: null, goalsOnTrack: 0, goalsAtRisk: 0, goalsOffTrack: 0 },
    { companyId: holdings.id, companyName: holdings.name, industry: holdings.industry, ownership: null, market: null, openTasks: 0, blockedTasks: 0, pendingApprovals: 0, lastRunAt: null, lastRunStatus: null, goalsOnTrack: 0, goalsAtRisk: 0, goalsOffTrack: 0 },
  ];

  const opportunities = [
    {
      similarity: 0.891,
      companyA: odax.name,
      memoryA: "Most F&B leads prospected so far turned out to be home-based producers, not dine-in restaurants.",
      companyB: tablo.name,
      memoryB: "Tablo's own F&B outreach has hit the same home-based-producer mismatch.",
    },
  ];

  const runs = demoActivity().runs;
  const recentActivity = runs.map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    status: r.status,
    output: r.output,
    createdAt: r.created_at,
  }));

  const dailyBriefings = [
    {
      companyId: odax.id,
      companyName: odax.name,
      content:
        "**Example only — the daily briefing isn't deployed yet** (needs a live Supabase project + " +
        "the daily-briefing Edge Function). Once it is, this shows what's outstanding for this " +
        "company once a day, drawn from the same data as the rest of this page.",
      createdAt: hoursAgo(14),
    },
  ];

  return {
    companies: DEMO_COMPANIES,
    attention: {
      pendingApprovals: pendingApproval ? [pendingApproval] : [],
      blockedTasks,
      overdueTasks,
      atRiskGoals,
    },
    companyHealth,
    opportunities,
    recentActivity,
    dailyBriefings,
  };
}

export function demoBriefing() {
  return {
    message:
      "**Demo mode** — Chief of Staff. Once real data exists, a weekly executive briefing here would " +
      "synthesize open tasks, decisions, and goals across every company — the same real `query_company_data` " +
      "and `generate_board_report` tools a real deployment already has, just asked to look at the whole " +
      "group instead of one company. Try asking a real deployment for one.",
  };
}

/** Matches the structural edges seeded by migration 0009_org_rebuild.sql — real org structure, not fabricated activity. */
export function demoGraph() {
  const [holdings, odax, tablo, nova] = DEMO_COMPANIES;
  const nodes = [
    { id: `company:${holdings.id}`, type: "company", label: holdings.name },
    { id: `company:${odax.id}`, type: "company", label: odax.name },
    { id: `company:${tablo.id}`, type: "company", label: tablo.name },
    { id: `company:${nova.id}`, type: "company", label: nova.name },
    { id: `agent:${DEMO_AGENT_IDS.salesLead}`, type: "agent", label: "Sales Lead" },
    { id: `agent:${DEMO_AGENT_IDS.marketingLead}`, type: "agent", label: "Marketing Lead" },
  ];
  const edges = [
    { source: `company:${holdings.id}`, target: `company:${odax.id}`, relation: "owns" },
    { source: `company:${holdings.id}`, target: `company:${tablo.id}`, relation: "owns" },
    { source: `company:${holdings.id}`, target: `company:${nova.id}`, relation: "owns" },
    { source: `company:${odax.id}`, target: `agent:${DEMO_AGENT_IDS.salesLead}`, relation: "has_agent" },
    { source: `company:${odax.id}`, target: `agent:${DEMO_AGENT_IDS.marketingLead}`, relation: "has_agent" },
    // The same real Sales Lead -> Marketing Lead request_from_agent call
    // demoActivity()'s r3 fixture already carries — one real collaboration,
    // not a separate invented one just for this layer.
    {
      source: `agent:${DEMO_AGENT_IDS.salesLead}`,
      target: `agent:${DEMO_AGENT_IDS.marketingLead}`,
      relation: "collaborated_with",
    },
  ];
  return { nodes, edges };
}

/**
 * Same structural shape as demoGraph(), plus enough varied agent state
 * (recent success, an error, a pending approval, and one plain idle agent)
 * so the office view's sprite states all have something real (within demo
 * mode) to show — every state below traces to a fixture value, not a
 * fabricated animation.
 */
export function demoMap() {
  const [holdings, odax, tablo, nova] = DEMO_COMPANIES;
  const companyNode = (c: { id: string; name: string; industry?: string }) => ({
    id: `company:${c.id}`,
    type: "company" as const,
    label: c.name,
    lastRunAt: null,
    lastRunStatus: null,
    hasPendingApproval: false,
    status: null,
    scope: null,
    departmentId: null,
    roleTitle: null,
    openTaskCount: null,
    blockedTaskCount: null,
    industry: c.industry ?? null,
  });
  const nodes = [
    companyNode(holdings),
    companyNode(odax),
    companyNode(tablo),
    companyNode(nova),
    {
      id: `agent:${DEMO_AGENT_IDS.salesLead}`,
      type: "agent" as const,
      label: "Sales Lead",
      lastRunAt: hoursAgo(2),
      lastRunStatus: "success" as const,
      hasPendingApproval: true,
      status: "active",
      scope: "company",
      departmentId: "demo-dept-sales",
      roleTitle: null,
      // Matches demoCommand()'s ODAX company-health fixture (4 open, 0 blocked).
      openTaskCount: 4,
      blockedTaskCount: 0,
      industry: null,
    },
    {
      id: `agent:${DEMO_AGENT_IDS.marketingLead}`,
      type: "agent" as const,
      label: "Marketing Lead",
      lastRunAt: hoursAgo(20),
      lastRunStatus: "error" as const,
      hasPendingApproval: false,
      status: "active",
      scope: "company",
      departmentId: "demo-dept-marketing",
      roleTitle: null,
      openTaskCount: 1,
      blockedTaskCount: 0,
      industry: null,
    },
    {
      id: `agent:${DEMO_AGENT_IDS.groupCfo}`,
      type: "agent" as const,
      label: "Group CFO",
      // No run yet — flows through the same real deriveAgentState logic as
      // a live deployment would, landing on "sleeping" rather than a
      // fabricated state, so the demo shows all real states without
      // inventing one just for the fixture.
      lastRunAt: null,
      lastRunStatus: null,
      hasPendingApproval: false,
      status: "active",
      scope: "group",
      departmentId: null,
      roleTitle: "Chief Financial Officer",
      openTaskCount: 0,
      blockedTaskCount: 0,
      industry: null,
    },
  ];
  const edges = [
    { source: `company:${holdings.id}`, target: `company:${odax.id}`, relation: "owns" },
    { source: `company:${holdings.id}`, target: `company:${tablo.id}`, relation: "owns" },
    { source: `company:${holdings.id}`, target: `company:${nova.id}`, relation: "owns" },
    { source: `company:${odax.id}`, target: `agent:${DEMO_AGENT_IDS.salesLead}`, relation: "has_agent" },
    { source: `company:${odax.id}`, target: `agent:${DEMO_AGENT_IDS.marketingLead}`, relation: "has_agent" },
    { source: `company:${holdings.id}`, target: `agent:${DEMO_AGENT_IDS.groupCfo}`, relation: "has_agent" },
  ];
  return { nodes, edges };
}

export function demoChatReply(
  userMessage: string,
  agentId?: string,
): {
  message: string;
  toolCalls: Array<{ name: string; input: unknown; result: string }>;
} {
  if (agentId === DEMO_AGENT_IDS.salesLead) {
    return {
      message:
        `**Demo mode** — Sales Lead. Apollo.io and the OSL lead-scoring model aren't connected to ` +
        `this app yet, so I can't really enrich or score a lead for "${userMessage}". Once they are, ` +
        `an \`enrich_lead\` request would still go to your Approvals queue first, same as any other ` +
        `external action.`,
      toolCalls: [{ name: "enrich_lead", input: { domainOrEmail: userMessage }, result: "Not connected yet." }],
    };
  }
  if (agentId === DEMO_AGENT_IDS.marketingLead) {
    return {
      message:
        `**Demo mode** — Marketing Lead. Higgsfield isn't connected to this app yet, so I can't ` +
        `really generate an asset for "${userMessage}". Once it is, a \`generate_creative_asset\` ` +
        `request would still go to your Approvals queue first.`,
      toolCalls: [
        { name: "generate_creative_asset", input: { prompt: userMessage }, result: "Not connected yet." },
      ],
    };
  }
  if (agentId === DEMO_AGENT_IDS.groupCfo) {
    // References the same F&B finding demoMemories() already uses, so the
    // demo stays internally consistent across pages.
    const candidates = JSON.stringify([
      {
        similarity: 0.891,
        companyA: "ODAX",
        memoryA:
          "Most F&B leads prospected so far turned out to be home-based producers, not dine-in restaurants.",
        companyB: "Tablo",
        memoryB: "Tablo's own F&B outreach has hit the same home-based-producer mismatch.",
      },
    ]);
    return {
      message:
        `**Demo mode** — Group CFO. Here's what a real \`detect_synergies\` result looks like: ODAX ` +
        `and Tablo both independently noted the same F&B lead-qualification issue — worth promoting ` +
        `that finding to group scope from \`/memories\` if it isn't already. Real board-report and ` +
        `goal data would come from your live \`goals\`/\`decisions\` tables once connected.`,
      toolCalls: [{ name: "detect_synergies", input: { limit: 5 }, result: candidates }],
    };
  }
  if (agentId === DEMO_AGENT_IDS.groupStrategy) {
    return {
      message:
        `**Demo mode** — Group Strategy. Once real data exists, I'd reason over goals and decisions ` +
        `across every company for "${userMessage}" and could compile a board report on request — try ` +
        `asking a real deployment for one. Here's what a real \`request_from_agent\` call looks like ` +
        `too: I asked the Group CFO about "${userMessage}" and got a real reply back from their own ` +
        `turn — each of us gets our own independent activity log entry, and the Colony shows a live ` +
        `beam between us while it happens.`,
      toolCalls: [
        {
          name: "request_from_agent",
          input: { targetAgentId: DEMO_AGENT_IDS.groupCfo, request: userMessage },
          result: "Group CFO replied: once connected, I'd pull that from real goals/decisions data.",
        },
      ],
    };
  }

  const citedResult = JSON.stringify([
    {
      document_title: "ODAX pricing notes.txt",
      document_id: "doc2",
      chunk_index: 0,
      similarity: 0.87,
      excerpt: "We agreed to hold the booking fee at 2% through Q2, revisiting after the partner review.",
    },
  ]);

  return {
    message:
      `**Demo mode** — no Supabase or Anthropic key is configured yet, so this isn't a real ` +
      `response to "${userMessage}". Once they're set, I'll actually reason over your real tasks, ` +
      `decisions, and documents. Here's what a real answer looks like, formatting-wise:\n\n` +
      `- Open tasks would be pulled live from \`tasks\`\n` +
      `- Documents get **cited** with the source and similarity score, like below\n` +
      `- Anything I try to *do* (like an email) goes to your Approvals queue first\n\n` +
      `See \`README.md\` for setup steps.`,
    toolCalls: [{ name: "search_documents", input: { query: userMessage }, result: citedResult }],
  };
}
