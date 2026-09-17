"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/lib/company-context";
import { Panel } from "@/components/ui/Panel";
import { Field, fieldInputClass } from "@/components/ui/Field";

export default function NewCompanyPage() {
  const router = useRouter();
  const { companies, refreshCompanies, setActiveCompanyId } = useCompany();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [parentId, setParentId] = useState(companies.find((c) => c.parent_id === null)?.id ?? "");
  const [industry, setIndustry] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !slug.trim()) {
      setError("Name and slug are required.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), slug: slug.trim(), parentId: parentId || null, industry }),
    });
    const body = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(body.error ?? "Something went wrong.");
      return;
    }

    await refreshCompanies();
    if (body.company?.id) setActiveCompanyId(body.company.id);
    router.push("/office");
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-lg font-semibold text-foreground">New company</h1>
      <p className="text-sm text-muted">
        Creates the company and seeds its default Managing Director agent automatically — the same
        pattern every existing company has.
      </p>

      <Panel className="flex flex-col gap-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
            }}
            className={fieldInputClass}
          />
        </Field>
        <Field label="Slug">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className={fieldInputClass} />
        </Field>
        <Field label="Parent (group)">
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={fieldInputClass}>
            <option value="">None (a new group-level company)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Industry (optional)">
          <input value={industry} onChange={(e) => setIndustry(e.target.value)} className={fieldInputClass} />
        </Field>

        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          onClick={submit}
          disabled={submitting}
          className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create company"}
        </button>
      </Panel>
    </div>
  );
}
