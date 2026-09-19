"use client";

import { useEffect, useRef, useState } from "react";
import { useCompany } from "@/lib/company-context";
import { AgentSwitcher, type AgentSummary } from "@/components/AgentSwitcher";
import { AgentChatPanel } from "@/components/AgentChatPanel";

export default function ChatPage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>("");
  // Guards against clearing the just-selected agent if this fetch resolves
  // after the user has already switched companies again (a real race
  // observed under slower load).
  const hasLoadedAgentsOnce = useRef(false);

  // Re-fetch the agent list whenever the active company changes, and reset
  // to that company's default agent rather than carrying over an agent id
  // that may not exist for the newly active company. Default preference:
  // Group CEO (the top of the org, the founder's primary point of contact —
  // see AGENTS_AND_TOOLS.md), then Chief of Staff (its synthesis layer),
  // then any department-less company-scope agent (Managing Director /
  // Studio Director — the company-wide synthesis role every company
  // migration 0009 gives), then whatever comes first. The switcher below
  // still lets the founder talk to any individual agent directly —
  // Group CEO is only the default, never the only option.
  useEffect(() => {
    if (!activeCompanyId) return;
    let cancelled = false;
    fetch(`/api/agents?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled || !Array.isArray(body.agents)) return;
        setAgents(body.agents);
        const defaultAgent =
          body.agents.find((a: AgentSummary) => a.name === "Group CEO") ??
          body.agents.find((a: AgentSummary) => a.name === "Chief of Staff") ??
          body.agents.find((a: AgentSummary) => a.scope === "company" && !a.department_id);
        setActiveAgentId(defaultAgent?.id ?? body.agents[0]?.id ?? "");
        hasLoadedAgentsOnce.current = true;
      })
      .catch(() => {
        // Keep whatever agent list/selection we already had.
      });
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId]);

  const activeAgent = agents.find((a) => a.id === activeAgentId);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 sm:h-[calc(100vh-6rem)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-foreground">
          Chat {activeCompany ? `— ${activeCompany.name}` : ""}
        </h1>
        <AgentSwitcher agents={agents} activeAgentId={activeAgentId} onChange={setActiveAgentId} />
      </div>

      {activeCompanyId && activeAgentId && (
        <AgentChatPanel
          key={activeAgentId}
          companyId={activeCompanyId}
          agentId={activeAgentId}
          agentLabel={activeAgent?.name}
        />
      )}
    </div>
  );
}
