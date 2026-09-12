"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCompany } from "@/lib/company-context";
import { Spinner } from "@/components/Spinner";
import { AgentSwitcher, type AgentSummary } from "@/components/AgentSwitcher";

interface Citation {
  document_title: string;
  document_id: string;
  chunk_index: number;
  similarity: number;
  excerpt: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  toolNotes?: string[];
}

// Tool calls whose result is worth surfacing inline as a note under the
// reply — every one of these is an external action gated on approval, so
// the founder should see the outcome without digging into Activity.
const NOTEWORTHY_TOOLS = new Set(["send_email", "enrich_lead", "generate_creative_asset"]);

export default function ChatPage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks whether the agents-fetch below has ever resolved before — guards
  // against clearing an in-flight/just-sent message if this fetch resolves
  // after the user has already started typing or sent something (a real
  // race observed under slower load: the effect's own async resolution
  // landing after a fast send() call would otherwise wipe it out).
  const hasLoadedAgentsOnce = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // Re-fetch the agent list whenever the active company changes, and reset
  // to that company's default agent (CEO-style) rather than carrying over
  // an agent id that may not exist for the newly active company.
  useEffect(() => {
    if (!activeCompanyId) return;
    let cancelled = false;
    fetch(`/api/agents?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled || !Array.isArray(body.agents)) return;
        setAgents(body.agents);
        const ceoAgent = body.agents.find((a: AgentSummary) => a.name === "CEO Agent");
        setActiveAgentId(ceoAgent?.id ?? body.agents[0]?.id ?? "");
        // Only clear an existing conversation on a real company switch —
        // never on this effect's first resolution, which races with
        // whatever the user does while it's still in flight.
        if (hasLoadedAgentsOnce.current) setMessages([]);
        hasLoadedAgentsOnce.current = true;
      })
      .catch(() => {
        // Keep whatever agent list/selection we already had.
      });
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId]);

  function switchAgent(id: string) {
    setActiveAgentId(id);
    setMessages([]);
  }

  const activeAgent = agents.find((a) => a.id === activeAgentId);

  async function send() {
    if (!input.trim() || !activeCompanyId) return;
    const userMessage = input.trim();
    setInput("");
    setError(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeCompanyId, agentId: activeAgentId, message: userMessage, history }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong.");
        setSending(false);
        return;
      }

      let citations: Citation[] | undefined;
      const toolNotes: string[] = [];
      for (const call of body.toolCalls ?? []) {
        if (call.name === "search_documents") {
          try {
            const parsed = JSON.parse(call.result);
            if (Array.isArray(parsed)) citations = parsed;
          } catch {
            // non-JSON (e.g. "no matches found") — nothing to cite
          }
        }
        if (NOTEWORTHY_TOOLS.has(call.name)) {
          toolNotes.push(call.result);
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: body.message, citations, toolNotes },
      ]);
    } catch {
      setError("Network error reaching the agent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 sm:h-[calc(100vh-6rem)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-foreground">
          Chat {activeCompany ? `— ${activeCompany.name}` : ""}
        </h1>
        <AgentSwitcher agents={agents} activeAgentId={activeAgentId} onChange={switchAgent} />
      </div>

      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-surface p-4"
      >
        {messages.length === 0 && (
          <p className="text-sm text-muted">
            Ask {activeAgent?.name ?? "the agent"} anything about {activeCompany?.name ?? "this company"}
            {" "}— it can look up tasks and decisions and search uploaded documents. Anything it tries to
            *do* (an email, a lead enrichment, a creative asset) always goes to your approval queue first.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-4 py-2 text-sm sm:max-w-2xl ${
              m.role === "user"
                ? "self-end bg-accent text-white"
                : "self-start bg-surface-raised text-foreground"
            }`}
          >
            {m.role === "assistant" ? (
              <div className="prose-chat">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="whitespace-pre-wrap">{m.content}</p>
            )}
            {m.citations && m.citations.length > 0 && (
              <div className="mt-2 border-t border-border/50 pt-2">
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">Sources</p>
                <ul className="flex flex-col gap-1">
                  {m.citations.map((c, ci) => (
                    <li key={ci} className="text-xs text-muted">
                      <span className="text-foreground">{c.document_title}</span> (passage{" "}
                      {c.chunk_index + 1}, similarity {c.similarity})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {m.toolNotes?.map((note, ni) => (
              <p key={ni} className="mt-2 text-xs text-warning">
                {note}
              </p>
            ))}
          </div>
        ))}
        {sending && <Spinner label="Thinking…" />}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
          placeholder={
            !activeAgent || activeAgent.name === "CEO Agent"
              ? "Message the CEO Agent…"
              : `Message the ${activeAgent.name}…`
          }
          className="flex-1 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
