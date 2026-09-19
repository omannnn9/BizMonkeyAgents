"use client";

import { useEffect, useRef, useState } from "react";
import { useCompany } from "@/lib/company-context";
import { getCompanyIdentity } from "@/lib/company-identity";

/**
 * Company context as a real environment switch, not a form control. A
 * plain `<select>` says "Company: ODAX" in a box; this says which
 * environment you're standing in (its real accent, its real business) and
 * lets you step into another one. Every value here — name, slug, industry
 * — is a real `companies` row; nothing here is decorative beyond the
 * curated accent/motif pairing in `lib/company-identity.ts`.
 */
export function CompanySwitcher() {
  const { companies, activeCompanyId, activeCompany, setActiveCompanyId } = useCompany();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeIdentity = activeCompany
    ? getCompanyIdentity({ slug: activeCompany.slug, industry: activeCompany.industry })
    : null;

  // OD Holdings (no parent) reads as "Group Command" first, every real
  // subsidiary follows in whatever order the API already sorts them.
  const holdings = companies.find((c) => c.parent_id === null);
  const subsidiaries = companies.filter((c) => c.parent_id !== null);
  const ordered = holdings ? [holdings, ...subsidiaries] : companies;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="transition-cortex flex items-center gap-2.5 rounded-lg border border-border bg-surface-raised py-1.5 pl-2.5 pr-3 hover:border-[color:var(--company-accent)]"
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: activeIdentity?.accent ?? "var(--muted)" }}
        />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-sm font-medium text-foreground">
            {activeCompany ? (activeCompany.parent_id === null ? "OD Holdings" : activeCompany.name) : "Loading…"}
          </span>
          {activeIdentity && <span className="text-[10px] text-muted">{activeIdentity.motif}</span>}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="ml-1 text-muted">
          <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Switch company environment"
          className="absolute left-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
        >
          <p className="label-caps border-b border-border px-3 py-2">Enter environment</p>
          <ul className="max-h-80 overflow-y-auto py-1">
            {ordered.map((c) => {
              const identity = getCompanyIdentity({ slug: c.slug, industry: c.industry });
              const isActive = c.id === activeCompanyId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      setActiveCompanyId(c.id);
                      setOpen(false);
                    }}
                    className={`transition-cortex flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-raised ${
                      isActive ? "bg-surface-raised" : ""
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        background: identity.accent,
                        boxShadow: isActive ? `0 0 10px 2px ${identity.accentSoft}` : "none",
                      }}
                    />
                    <span className="flex flex-1 flex-col leading-tight">
                      <span className="text-sm font-medium text-foreground">
                        {c.parent_id === null ? "OD Holdings" : c.name}
                      </span>
                      <span className="text-[11px] text-muted">{identity.motif}</span>
                    </span>
                    {isActive && (
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: identity.accent }}>
                        Active
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
