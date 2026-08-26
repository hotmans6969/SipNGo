import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import getDb from "@/lib/db";
import { sql } from "@/lib/sql";
import { MENU_COLUMNS } from "@/lib/menu";
import { parseBody, updateMenuItemSchema } from "@/lib/validation";

/** Maps validated request fields to their database columns. */
const COLUMN_FOR_FIELD = {
  name: "name",
  description: "description",
  priceCents: "price_cents",
  category: "category",
  imageUrl: "image_url",
  available: "available",
} as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { data, error } = await parseBody(request, updateMenuItemSchema);
    if (error) return error;

    await getDb();
    const existing = await sql.one("SELECT id FROM menu_items WHERE id = ?", [id]);
    if (!existing) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }

    const assignments: string[] = [];
    const values: Array<string | number> = [];
    for (const [field, column] of Object.entries(COLUMN_FOR_FIELD)) {
      const value = data[field as keyof typeof data];
      if (value === undefined) continue;
      assignments.push(`${column} = ?`);
      values.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
    }

    values.push(id);
    await sql.run(`UPDATE menu_items SET ${assignments.join(", ")} WHERE id = ?`, values);

    const item = await sql.one(`SELECT ${MENU_COLUMNS} FROM menu_items WHERE id = ?`, [id]);
    return NextResponse.json({ item });
  } catch (error) {
    console.error("Admin update menu item error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await getDb();

    const existing = await sql.one("SELECT id FROM menu_items WHERE id = ?", [id]);
    if (!existing) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }

    // Deleting an item referenced by past orders would break order history,
    // so a sold item is retired by marking it unavailable instead.
    const referenced = await sql.one(
      "SELECT 1 as present FROM order_items WHERE menu_item_id = ? LIMIT 1",
      [id]
    );

    if (referenced) {
      await sql.run("UPDATE menu_items SET available = 0 WHERE id = ?", [id]);
      return NextResponse.json({
        success: true,
        retired: true,
        message: "This item appears in past orders, so it was hidden from the menu instead of deleted.",
      });
    }

    await sql.run("DELETE FROM menu_items WHERE id = ?", [id]);
    return NextResponse.json({ success: true, retired: false });
  } catch (error) {
    console.error("Admin delete menu item error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
