import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompanyProvider } from "@/lib/company-context";
import { CockpitShell } from "@/components/CockpitShell";

export default async function CockpitLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, slug, parent_id")
    .order("name");

  return (
    <CompanyProvider initialCompanies={companies ?? []}>
      <CockpitShell userEmail={userData.user.email ?? ""}>{children}</CockpitShell>
    </CompanyProvider>
  );
}
