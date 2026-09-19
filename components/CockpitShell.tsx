"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { useCompany } from "@/lib/company-context";
import { getCompanyIdentity } from "@/lib/company-identity";
import { CommandIcon, ColonyIcon, ChatIcon, DocumentsIcon, MemoriesIcon, ApprovalsIcon, PlusIcon } from "@/components/ui/icons";

// One persistent operating-system rail instead of a website navbar — every
// route renders inside it, including /office (the Colony's own 4-zone
// layout used to opt entirely out of this shell; it no longer does, so the
// same "where am I / what needs me" chrome is never absent). Primary
// destinations get real icon + label buttons; Documents/Memories/Approvals
// sit in a visually distinct second tier since they're reference surfaces,
// not places the founder "operates" from the way Command/Colony/Chat are.
const PRIMARY = [
  { href: "/command", label: "Command", icon: CommandIcon },
  { href: "/office", label: "Colony", icon: ColonyIcon },
  { href: "/chat", label: "Chat", icon: ChatIcon },
];

const SECONDARY = [
  { href: "/documents", label: "Documents", icon: DocumentsIcon },
  { href: "/memories", label: "Memories", icon: MemoriesIcon },
  { href: "/approvals", label: "Approvals", icon: ApprovalsIcon },
];

const CREATE_NAV = [
  { href: "/companies/new", label: "New company" },
  { href: "/agents/new", label: "New agent" },
];

/** Best-effort, non-blocking: reuses the Command Center's own already-bounded
 *  attention query so the rail's Command/Approvals icons can carry a real
 *  "something needs you" count — never fabricated, silently absent (no
 *  badge, not a zero) if the fetch fails or nothing needs attention. */
function useAttentionCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/command")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled || !body?.attention) return;
        const a = body.attention;
        setCount(
          (a.pendingApprovals?.length ?? 0) +
            (a.blockedTasks?.length ?? 0) +
            (a.overdueTasks?.length ?? 0) +
            (a.atRiskGoals?.length ?? 0),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return count;
}

function AttentionBadge({ count }: { count: number }) {
  return (
    <span
      className="pulse-live absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-[3px] text-[9px] font-semibold text-background"
      aria-hidden="true"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function RailButton({
  href,
  label,
  Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`transition-cortex group relative flex flex-col items-center gap-1 rounded-lg px-1.5 py-2 ${
        active ? "glow-company bg-surface-raised text-foreground" : "text-muted hover:bg-surface-raised hover:text-foreground"
      }`}
    >
      <span className="relative">
        <Icon className={active ? "text-[color:var(--company-accent)]" : ""} />
        {!!badge && <AttentionBadge count={badge} />}
      </span>
      <span className="text-[9.5px] font-medium leading-none">{label}</span>
    </Link>
  );
}

export function CockpitShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { activeCompany } = useCompany();
  const [moreOpen, setMoreOpen] = useState(false);
  const attentionCount = useAttentionCount();
  // The Colony is the one room that's inherently full-bleed (a 3D
  // viewport with its own 4-zone internal layout, not a document); every
  // other room gets a consistent content margin. This is the only place
  // this shell special-cases a route — the rail and header above stay
  // identical everywhere, which is the actual fix for the old "two
  // different shells" problem.
  const isFullBleed = pathname === "/office";

  const identity = activeCompany
    ? getCompanyIdentity({ slug: activeCompany.slug, industry: activeCompany.industry })
    : null;

  return (
    <div
      className="flex min-h-screen flex-col md:flex-row"
      style={
        identity
          ? ({ "--company-accent": identity.accent, "--company-accent-soft": identity.accentSoft } as React.CSSProperties)
          : undefined
      }
    >
      {/* Desktop rail — persistent on every route, this app's actual
          primary navigation. A plain vertical sidebar would still read as
          "website nav"; icon-first with a real brand mark and a hard split
          between operate (top) and reference (bottom) is what makes it
          read as an OS rail instead. */}
      <aside className="atmosphere-company hidden w-[var(--rail-width)] shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-4 md:flex">
        <Link
          href="/command"
          aria-label="OD Cortex — Command"
          className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-raised text-[11px] font-semibold tracking-wide text-foreground"
        >
          OD
        </Link>

        <nav aria-label="Primary" className="flex flex-col gap-1">
          {PRIMARY.map((item) => (
            <RailButton
              key={item.href}
              href={item.href}
              label={item.label}
              Icon={item.icon}
              active={pathname === item.href}
              badge={item.href === "/command" ? attentionCount ?? undefined : undefined}
            />
          ))}
        </nav>

        <div className="my-3 h-px w-8 bg-border" aria-hidden="true" />

        <nav aria-label="Knowledge" className="flex flex-col gap-1">
          {SECONDARY.map((item) => (
            <RailButton
              key={item.href}
              href={item.href}
              label={item.label}
              Icon={item.icon}
              active={pathname === item.href}
              badge={item.href === "/approvals" ? attentionCount ?? undefined : undefined}
            />
          ))}
        </nav>

        <div className="flex-1" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label="Create"
            className="transition-cortex flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:border-[color:var(--company-accent)] hover:text-foreground"
          >
            <PlusIcon />
          </button>
          {moreOpen && (
            <div
              role="menu"
              className="absolute bottom-0 left-full z-50 ml-2 w-44 overflow-hidden rounded-lg border border-border bg-surface shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
            >
              {CREATE_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setMoreOpen(false)}
                  className="transition-cortex block px-3 py-2.5 text-sm text-foreground hover:bg-surface-raised"
                >
                  + {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5 sm:px-5">
          <CompanySwitcher />
          <div className="hidden items-baseline gap-2 sm:flex">
            <span className="text-context">OD Cortex</span>
          </div>
        </header>

        <main className={`min-h-0 min-w-0 flex-1 pb-16 md:pb-0 ${isFullBleed ? "" : "p-4 sm:p-6"}`}>{children}</main>
      </div>

      {/* Mobile rail — the same primary destinations as a fixed bottom bar,
          plus a "More" sheet for the reference surfaces and Create, rather
          than collapsing the desktop sidebar into a hamburger drawer. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-surface md:hidden"
      >
        {PRIMARY.map((item) => (
          <RailButton
            key={item.href}
            href={item.href}
            label={item.label}
            Icon={item.icon}
            active={pathname === item.href}
            badge={item.href === "/command" ? attentionCount ?? undefined : undefined}
          />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          className={`transition-cortex flex flex-col items-center gap-1 px-1.5 py-2 ${
            moreOpen ? "text-foreground" : "text-muted"
          }`}
        >
          <PlusIcon />
          <span className="text-[9.5px] font-medium leading-none">More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="w-full rounded-t-xl border-t border-border bg-surface p-3 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="label-caps px-2 py-1.5">Reference</p>
            {SECONDARY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="transition-cortex flex items-center gap-3 rounded-md px-2 py-2.5 text-sm text-foreground hover:bg-surface-raised"
              >
                <item.icon /> {item.label}
              </Link>
            ))}
            <p className="label-caps mt-2 px-2 py-1.5">Create</p>
            {CREATE_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="transition-cortex block rounded-md px-2 py-2.5 text-sm text-foreground hover:bg-surface-raised"
              >
                + {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
