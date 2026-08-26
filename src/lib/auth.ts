import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import getDb, { getOrCreateConfigValue } from "./db";
import { getConfiguredJwtSecret, isProduction } from "./env";
import { sql } from "./sql";

export const AUTH_COOKIE = "auth_token";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface UserPayload {
  id: string;
  email: string;
  name: string;
  role: "customer" | "admin" | "staff";
}

/**
 * The key used to sign sessions.
 *
 * JWT_SECRET is preferred, because it survives the database being recreated
 * and can be shared across instances. When it is absent the app generates a
 * random key for this installation and stores it, rather than falling back to
 * a constant baked into the source — that constant was readable by anyone with
 * the repository and let them mint their own admin sessions.
 */
async function sessionSecret(): Promise<string> {
  const configured = getConfiguredJwtSecret();
  if (configured) return configured;
  return getOrCreateConfigValue("jwt_secret", () =>
    crypto.randomBytes(48).toString("base64url")
  );
}

export async function signToken(user: UserPayload): Promise<string> {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    await sessionSecret(),
    { expiresIn: "7d" }
  );
}

export async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    return jwt.verify(token, await sessionSecret()) as UserPayload;
  } catch {
    return null;
  }
}

/** Cookie options shared by login, register, and logout so they can't drift. */
export function sessionCookieOptions(maxAge: number = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

export async function getCurrentUser(): Promise<UserPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireAuth(): Promise<UserPayload> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireAdmin(): Promise<UserPayload> {
  const user = await requireAuth();
  if (user.role !== "admin" && user.role !== "staff") {
    throw new Error("Forbidden");
  }
  return user;
}

export async function getUserFromDb(id: string) {
  await getDb();
  const row = await sql.one<UserPayload & { created_at: string; points: number }>(
    "SELECT id, email, name, role, points, created_at FROM users WHERE id = ?",
    [id]
  );
  if (!row) return undefined;
  // libSQL can hand back a bigint for INTEGER columns.
  return { ...row, points: Number(row.points ?? 0) };
}
