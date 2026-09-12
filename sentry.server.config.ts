import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  // Not verbose in production; flip on locally if debugging Sentry itself.
  debug: false,
});
