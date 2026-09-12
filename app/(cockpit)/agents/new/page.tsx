"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/lib/company-context";

// Mirrors lib/agent/tools/registry.ts's ALL_TOOLS — kept as a small
// hardcoded list here rather than importing that module into a client
// component, since its tools pull in server-only Supabase logic.
const AVAILABLE_TOOLS = [
  { name: "query_company_data", label: "Query company data (tasks, decisions, projects, goals)" },
  { name: "search_documents", label: "Search documents" },
  { name: "send_email", label: "Send email (Gmail — approval-gated)" },
  { name: "enrich_lead", label: "Enrich lead (Apollo.io — approval-gated, not connected)" },
  { name: "generate_creative_asset", label: "Generate creative asset (Higgsfield — approval-gated, not connected)" },
  { name: "promote_memory", label: "Promote memory to group scope" },
  { name: "generate_board_report", label: "Generate board report" },
];

export default function NewAgentPage() {
  const router = useRouter();
  const { companies, activeCompanyId } = useCompany();
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [companyId, setCompanyId] = useState(activeCompanyId);
  const [scope, setScope] = useState<"company" | "group" | "project">("company");
  const [persona, setPersona] = useState("");
  const [model, setModel] = useState("claude-sonnet-5");
  const [tools, setTools] = useState<string[]>(["query_company_data", "search_documents"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTool(toolName: string) {
    setTools((prev) => (prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName]));
  }

  async function submit() {
    if (!name.trim() || !persona.trim() || !companyId) {
      setError("Name, persona, and company are required.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), roleTitle, companyId, scope, persona: persona.trim(), model, tools }),
    });
    const body = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(body.error ?? "Something went wrong.");
      return;
    }
    router.push("/chat");
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">New agent</h1>
      <p className="text-sm text-muted">
        Appears in the chat agent switcher for its company once created. This is your own direct
        action — not agent-proposed, so it isn&apos;t approval-gated.
      </p>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </Field>
        <Field label="Role title (optional)">
          <input
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </Field>
        <Field label="Company">
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_id === null ? `${c.name} (group)` : c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Scope">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="company">company</option>
            <option value="group">group</option>
            <option value="project">project</option>
          </select>
        </Field>
        <Field label="Model">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="claude-sonnet-5">claude-sonnet-5 (default)</option>
            <option value="claude-opus-5">claude-opus-5 (strategic reasoning)</option>
            <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001 (cheap/fast)</option>
          </select>
        </Field>
        <Field label="Persona / system prompt">
          <textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </Field>
        <div className="flex flex-col gap-2 text-sm">
          <span className="text-muted">Tools</span>
          {AVAILABLE_TOOLS.map((t) => (
            <label key={t.name} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={tools.includes(t.name)}
                onChange={() => toggleTool(t.name)}
                className="mt-0.5"
              />
              <span className="text-foreground">{t.label}</span>
            </label>
          ))}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          onClick={submit}
          disabled={submitting}
          className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create agent"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}
