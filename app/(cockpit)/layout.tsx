import { createClient } from "@/lib/supabase/server";
import { CompanyProvider } from "@/lib/company-context";
import { CockpitShell } from "@/components/CockpitShell";

// This data (which companies exist, and everything under them) must never
// be statically cached — force per-request rendering. Without this, Next
// tries to prerender it at build time (no cookies()/headers() call left to
// imply dynamic now that there's no session), which fails the build
// outright without live Supabase credentials.
export const dynamic = "force-dynamic";

export default async function CockpitLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, slug, parent_id")
    .order("name");

  return (
    <CompanyProvider initialCompanies={companies ?? []}>
      <CockpitShell>{children}</CockpitShell>
    </CompanyProvider>
  );
}
