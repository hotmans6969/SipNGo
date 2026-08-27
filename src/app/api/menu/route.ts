import { NextResponse } from "next/server";
import getDb from "@/lib/db";
import { sql } from "@/lib/sql";
import { getMalaysiaDateString } from "@/lib/dates";
import { SOLD_STATUSES } from "@/lib/order-status";
import {
  MENU_COLUMNS_QUALIFIED,
  DRINK_CATEGORIES,
  POPULAR_COUNT,
  POPULARITY_WINDOW_DAYS,
  toCount,
} from "@/lib/menu";

interface MenuRow {
  id: string;
  sold: unknown;
}

/**
 * The drinks menu, best sellers first.
 *
 * Ranking happens here rather than in the browser because the sales figures it
 * needs are not something a customer's client should be handed. Anything that
 * has not sold inside the window scores zero and falls back to the previous
 * ordering, so a shop with no orders yet still gets a sensible menu.
 */
export async function GET() {
  try {
    await getDb();

    const categories = DRINK_CATEGORIES.map(() => "?").join(",");
    const statuses = SOLD_STATUSES.map(() => "?").join(",");

    const since = new Date();
    since.setDate(since.getDate() - (POPULARITY_WINDOW_DAYS - 1));

    const rows = await sql.all<MenuRow>(
      `SELECT ${MENU_COLUMNS_QUALIFIED}, COALESCE(s.sold, 0) AS sold
         FROM menu_items m
         LEFT JOIN (
           SELECT oi.menu_item_id AS menu_item_id, SUM(oi.quantity) AS sold
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
            WHERE o.order_date >= ? AND o.status IN (${statuses})
            GROUP BY oi.menu_item_id
         ) s ON s.menu_item_id = m.id
        WHERE m.available = 1 AND m.category IN (${categories})
        ORDER BY sold DESC, m.category, m.name`,
      [getMalaysiaDateString(since), ...SOLD_STATUSES, ...DRINK_CATEGORIES]
    );

    // Only a drink somebody actually bought earns the badge. Without this a
    // brand new shop would label its first three alphabetically.
    const items = rows.map((row, index) => {
      const sold = toCount(row.sold);
      return { ...row, sold, popular: index < POPULAR_COUNT && sold > 0 };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Menu fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
