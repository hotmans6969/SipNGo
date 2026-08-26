import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import getDb from "@/lib/db";
import { sql } from "@/lib/sql";
import { signToken, sessionCookieOptions, AUTH_COOKIE } from "@/lib/auth";
import { checkRateLimit, recordAttempt, clientIp } from "@/lib/rate-limit";
import { parseBody, registerSchema } from "@/lib/validation";

const PER_IP = { limit: 10, windowSeconds: 60 * 60 };

export async function POST(request: NextRequest) {
  try {
    const { data, error } = await parseBody(request, registerSchema);
    if (error) return error;

    const ipBucket = `register:ip:${clientIp(request)}`;
    const limit = await checkRateLimit(ipBucket, PER_IP.limit, PER_IP.windowSeconds);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many sign-up attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }
    await recordAttempt(ipBucket);

    await getDb();

    // The schema already lowercased and trimmed the address, so this check and
    // the insert below agree on exactly one canonical form.
    const existing = await sql.one("SELECT id FROM users WHERE email = ?", [data.email]);
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(data.password, 12);

    try {
      await sql.run(
        "INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'customer')",
        [id, data.email, data.name, passwordHash]
      );
    } catch (insertError) {
      // Loses a race with a concurrent signup for the same address.
      if (
        insertError instanceof Error &&
        insertError.message.includes("UNIQUE constraint failed")
      ) {
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 409 }
        );
      }
      throw insertError;
    }

    const token = await signToken({
      id,
      email: data.email,
      name: data.name,
      role: "customer",
    });

    const response = NextResponse.json(
      { user: { id, email: data.email, name: data.name, role: "customer" } },
      { status: 201 }
    );
    response.cookies.set(AUTH_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
