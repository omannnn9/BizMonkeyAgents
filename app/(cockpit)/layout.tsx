import { createClient } from "@/lib/supabase/server";
import { CompanyProvider } from "@/lib/company-context";
import { CockpitShell } from "@/components/CockpitShell";
import * as Sentry from "@sentry/nextjs";

// This data (which companies exist, and everything under them) must never
// be statically cached — force per-request rendering. Without this, Next
// tries to prerender it at build time (no cookies()/headers() call left to
// imply dynamic now that there's no session), which fails the build
// outright without live Supabase credentials.
export const dynamic = "force-dynamic";

function SetupError({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <p className="text-sm uppercase tracking-wide text-danger">Setup error</p>
      <h1 className="text-lg font-semibold text-foreground">Couldn&apos;t reach Supabase</h1>
      <p className="max-w-md text-sm text-muted">{message}</p>
      <div className="mt-2 max-w-md rounded-lg border border-border bg-surface p-4 text-left text-xs text-muted">
        <p className="mb-1 font-medium text-foreground">Check:</p>
        <ul className="list-disc pl-4">
          <li>
            <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> are set
            correctly in the deployment&apos;s environment variables (not swapped with each other or
            the anon key).
          </li>
          <li>The migrations in <code>supabase/migrations/</code> have been applied to that project.</li>
          <li>
            <code>npm run seed:founder</code> has been run once (needed for anything that records an
            actor, not for the company list itself).
          </li>
        </ul>
      </div>
    </div>
  );
}

async function loadCompanies(): Promise<
  | {
      ok: true;
      companies: Array<{ id: string; name: string; slug: string; parent_id: string | null; industry: string | null }>;
    }
  | { ok: false; message: string }
> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, slug, parent_id, industry")
      .order("name");
    if (error) {
      console.error("[CockpitLayout] companies query failed:", error);
      Sentry.captureException(new Error(`companies query failed: ${error.message}`));
      return { ok: false, message: error.message };
    }
    return { ok: true, companies: data ?? [] };
  } catch (err) {
    console.error("[CockpitLayout] Supabase client/setup error:", err);
    Sentry.captureException(err);
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export default async function CockpitLayout({ children }: { children: React.ReactNode }) {
  const result = await loadCompanies();
  if (!result.ok) {
    return <SetupError message={result.message} />;
  }

  return (
    <CompanyProvider initialCompanies={result.companies}>
      <CockpitShell>{children}</CockpitShell>
    </CompanyProvider>
  );
}
