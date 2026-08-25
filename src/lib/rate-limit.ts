import getDb from "./db";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Fixed-window limiter backed by SQLite, so limits survive a restart and are
 * shared across requests. Buckets are arbitrary strings — callers combine a
 * route name with an IP and/or an identifier to limit both dimensions.
 */
export function checkRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number
): RateLimitResult {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;

  // Opportunistic cleanup: drop anything older than the longest window we use.
  db.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").run(now - 86400);

  const row = db
    .prepare(
      "SELECT COUNT(*) as count, MIN(attempted_at) as oldest FROM login_attempts WHERE bucket = ? AND attempted_at > ?"
    )
    .get(bucket, windowStart) as { count: number; oldest: number | null };

  if (row.count >= limit) {
    const retryAfter = row.oldest ? row.oldest + windowSeconds - now : windowSeconds;
    return { allowed: false, retryAfterSeconds: Math.max(retryAfter, 1) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Records one consumed attempt against a bucket. */
export function recordAttempt(bucket: string): void {
  const db = getDb();
  db.prepare("INSERT INTO login_attempts (bucket, attempted_at) VALUES (?, ?)").run(
    bucket,
    Math.floor(Date.now() / 1000)
  );
}

/** Clears a bucket, e.g. after a successful login. */
export function clearAttempts(bucket: string): void {
  const db = getDb();
  db.prepare("DELETE FROM login_attempts WHERE bucket = ?").run(bucket);
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
