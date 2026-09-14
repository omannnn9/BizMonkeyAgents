"use client";

import { useEffect, useMemo, useRef } from "react";

interface RunRow {
  id: string;
  agent_id: string;
  created_at: string;
  status: string;
  model: string;
}

interface LogRow {
  id: string;
  created_at: string;
  actor_type: string;
  action: string;
  target_type: string | null;
}

function timeOf(iso: string): string {
  return new Date(iso).toISOString().slice(11, 19);
}

/**
 * A raw-looking status stream — the same `agent_runs`/`audit_log` rows the
 * activity feed and terminal both already fetch, just re-presented as
 * plain log lines instead of prose. No second data source, no line that
 * doesn't trace back to a real row.
 */
export function TerminalStrip({ runs, logs }: { runs: RunRow[]; logs: LogRow[] }) {
  const lines = useMemo(() => {
    const runLines = runs.map((r) => ({
      at: r.created_at,
      text: `[${timeOf(r.created_at)}] agent_run agent=${r.agent_id.slice(0, 12)} status=${r.status} model=${r.model}`,
      isError: r.status === "error",
    }));
    const logLines = logs.map((l) => ({
      at: l.created_at,
      text: `[${timeOf(l.created_at)}] audit actor=${l.actor_type} ${l.action}${l.target_type ? ` target=${l.target_type}` : ""}`,
      isError: false,
    }));
    return [...runLines, ...logLines].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [runs, logs]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto border-t border-border bg-black/60 px-3 py-2 font-mono text-[11px] text-[#7ee8a0]"
    >
      {lines.length === 0 ? (
        <p className="text-muted">No log lines yet.</p>
      ) : (
        lines.map((line, i) => (
          <p key={i} className={line.isError ? "text-danger" : undefined}>
            {line.text}
          </p>
        ))
      )}
    </div>
  );
}
