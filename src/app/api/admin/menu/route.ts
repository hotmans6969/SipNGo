import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getCurrentUser } from "@/lib/auth";
import getDb from "@/lib/db";
import { MENU_COLUMNS, DRINK_CATEGORIES } from "@/lib/menu";
import { parseBody, createMenuItemSchema } from "@/lib/validation";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "staff")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const db = getDb();
    const placeholders = DRINK_CATEGORIES.map(() => "?").join(",");
    const items = db
      .prepare(
        `SELECT ${MENU_COLUMNS} FROM menu_items
          WHERE category IN (${placeholders})
          ORDER BY category, name`
      )
      .all(...DRINK_CATEGORIES);

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Admin menu fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await parseBody(request, createMenuItemSchema);
    if (error) return error;

    const db = getDb();
    const id = uuidv4();
    db.prepare(
      `INSERT INTO menu_items (id, name, description, price_cents, category, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, data.name, data.description ?? "", data.priceCents, data.category, data.imageUrl ?? "");

    const item = db.prepare(`SELECT ${MENU_COLUMNS} FROM menu_items WHERE id = ?`).get(id);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Admin add menu item error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
