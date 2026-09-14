"use client";

import Link from "next/link";

interface RecentItem {
  id: string;
  title: string;
  createdAt: string;
}

// The reference's Whiteboard/Design Board/Builder/Chats/Projects/Workflows
// section, remapped to what this app actually has rather than inventing
// pages for labels with nothing real behind them.
const SURFACES = [
  { href: "/graph", label: "Graph" },
  { href: "/documents", label: "Documents" },
  { href: "/memories", label: "Memories" },
  { href: "/approvals", label: "Approvals" },
  { href: "/chat", label: "Chat" },
];

export function LeftNav({ companyName, recentItems }: { companyName: string; recentItems: RecentItem[] }) {
  return (
    <div className="flex h-full flex-col gap-6 border-r border-border bg-surface/60 p-4 text-sm">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted">Room</p>
        <p className="font-medium text-foreground">{companyName}</p>
      </div>

      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wide text-muted">Recent</p>
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

      <nav aria-label="Surfaces">
        <p className="mb-2 text-[10px] uppercase tracking-wide text-muted">Surfaces</p>
        <ul className="flex flex-col gap-1">
          {SURFACES.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="block rounded-md px-2 py-1.5 text-foreground hover:bg-surface-raised"
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
