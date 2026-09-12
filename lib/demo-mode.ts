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

export function demoActivity() {
  return {
    runs: [
      {
        id: "r1",
        created_at: hoursAgo(2),
        status: "success",
        model: "claude-sonnet-5",
        input: "What open tasks do we have for the MD follow-up?",
      },
      {
        id: "r2",
        created_at: hoursAgo(6),
        status: "success",
        model: "claude-sonnet-5",
        input: "Draft an email to the MD about the Q3 numbers",
      },
    ],
    logs: [
      { id: "l1", created_at: hoursAgo(1), actor_type: "user", action: "approval:approved", target_type: "approval" },
      { id: "l2", created_at: hoursAgo(6), actor_type: "agent", action: "propose:send_email", target_type: "approval" },
      { id: "l3", created_at: daysAgo(1), actor_type: "user", action: "upload_document", target_type: "document" },
    ],
  };
}

export function demoApprovals() {
  return {
    approvals: [
      {
        id: "a1",
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
        action_type: "send_email",
        payload: { to: "partner@example.com", subject: "Welcome", body: "Thanks for joining ODAX." },
        risk_level: "low",
        status: "executed",
        created_at: daysAgo(3),
      },
    ],
  };
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
} as const;

/** Agents visible for a given demo company — only ODAX has Sales/Marketing, matching migration 0004. */
export function demoAgents(companyId: string) {
  const base = [{ id: DEMO_AGENT_IDS.ceo, name: "CEO Agent", role_title: "Chief of Staff" }];
  if (companyId === DEMO_COMPANIES[1].id) {
    return {
      agents: [
        ...base,
        { id: DEMO_AGENT_IDS.sales, name: "Sales Agent", role_title: "Sales" },
        { id: DEMO_AGENT_IDS.marketing, name: "Marketing Agent", role_title: "Marketing / Creative" },
      ],
    };
  }
  return { agents: base };
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

