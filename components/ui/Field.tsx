/** Shared input styling for the creator wizards — was an identical giant
 *  className string retyped on every input/select/textarea across both
 *  `/companies/new` and `/agents/new`. */
export const fieldInputClass =
  "w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground outline-none focus:border-accent";

/**
 * A `<label>` directly wrapping its child input/select/textarea, so the
 * label text and control are associated without a separate `htmlFor`/`id`
 * pair — was copy-pasted identically in both wizard pages before this.
 */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}
