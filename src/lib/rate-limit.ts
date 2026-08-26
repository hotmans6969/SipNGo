import getDb from "./db";
import { sql } from "./sql";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Fixed-window limiter backed by the database, so limits survive a restart and
 * hold across every serverless instance rather than each one keeping its own
 * private counter. Buckets are arbitrary strings — callers combine a route
 * name with an IP and/or an identifier to limit both dimensions.
 */
export async function checkRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  await getDb();
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;

  // Opportunistic cleanup: drop anything older than the longest window we use.
  await sql.run("DELETE FROM login_attempts WHERE attempted_at < ?", [now - 86400]);

  const row = await sql.one<{ count: number; oldest: number | null }>(
    "SELECT COUNT(*) as count, MIN(attempted_at) as oldest FROM login_attempts WHERE bucket = ? AND attempted_at > ?",
    [bucket, windowStart]
  );

  const count = Number(row?.count ?? 0);
  if (count >= limit) {
    const oldest = row?.oldest == null ? null : Number(row.oldest);
    const retryAfter = oldest ? oldest + windowSeconds - now : windowSeconds;
    return { allowed: false, retryAfterSeconds: Math.max(retryAfter, 1) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Records one consumed attempt against a bucket. */
export async function recordAttempt(bucket: string): Promise<void> {
  await getDb();
  await sql.run("INSERT INTO login_attempts (bucket, attempted_at) VALUES (?, ?)", [
    bucket,
    Math.floor(Date.now() / 1000),
  ]);
}

/** Clears a bucket, e.g. after a successful login. */
export async function clearAttempts(bucket: string): Promise<void> {
  await getDb();
  await sql.run("DELETE FROM login_attempts WHERE bucket = ?", [bucket]);
}

/**
 * Best-effort client IP. Trusts the proxy headers a hosted deploy sets;
 * behind no proxy this collapses to "unknown", which still rate-limits
 * globally rather than not at all.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
