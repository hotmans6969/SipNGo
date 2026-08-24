import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getCurrentUser } from "@/lib/auth";
import getDb from "@/lib/db";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "staff")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const db = getDb();
    const items = db.prepare("SELECT * FROM menu_items WHERE category NOT IN ('food', 'pastries') ORDER BY category, name").all();
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

    const { name, description, priceCents, category } = await request.json();

    if (!name || !priceCents || !category) {
      return NextResponse.json({ error: "Name, price, and category are required" }, { status: 400 });
    }

    const db = getDb();
    const id = uuidv4();
    db.prepare(
      "INSERT INTO menu_items (id, name, description, price_cents, category) VALUES (?, ?, ?, ?, ?)"
    ).run(id, name, description || "", priceCents, category);

    const item = db.prepare("SELECT * FROM menu_items WHERE id = ?").get(id);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Admin add menu item error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
