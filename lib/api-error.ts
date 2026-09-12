import { NextResponse } from "next/server";

/**
 * Wraps a route handler so a thrown error (e.g. createClient() failing on a
 * malformed Supabase URL) becomes a clean JSON 500 instead of an unhandled
 * exception. Doesn't change behavior for handlers that already return a
 * NextResponse normally — only catches what would otherwise crash.
 */
export function withApiErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error("[api] unhandled error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown server error" },
        { status: 500 },
      );
    }
  };
}
