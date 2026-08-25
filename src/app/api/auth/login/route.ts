import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import getDb from "@/lib/db";
import { signToken, sessionCookieOptions, AUTH_COOKIE } from "@/lib/auth";
import { checkRateLimit, recordAttempt, clearAttempts, clientIp } from "@/lib/rate-limit";
import { parseBody, loginSchema } from "@/lib/validation";

// Two dimensions: a per-account limit stops targeted guessing, a per-IP limit
// stops one host spraying many accounts.
const PER_ACCOUNT = { limit: 5, windowSeconds: 15 * 60 };
const PER_IP = { limit: 30, windowSeconds: 15 * 60 };

export async function POST(request: NextRequest) {
  try {
    const { data, error } = await parseBody(request, loginSchema);
    if (error) return error;

    const ip = clientIp(request);
    const accountBucket = `login:email:${data.email}`;
    const ipBucket = `login:ip:${ip}`;

    for (const [bucket, rule] of [
      [accountBucket, PER_ACCOUNT],
      [ipBucket, PER_IP],
    ] as const) {
      const limit = checkRateLimit(bucket, rule.limit, rule.windowSeconds);
      if (!limit.allowed) {
        return NextResponse.json(
          { error: "Too many login attempts. Please try again later." },
          { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
        );
      }
    }

    const db = getDb();
    const user = db
      .prepare("SELECT id, email, name, password_hash, role FROM users WHERE email = ?")
      .get(data.email) as
      | { id: string; email: string; name: string; password_hash: string; role: string }
      | undefined;

    // Compare against a dummy hash when the account is missing, so a failed
    // lookup takes the same time as a wrong password.
    const hash = user?.password_hash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu";
    const valid = await bcrypt.compare(data.password, hash);

    if (!user || !valid) {
      recordAttempt(accountBucket);
      recordAttempt(ipBucket);
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    clearAttempts(accountBucket);

    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as "customer" | "admin" | "staff",
    });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
    response.cookies.set(AUTH_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
