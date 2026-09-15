"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompanySwitcher } from "@/components/CompanySwitcher";

const NAV = [
  { href: "/office", label: "Colony" },
  { href: "/chat", label: "Chat" },
];

// Reachable, but not equal-weight with the colony scene itself — these open
// from a "More" disclosure instead of sitting in the primary nav. Activity
// isn't here: its job is now the colony page's own right-side feed and
// terminal strip, same "fold into office, drop the standalone page" pattern
// the old /dashboard and /map pages went through. Graph/Hierarchy/Brain
// aren't here either, for the same reason one level up: they're layers
// inside the World shell (/office's own WorldLayerSwitcher) now, not
// separate destinations to link to.
const MORE_NAV = [
  { href: "/documents", label: "Documents" },
  { href: "/memories", label: "Memories" },
  { href: "/approvals", label: "Approvals" },
];

const CREATE_NAV = [
  { href: "/companies/new", label: "+ New company" },
  { href: "/agents/new", label: "+ New agent" },
];

export function CockpitShell({
  children,
  demoMode = false,
}: {
  children: React.ReactNode;
  demoMode?: boolean;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  // /office has its own left column (components/office3d/LeftNav.tsx) that
  // covers everything this sidebar does — including a link to every page
  // below — so the sidebar (and its mobile toggle) would just be a second,
  // redundant nav stacked on top of it.
  const isMissionControl = pathname === "/office";

  return (
    <div className="flex min-h-screen flex-col">
      {demoMode && (
        <div className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning sm:px-6">
          Demo mode — no Supabase project connected yet. Everything on this page is sample data, not real.
        </div>
      )}
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-6">
          {!isMissionControl && (
            <button
              onClick={() => setNavOpen((v) => !v)}
              aria-label="Toggle navigation"
              className="rounded-md border border-border p-1.5 text-muted hover:text-foreground md:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-wide text-foreground">OD Cortex</span>
            <span className="hidden text-[10px] text-muted lg:inline">An operating system for companies.</span>
          </div>
          <div className="hidden sm:block">
            <CompanySwitcher />
          </div>
        </div>
      </header>
      <div className="border-b border-border bg-surface px-4 py-2 sm:hidden">
        <CompanySwitcher />
      </div>

      <div className="flex flex-1">
        {!isMissionControl && (
          <nav
            className={`${
              navOpen ? "block" : "hidden"
            } w-full shrink-0 border-b border-border bg-surface px-3 py-4 md:block md:w-48 md:border-b-0 md:border-r`}
          >
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setNavOpen(false)}
                    className={`transition-cortex block rounded-md px-3 py-2 text-sm ${
                      active
                        ? "glow-accent bg-surface-raised text-foreground"
                        : "text-muted hover:bg-surface-raised hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="label-caps mt-4 border-t border-border px-3 pt-4">More</p>
          <ul className="mt-1 flex flex-col gap-1">
            {MORE_NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setNavOpen(false)}
                    className={`transition-cortex block rounded-md px-3 py-2 text-sm ${
                      active
                        ? "glow-accent bg-surface-raised text-foreground"
                        : "text-muted hover:bg-surface-raised hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <ul className="mt-4 flex flex-col gap-1 border-t border-border pt-4">
            {CREATE_NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setNavOpen(false)}
                    className={`transition-cortex block rounded-md px-3 py-2 text-sm ${
                      active
                        ? "glow-accent bg-surface-raised text-foreground"
                        : "text-muted hover:bg-surface-raised hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        )}

        <main className={`min-w-0 flex-1 ${isMissionControl ? "" : "p-4 sm:p-6"}`}>{children}</main>
      </div>
    </div>
  );
}
