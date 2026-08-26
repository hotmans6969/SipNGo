import { NextResponse } from "next/server";
import { sql, describeConnection } from "@/lib/sql";
import { isPushConfigured } from "@/lib/push";

/**
 * Reports whether the app can reach its database.
 *
 * Every route that touches data returns a deliberately generic 500, which is
 * right for customers and useless for diagnosing a deployment. This says which
 * connection was configured and whether it answers, without ever revealing the
 * URL's credentials or the auth token.
 */
export async function GET() {
  const connection = describeConnection();

  // Push needs both halves of the VAPID pair. Reporting them separately turns
  // "notifications do not work" into a specific missing variable, without
  // ever revealing the private key itself.
  const push = {
    publicKey: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey: !!process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT || null,
    enabled: isPushConfigured(),
  };
  const configured = {
    databaseUrl: !!process.env.DATABASE_URL,
    databaseAuthToken: !!process.env.DATABASE_AUTH_TOKEN,
    mode: connection.mode,
    host: connection.host,
  };

  try {
    const row = await sql.one<{ ok: number }>("SELECT 1 as ok");
    const migrations = await sql.one<{ count: number }>(
      "SELECT COUNT(*) as count FROM schema_migrations"
    );
    const menu = await sql.one<{ count: number }>("SELECT COUNT(*) as count FROM menu_items");

    return NextResponse.json({
      status: "ok",
      push,
      database: {
        ...configured,
        reachable: row?.ok === 1,
        migrationsApplied: Number(migrations?.count ?? 0),
        menuItems: Number(menu?.count ?? 0),
      },
    });
  } catch (error) {
    // The message names the misconfiguration (a missing token, an unreachable
    // host) without carrying the token itself.
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Health check failed:", error);

    return NextResponse.json(
      { status: "error", push, database: { ...configured, reachable: false }, error: message },
      { status: 503 }
    );
  }
}
