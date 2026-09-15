import { redirect } from "next/navigation";

// Retired as a standalone route — Hierarchy is now a layer inside the
// World shell (app/(cockpit)/office/page.tsx), not a separate page. Kept
// as a real redirect (not deleted outright) so any existing bookmark or
// link still lands somewhere real, the same pattern this project used
// retiring /hq, /map, /dashboard, and /activity in earlier passes.
export default function HierarchyPageRedirect() {
  redirect("/office?layer=hierarchy");
}
