import getDb from "./db";
import { sql } from "./sql";
import { getMalaysiaDateString } from "./dates";
import { parseToppings, formatToppings } from "./toppings";

/**
 * Sales reporting for the counter.
 *
 * Revenue counts orders that were actually paid and not voided. An order
 * sitting at `pending_payment` was never paid for, and a `cancelled` one was
 * refunded or written off — counting either would overstate takings, which is
 * the one thing a sales figure must not do.
 */
const EARNING_STATUSES = ["paid", "preparing", "ready", "picked_up"] as const;

export type SalesPeriod = "today" | "week" | "month";

/** Rolling windows, in days back from today inclusive. */
const PERIOD_DAYS: Record<SalesPeriod, number> = {
  today: 1,
  week: 7,
  month: 30,
};

export interface DailyTotal {
  date: string;
  totalCents: number;
  orderCount: number;
}

export interface TopItem {
  name: string;
  quantity: number;
  revenueCents: number;
}

export interface SalesSummary {
  period: SalesPeriod;
  from: string;
  to: string;
  totalCents: number;
  orderCount: number;
  averageOrderCents: number;
  itemsSold: number;
  byDay: DailyTotal[];
  topItems: TopItem[];
  topToppings: TopItem[];
}

function num(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

/** Business dates run on Malaysia time, matching how orders are numbered. */
function windowFor(period: SalesPeriod): { from: string; to: string } {
  const to = getMalaysiaDateString();
  const days = PERIOD_DAYS[period];
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return { from: getMalaysiaDateString(start), to };
}

export async function getSalesSummary(period: SalesPeriod): Promise<SalesSummary> {
  await getDb();
  const { from, to } = windowFor(period);
  const statuses = EARNING_STATUSES.map(() => "?").join(",");
  const range = [from, to, ...EARNING_STATUSES];

  // Issued together: each is a round trip, and none depends on another.
  const [totals, byDayRows, topItemRows, toppingRows] = await Promise.all([
    sql.one<{ total: number; orders: number }>(
      `SELECT COALESCE(SUM(total_cents), 0) AS total, COUNT(*) AS orders
         FROM orders
        WHERE order_date BETWEEN ? AND ? AND status IN (${statuses})`,
      range
    ),
    sql.all<{ date: string; total: number; orders: number }>(
      `SELECT order_date AS date, COALESCE(SUM(total_cents), 0) AS total, COUNT(*) AS orders
         FROM orders
        WHERE order_date BETWEEN ? AND ? AND status IN (${statuses})
        GROUP BY order_date
        ORDER BY order_date`,
      range
    ),
    sql.all<{ name: string; quantity: number; revenue: number }>(
      `SELECT oi.name AS name,
              SUM(oi.quantity) AS quantity,
              SUM(oi.quantity * oi.price_cents) AS revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.order_date BETWEEN ? AND ? AND o.status IN (${statuses})
        GROUP BY oi.name
        ORDER BY quantity DESC
        LIMIT 8`,
      range
    ),
    // Toppings live as JSON on the line, so they are counted in application
    // code rather than SQL. The row count here is small — one per sold line.
    sql.all<{ toppings: string | null; quantity: number }>(
      `SELECT oi.toppings AS toppings, oi.quantity AS quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.order_date BETWEEN ? AND ? AND o.status IN (${statuses})
          AND oi.toppings IS NOT NULL`,
      range
    ),
  ]);

  const totalCents = num(totals?.total);
  const orderCount = num(totals?.orders);

  const byDay = byDayRows.map((r) => ({
    date: r.date,
    totalCents: num(r.total),
    orderCount: num(r.orders),
  }));

  const topItems = topItemRows.map((r) => ({
    name: r.name,
    quantity: num(r.quantity),
    revenueCents: num(r.revenue),
  }));

  const toppingCounts = new Map<string, number>();
  for (const row of toppingRows) {
    const quantity = num(row.quantity);
    for (const id of parseToppings(row.toppings)) {
      toppingCounts.set(id, (toppingCounts.get(id) ?? 0) + quantity);
    }
  }
  const topToppings: TopItem[] = [...toppingCounts.entries()]
    .map(([id, quantity]) => ({
      name: formatToppings([id]),
      quantity,
      // Every topping is the same price today, so revenue is derivable.
      revenueCents: quantity * 200,
    }))
    .sort((a, b) => b.quantity - a.quantity);

  return {
    period,
    from,
    to,
    totalCents,
    orderCount,
    averageOrderCents: orderCount ? Math.round(totalCents / orderCount) : 0,
    itemsSold: topItems.reduce((sum, i) => sum + i.quantity, 0),
    byDay,
    topItems,
    topToppings,
  };
}
