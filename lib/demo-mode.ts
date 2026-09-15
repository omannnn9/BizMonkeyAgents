/**
 * Frontend-preview mode: when there's no Supabase project configured yet,
 * every page shows realistic-looking mock data instead of erroring, so the
 * UI can be reviewed before the backend exists. Every value here is
 * fabricated — nothing in this file is ever mixed with real data, and the
 * UI shows a persistent "Demo mode" banner whenever it's active so there's
 * no ambiguity about what's real.
 */
export function isDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export const DEMO_COMPANIES = [
  { id: "00000000-0000-0000-0000-000000000001", name: "OD Holdings", slug: "od-holdings", parent_id: null },
  { id: "00000000-0000-0000-0000-000000000002", name: "ODAX", slug: "odax", parent_id: "00000000-0000-0000-0000-000000000001" },
  { id: "00000000-0000-0000-0000-000000000003", name: "Tablo", slug: "tablo", parent_id: "00000000-0000-0000-0000-000000000001" },
  { id: "00000000-0000-0000-0000-000000000004", name: "NOVA", slug: "nova", parent_id: "00000000-0000-0000-0000-000000000001" },
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
      agent_id: DEMO_AGENT_IDS.sales,
      created_at: hoursAgo(2),
      status: "success",
      model: "claude-sonnet-5",
      input: "What open tasks do we have for the MD follow-up?",
      output: "Two open: confirm the pricing tier with the MD, and send the updated proposal by Friday.",
    },
    {
      id: "r2",
      agent_id: DEMO_AGENT_IDS.marketing,
      created_at: hoursAgo(20),
      status: "error",
      model: "claude-sonnet-5",
      input: "Draft an email to the MD about the Q3 numbers",
      output: null,
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
      proposed_by_agent_id: DEMO_AGENT_IDS.sales,
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
      proposed_by_agent_id: DEMO_AGENT_IDS.sales,
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
  ceo: "agent-ceo",
  sales: "agent-sales",
  marketing: "agent-marketing",
  groupCfo: "agent-group-cfo",
  groupStrategy: "agent-group-strategy",
} as const;

/**
 * Agents visible for a given demo company — ODAX gets Sales/Marketing
 * (migration 0004), OD Holdings gets the two group-scope agents (migration
 * 0005). These two were missing from demo mode entirely until now — a real
 * gap, since it meant Phase 3's group agents were never reachable in the
 * frontend preview.
 */
export function demoAgents(companyId: string) {
  const base = [
    { id: DEMO_AGENT_IDS.ceo, name: "CEO Agent", role_title: "Chief of Staff", scope: "company", department_id: null },
  ];
  if (companyId === DEMO_COMPANIES[0].id) {
    return {
      agents: [
        ...base,
        {
          id: DEMO_AGENT_IDS.groupCfo,
          name: "Group CFO",
          role_title: "Chief Financial Officer",
          scope: "group",
          department_id: null,
        },
        {
          id: DEMO_AGENT_IDS.groupStrategy,
          name: "Group Strategy",
          role_title: "Head of Strategy",
          scope: "group",
          department_id: null,
        },
      ],
    };
  }
  if (companyId === DEMO_COMPANIES[1].id) {
    return {
      agents: [
        ...base,
        {
          id: DEMO_AGENT_IDS.sales,
          name: "Sales Agent",
          role_title: "Sales",
          scope: "company",
          department_id: "demo-dept-sales",
        },
        {
          id: DEMO_AGENT_IDS.marketing,
          name: "Marketing Agent",
          role_title: "Marketing / Creative",
          scope: "company",
          department_id: "demo-dept-marketing",
        },
      ],
    };
  }
  return { agents: base };
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
    synergies: [{ memoryAId: "mem-company-1", memoryBId: "mem-company-2", similarity: 0.891 }],
  };
}

/** Matches the structural edges seeded by migration 0004_phase2.sql — real org structure, not fabricated activity. */
export function demoGraph() {
  const [holdings, odax, tablo, nova] = DEMO_COMPANIES;
  const nodes = [
    { id: `company:${holdings.id}`, type: "company", label: holdings.name },
    { id: `company:${odax.id}`, type: "company", label: odax.name },
    { id: `company:${tablo.id}`, type: "company", label: tablo.name },
    { id: `company:${nova.id}`, type: "company", label: nova.name },
    { id: "agent:agent-sales", type: "agent", label: "Sales Agent" },
    { id: "agent:agent-marketing", type: "agent", label: "Marketing Agent" },
  ];
  const edges = [
    { source: `company:${holdings.id}`, target: `company:${odax.id}`, relation: "owns" },
    { source: `company:${holdings.id}`, target: `company:${tablo.id}`, relation: "owns" },
    { source: `company:${holdings.id}`, target: `company:${nova.id}`, relation: "owns" },
    { source: `company:${odax.id}`, target: "agent:agent-sales", relation: "has_agent" },
    { source: `company:${odax.id}`, target: "agent:agent-marketing", relation: "has_agent" },
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
  const companyNode = (c: { id: string; name: string }) => ({
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
  });
  const nodes = [
    companyNode(holdings),
    companyNode(odax),
    companyNode(tablo),
    companyNode(nova),
    {
      id: "agent:agent-sales",
      type: "agent" as const,
      label: "Sales Agent",
      lastRunAt: hoursAgo(2),
      lastRunStatus: "success" as const,
      hasPendingApproval: true,
      status: "active",
      scope: "company",
      departmentId: "demo-dept-sales",
      roleTitle: "Sales",
    },
    {
      id: "agent:agent-marketing",
      type: "agent" as const,
      label: "Marketing Agent",
      lastRunAt: hoursAgo(20),
      lastRunStatus: "error" as const,
      hasPendingApproval: false,
      status: "active",
      scope: "company",
      departmentId: "demo-dept-marketing",
      roleTitle: "Marketing / Creative",
    },
    {
      id: `agent:${DEMO_AGENT_IDS.groupCfo}`,
      type: "agent" as const,
      label: "Group CFO",
      // No run yet — flows through the same real deriveAgentState logic as
      // a live deployment would, landing on "sleeping" rather than a
      // fabricated state, so the demo shows all 6 real states without
      // inventing one just for the fixture.
      lastRunAt: null,
      lastRunStatus: null,
      hasPendingApproval: false,
      status: "active",
      scope: "group",
      departmentId: null,
      roleTitle: "Chief Financial Officer",
    },
  ];
  const edges = [
    { source: `company:${holdings.id}`, target: `company:${odax.id}`, relation: "owns" },
    { source: `company:${holdings.id}`, target: `company:${tablo.id}`, relation: "owns" },
    { source: `company:${holdings.id}`, target: `company:${nova.id}`, relation: "owns" },
    { source: `company:${odax.id}`, target: "agent:agent-sales", relation: "has_agent" },
    { source: `company:${odax.id}`, target: "agent:agent-marketing", relation: "has_agent" },
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
  if (agentId === DEMO_AGENT_IDS.sales) {
    return {
      message:
        `**Demo mode** — Sales Agent. Apollo.io and the OSL lead-scoring model aren't connected to ` +
        `this app yet, so I can't really enrich or score a lead for "${userMessage}". Once they are, ` +
        `an \`enrich_lead\` request would still go to your Approvals queue first, same as any other ` +
        `external action.`,
      toolCalls: [{ name: "enrich_lead", input: { domainOrEmail: userMessage }, result: "Not connected yet." }],
    };
  }
  if (agentId === DEMO_AGENT_IDS.marketing) {
    return {
      message:
        `**Demo mode** — Marketing Agent. Higgsfield isn't connected to this app yet, so I can't ` +
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
        `asking a real deployment for one.`,
      toolCalls: [],
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

