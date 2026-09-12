"use client";

import { useCompany } from "@/lib/company-context";

export function CompanySwitcher() {
  const { companies, activeCompanyId, setActiveCompanyId } = useCompany();

  return (
    <select
      value={activeCompanyId}
      onChange={(e) => setActiveCompanyId(e.target.value)}
      className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm font-medium text-foreground outline-none focus:border-accent"
    >
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.parent_id === null ? `${c.name} (group)` : c.name}
        </option>
      ))}
    </select>
  );
}
