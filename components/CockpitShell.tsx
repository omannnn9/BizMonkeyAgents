"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
  { href: "/documents", label: "Documents" },
  { href: "/activity", label: "Activity" },
  { href: "/approvals", label: "Approvals" },
];

export function CockpitShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <button
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Toggle navigation"
            className="rounded-md border border-border p-1.5 text-muted hover:text-foreground md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <span className="text-sm font-semibold tracking-wide text-foreground">OD Group</span>
          <div className="hidden sm:block">
            <CompanySwitcher />
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="hidden max-w-40 truncate text-sm text-muted sm:inline">{userEmail}</span>
          <button
            onClick={signOut}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="border-b border-border bg-surface px-4 py-2 sm:hidden">
        <CompanySwitcher />
      </div>

      <div className="flex flex-1">
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
                    className={`block rounded-md px-3 py-2 text-sm ${
                      active
                        ? "bg-surface-raised text-foreground"
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

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
