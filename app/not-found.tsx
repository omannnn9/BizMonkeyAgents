import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <p className="text-sm uppercase tracking-wide text-muted">404</p>
      <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
      <p className="max-w-sm text-sm text-muted">
        That page doesn&apos;t exist in the cockpit. Head back to the office.
      </p>
      <Link
        href="/office"
        className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
      >
        Go to office
      </Link>
    </div>
  );
}
