import { NextResponse } from "next/server";
import getDb from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const items = db
      .prepare("SELECT * FROM menu_items WHERE available = 1 AND category NOT IN ('food', 'pastries') ORDER BY category, name")
      .all();

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Menu fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
