"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Root error boundary — catches React rendering errors that occur outside
 * any route's own error handling (or in the root layout itself). Reports
 * to Sentry, since these wouldn't otherwise hit onRequestError.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            padding: "1rem",
            textAlign: "center",
            background: "#0a0b0d",
            color: "#e7e9ee",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <p style={{ fontSize: "0.875rem", color: "#ef5858", textTransform: "uppercase" }}>
            Unexpected error
          </p>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Something went wrong</h1>
          <button
            onClick={reset}
            style={{
              marginTop: "0.5rem",
              borderRadius: "0.375rem",
              background: "#5b8cff",
              color: "white",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
