import { NextResponse } from "next/server";
import { sql, describeConnection } from "@/lib/sql";

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
      { status: "error", database: { ...configured, reachable: false }, error: message },
      { status: 503 }
    );
  }
}
