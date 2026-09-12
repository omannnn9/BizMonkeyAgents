"use client";

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

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold tracking-wide text-foreground">OD Group</span>
          <CompanySwitcher />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted">{userEmail}</span>
          <button
            onClick={signOut}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        <nav className="w-48 border-r border-border bg-surface px-3 py-4">
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
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

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
