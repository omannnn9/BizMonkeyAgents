"use client";

interface RecentItem {
  id: string;
  title: string;
  createdAt: string;
}

/**
 * Purely page-contextual now — every real navigation destination this used
 * to duplicate (Command/Documents/Memories/Approvals/Chat) lives in the
 * persistent rail (components/CockpitShell.tsx) every route renders
 * inside, including this one. A second nav list here would just be the
 * same links said twice in two different visual languages. What's left is
 * genuinely specific to standing inside the Colony: which district you're
 * looking at, and what's recently happened here.
 */
export function LeftNav({ companyName, recentItems }: { companyName: string; recentItems: RecentItem[] }) {
  return (
    <div className="flex h-full flex-col gap-6 border-r border-border bg-surface/60 p-4 text-sm">
      <div>
        <p className="label-caps">District</p>
        <p className="font-medium text-foreground">{companyName}</p>
      </div>

      <div>
        <p className="label-caps mb-2">Recent</p>
        {recentItems.length === 0 ? (
          <p className="text-xs text-muted">Nothing recent yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recentItems.map((item) => (
              <li key={item.id} className="truncate text-xs text-muted" title={item.title}>
                {item.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
