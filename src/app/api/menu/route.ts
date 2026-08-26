import { NextResponse } from "next/server";
import getDb from "@/lib/db";
import { sql } from "@/lib/sql";
import { MENU_COLUMNS, DRINK_CATEGORIES } from "@/lib/menu";

export async function GET() {
  try {
    await getDb();
    const placeholders = DRINK_CATEGORIES.map(() => "?").join(",");
    const items = await sql.all(
      `SELECT ${MENU_COLUMNS} FROM menu_items
        WHERE available = 1 AND category IN (${placeholders})
        ORDER BY category, name`,
      [...DRINK_CATEGORIES]
    );

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Menu fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
