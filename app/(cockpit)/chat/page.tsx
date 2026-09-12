"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCompany } from "@/lib/company-context";
import { Spinner } from "@/components/Spinner";

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

export default function ChatPage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

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
        body: JSON.stringify({ activeCompanyId, message: userMessage, history }),
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
        if (call.name === "send_email") {
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
      <h1 className="text-lg font-semibold text-foreground">
        Chat {activeCompany ? `— ${activeCompany.name}` : ""}
      </h1>

      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-surface p-4"
      >
        {messages.length === 0 && (
          <p className="text-sm text-muted">
            Ask the CEO Agent anything about {activeCompany?.name ?? "this company"} — it can look
            up tasks and decisions, search uploaded documents, and draft emails (which always go to
            your approval queue first).
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
          placeholder="Message the CEO Agent…"
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
