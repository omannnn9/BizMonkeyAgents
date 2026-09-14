"use client";

interface RunRow {
  id: string;
  agent_id: string;
  created_at: string;
  status: string;
  input: string | null;
  output: string | null;
}

/**
 * A live, read-only feed of what Operators actually said —
 * `agent_runs.output`, attributed by name + rank via `agentInfoById` (built
 * from the same /api/map data the colony viewport already loads, not a
 * second lookup). An Operator with no output yet (still running, or
 * errored before producing one) shows its last real status instead of
 * invented dialogue — never filler.
 */
export function ActivityFeed({
  runs,
  agentInfoById,
}: {
  runs: RunRow[];
  agentInfoById: Map<string, { name: string; rank: string }>;
}) {
  return (
    <div data-testid="activity-feed" className="flex h-full flex-col gap-3 border-l border-border bg-surface/60 p-4">
      <p className="label-caps">Activity</p>
      {runs.length === 0 ? (
        <p className="text-xs text-muted">Nothing has happened here yet.</p>
      ) : (
        <ul className="flex flex-col gap-3 overflow-y-auto">
          {runs.map((r) => {
            const info = agentInfoById.get(r.agent_id);
            return (
              <li key={r.id} className="rounded-md border border-border bg-surface px-3 py-2 text-xs">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {info?.name ?? "Operator"}
                    {info?.rank && <span className="ml-1.5 font-normal text-muted">— {info.rank}</span>}
                  </span>
                  <span className="shrink-0 text-muted">{new Date(r.created_at).toLocaleTimeString()}</span>
                </div>
                {r.output ? (
                  <p className="text-foreground">{r.output}</p>
                ) : (
                  <p className={r.status === "error" ? "text-danger" : "text-muted"}>
                    {r.status === "error" ? "Run failed — no output." : `Status: ${r.status}`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
