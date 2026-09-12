import * as Sentry from "@sentry/nextjs";

// Next.js calls register() once per server instance, before it starts
// handling requests. Runtime-specific Sentry init is split into separate
// files (sentry.server.config.ts / sentry.edge.config.ts) and dynamically
// imported so the wrong runtime's SDK bits never get bundled into the other.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
