/**
 * Real company differentiation — never "just a different color". Curated
 * by the real, stable `slug` for the four companies that actually exist
 * today (see 0002_seed_companies.sql), each paired with a short "motif"
 * label derived from that company's own real `industry` string, not an
 * invented tagline. A future subsidiary (a new row under OD Holdings) has
 * no curated entry yet, so it falls back to a deterministic hash-derived
 * accent — same seeded-hash technique OfficeScene3D already uses for
 * Operator chassis colors — rather than breaking or defaulting to grey.
 */
export interface CompanyIdentity {
  /** The accent used for borders, active states, and small UI details when
   *  this company's context is active. */
  accent: string;
  /** A soft, low-opacity tint of the same accent for background washes —
   *  precomputed rather than computed with color-mix() everywhere it's used. */
  accentSoft: string;
  /** Short, real label for what this company actually does — shown next to
   *  its name wherever company context needs to read as more than a name. */
  motif: string;
}

const CURATED: Record<string, Omit<CompanyIdentity, "motif">> = {
  "od-holdings": { accent: "#8fa6ff", accentSoft: "rgba(143, 166, 255, 0.14)" },
  odax: { accent: "#4dd6d1", accentSoft: "rgba(77, 214, 209, 0.14)" },
  tablo: { accent: "#ff9d5c", accentSoft: "rgba(255, 157, 92, 0.14)" },
  nova: { accent: "#b18bff", accentSoft: "rgba(177, 139, 255, 0.14)" },
};

const FALLBACK_PALETTE: Array<Omit<CompanyIdentity, "motif">> = [
  { accent: "#5b8cff", accentSoft: "rgba(91, 140, 255, 0.14)" },
  { accent: "#5dd6a3", accentSoft: "rgba(93, 214, 163, 0.14)" },
  { accent: "#e0a5ff", accentSoft: "rgba(224, 165, 255, 0.14)" },
];

function hashToIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % mod;
}

const MOTIF_BY_SLUG: Record<string, string> = {
  "od-holdings": "Group command layer",
  odax: "Booking & appointment SaaS",
  tablo: "Restaurant technology",
  nova: "Software / AI studio",
};

export function getCompanyIdentity(company: { slug: string; industry?: string | null }): CompanyIdentity {
  const base = CURATED[company.slug] ?? FALLBACK_PALETTE[hashToIndex(company.slug, FALLBACK_PALETTE.length)];
  const motif = MOTIF_BY_SLUG[company.slug] ?? company.industry ?? "OD Group company";
  return { ...base, motif };
}
