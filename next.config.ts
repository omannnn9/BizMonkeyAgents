import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  org: "odax",
  project: "od-group-cockpit",
  // No SENTRY_AUTH_TOKEN configured — source map upload is skipped (a
  // build-time warning, not an error). Add one in CI/Vercel env vars to
  // enable it; error reporting itself doesn't need it.
  silent: !process.env.CI,
});
