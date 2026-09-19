/**
 * Real temporal grouping for activity feeds — "Just now / Today / Yesterday
 * / Earlier", the same tiers a founder would narrate the day in, computed
 * from each item's own real `createdAt` timestamp. No fabricated activity:
 * this only ever reorders/labels rows the caller already fetched.
 */
export type RecencyBucket = "justNow" | "today" | "yesterday" | "earlier";

const JUST_NOW_MS = 15 * 60 * 1000;

export const RECENCY_LABEL: Record<RecencyBucket, string> = {
  justNow: "Just now",
  today: "Earlier today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

export function recencyBucket(iso: string, now: number = Date.now()): RecencyBucket {
  const t = new Date(iso).getTime();
  if (now - t < JUST_NOW_MS) return "justNow";
  const date = new Date(t);
  const today = new Date(now);
  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return "today";
  if (sameDay(date, yesterday)) return "yesterday";
  return "earlier";
}

export function groupByRecency<T>(items: T[], getIso: (item: T) => string, now: number = Date.now()): Array<{ bucket: RecencyBucket; items: T[] }> {
  const order: RecencyBucket[] = ["justNow", "today", "yesterday", "earlier"];
  const buckets = new Map<RecencyBucket, T[]>();
  for (const item of items) {
    const b = recencyBucket(getIso(item), now);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(item);
  }
  return order.filter((b) => buckets.has(b)).map((b) => ({ bucket: b, items: buckets.get(b)! }));
}

/**
 * The founder's last real visit to a given surface, persisted client-side
 * (localStorage, the same mechanism `lib/company-context.tsx` already uses
 * for the active company) — not a fabricated "session," just a real
 * timestamp from the last time this exact browser loaded this page.
 * `markVisit` is called once per mount, after reading the previous value,
 * so "since your last visit" stays meaningful across reloads within the
 * same sitting instead of resetting itself.
 */
export function getLastVisit(key: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(`od-cortex.last-visit.${key}`);
  return raw ? Number(raw) : null;
}

export function markVisit(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`od-cortex.last-visit.${key}`, String(Date.now()));
}
