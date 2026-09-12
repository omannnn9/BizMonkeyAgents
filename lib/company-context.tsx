"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export interface CompanySummary {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

interface CompanyContextValue {
  companies: CompanySummary[];
  activeCompanyId: string;
  activeCompany: CompanySummary | undefined;
  setActiveCompanyId: (id: string) => void;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

const STORAGE_KEY = "od-group.active-company-id";

/**
 * Holds the active company in client state (persisted to localStorage for
 * convenience across visits) so switching companies in the header is a
 * state update + re-fetch, never a navigation or full page reload.
 */
export function CompanyProvider({
  initialCompanies,
  children,
}: {
  initialCompanies: CompanySummary[];
  children: React.ReactNode;
}) {
  const [companies, setCompanies] = useState<CompanySummary[]>(initialCompanies);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && initialCompanies.some((c) => c.id === stored)) return stored;
    }
    // Default to the group level (no parent) if present, else the first company.
    return initialCompanies.find((c) => c.parent_id === null)?.id ?? initialCompanies[0]?.id ?? "";
  });

  useEffect(() => {
    fetch("/api/companies")
      .then((res) => res.json())
      .then((body) => {
        if (Array.isArray(body.companies)) setCompanies(body.companies);
      })
      .catch(() => {
        // Keep the server-rendered initialCompanies if this refresh fails.
      });
  }, []);

  function setActiveCompanyId(id: string) {
    setActiveCompanyIdState(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  }

  const value = useMemo(
    () => ({
      companies,
      activeCompanyId,
      activeCompany: companies.find((c) => c.id === activeCompanyId),
      setActiveCompanyId,
    }),
    [companies, activeCompanyId],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within a CompanyProvider");
  return ctx;
}
