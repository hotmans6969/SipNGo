import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import getDb from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "sipngo-secret-key-change-in-production-2024";

export interface UserPayload {
  id: string;
  email: string;
  name: string;
  role: "customer" | "admin" | "staff";
}

export function signToken(user: UserPayload): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): UserPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
    return decoded;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<UserPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
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

export function getUserFromDb(id: string) {
  const db = getDb();
  return db.prepare("SELECT id, email, name, role, points, created_at FROM users WHERE id = ?").get(id) as
    | (UserPayload & { created_at: string; points: number })
    | undefined;
}
