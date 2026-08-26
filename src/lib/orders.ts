import getDb from "./db";
import { v4 as uuidv4 } from "uuid";
import { getMalaysiaDateString } from "./dates";
import { getIcedSurchargeCents } from "./env";
import { canTransition, isOrderStatus, type OrderStatus } from "./order-status";
import { normaliseToppings, serialiseToppings, toppingsPriceCents } from "./toppings";
import { sql, transaction, type Queryable } from "./sql";

export interface CartItem {
  menuItemId: string;
  quantity: number;
  sugarLevel?: string;
  temperature?: "hot" | "iced";
  remark?: string;
  toppings?: string[];
}

export interface OrderRow {
  id: string;
  user_id: string;
  order_number: number;
  order_date: string;
  status: OrderStatus;
  total_cents: number;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  qr_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string;
  name: string;
  price_cents: number;
  quantity: number;
  sugar_level: string | null;
  temperature: string | null;
  remark: string | null;
  /** JSON array of topping ids, or null. Read it with parseToppings(). */
  toppings: string | null;
}

export type OrderWithItems = OrderRow & { items: OrderItemRow[] };

/** Explicit column lists keep the API response decoupled from the schema. */
const ORDER_COLUMNS = `
  id, user_id, order_number, order_date, status, total_cents,
  stripe_session_id, stripe_payment_intent, qr_token, created_at, updated_at
`;

const ORDER_ITEM_COLUMNS = `
  id, order_id, menu_item_id, name, price_cents, quantity,
  sugar_level, temperature, remark, toppings
`;

/** Thrown for conditions the caller should surface to the user verbatim. */
export class OrderError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = "OrderError";
  }
}

/**
 * libSQL returns INTEGER columns as JavaScript numbers, but a bigint when the
 * value exceeds the safe range. Money and counts are read through here so a
 * comparison never silently comes out false against a bigint.
 */
function num(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : (value as number);
}

function normaliseOrder(row: OrderRow): OrderRow {
  return {
    ...row,
    order_number: num(row.order_number),
    total_cents: num(row.total_cents),
  };
}

function normaliseItem(row: OrderItemRow): OrderItemRow {
  return { ...row, price_cents: num(row.price_cents), quantity: num(row.quantity) };
}

/** Next order number for today. Call inside a transaction. */
async function nextOrderNumber(db: Queryable, today: string): Promise<number> {
  const result = await db.one<{ max_num: number | null }>(
    "SELECT MAX(order_number) as max_num FROM orders WHERE order_date = ?",
    [today]
  );
  return num(result?.max_num ?? 0) + 1;
}

export async function getNextOrderNumber(): Promise<number> {
  await getDb();
  return nextOrderNumber(sql, getMalaysiaDateString());
}

export async function createOrder(userId: string, items: CartItem[]): Promise<OrderRow> {
  await getDb();
  const icedSurcharge = getIcedSurchargeCents();

  const menuItemIds = [...new Set(items.map((i) => i.menuItemId))];
  const placeholders = menuItemIds.map(() => "?").join(",");
  const menuItems = await sql.all<{
    id: string;
    name: string;
    price_cents: number;
    available: number;
  }>(
    `SELECT id, name, price_cents, available FROM menu_items WHERE id IN (${placeholders})`,
    menuItemIds
  );

  if (menuItems.length !== menuItemIds.length) {
    throw new OrderError("One or more menu items are no longer on the menu");
  }

  const unavailable = menuItems.filter((m) => !num(m.available));
  if (unavailable.length > 0) {
    throw new OrderError(`Sold out: ${unavailable.map((m) => m.name).join(", ")}`);
  }

  const byId = new Map(menuItems.map((m) => [m.id, m]));

  // Prices always come from the database, never from the client.
  let totalCents = 0;
  const orderItems = items.map((cartItem) => {
    const menuItem = byId.get(cartItem.menuItemId)!;
    // Unknown or duplicated toppings are discarded here, so a client cannot
    // charge itself less by sending nonsense or more by sending repeats.
    const toppings = normaliseToppings(cartItem.toppings);
    const unitPrice =
      num(menuItem.price_cents) +
      (cartItem.temperature === "iced" ? icedSurcharge : 0) +
      toppingsPriceCents(toppings);
    totalCents += unitPrice * cartItem.quantity;
    return {
      id: uuidv4(),
      menuItemId: menuItem.id,
      name: menuItem.name,
      unitPrice,
      quantity: cartItem.quantity,
      sugarLevel: cartItem.sugarLevel ?? null,
      temperature: cartItem.temperature ?? null,
      remark: cartItem.remark ?? null,
      toppings: serialiseToppings(toppings),
    };
  });

  const orderId = uuidv4();
  const qrToken = uuidv4();
  const today = getMalaysiaDateString();

  // The order number is allocated inside the transaction so two concurrent
  // checkouts cannot be handed the same number for the day.
  await transaction(async (tx) => {
    const orderNumber = await nextOrderNumber(tx, today);
    await tx.run(
      `INSERT INTO orders (id, user_id, order_number, order_date, status, total_cents, qr_token)
       VALUES (?, ?, ?, ?, 'pending_payment', ?, ?)`,
      [orderId, userId, orderNumber, today, totalCents, qrToken]
    );
    for (const item of orderItems) {
      await tx.run(
        `INSERT INTO order_items
           (id, order_id, menu_item_id, name, price_cents, quantity, sugar_level, temperature, remark, toppings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          orderId,
          item.menuItemId,
          item.name,
          item.unitPrice,
          item.quantity,
          item.sugarLevel,
          item.temperature,
          item.remark,
          item.toppings,
        ]
      );
    }
  });

  return (await getOrder(orderId))!;
}

export async function getOrder(orderId: string): Promise<OrderRow | null> {
  await getDb();
  const row = await sql.one<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`,
    [orderId]
  );
  return row ? normaliseOrder(row) : null;
}

export async function getOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
  const order = await getOrder(orderId);
  if (!order) return null;

  const items = await sql.all<OrderItemRow>(
    `SELECT ${ORDER_ITEM_COLUMNS} FROM order_items WHERE order_id = ?`,
    [orderId]
  );

  return { ...order, items: items.map(normaliseItem) };
}

export async function getOrderByQrToken(qrToken: string): Promise<OrderWithItems | null> {
  await getDb();
  const order = await sql.one<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE qr_token = ?`,
    [qrToken]
  );
  if (!order) return null;
  return getOrderWithItems(order.id);
}

/**
 * Loads orders plus their items in two queries regardless of how many orders
 * come back, instead of one query per order.
 */
async function attachItems<T extends OrderRow>(
  orders: T[]
): Promise<Array<T & { items: OrderItemRow[] }>> {
  if (orders.length === 0) return [];
  const placeholders = orders.map(() => "?").join(",");
  const allItems = await sql.all<OrderItemRow>(
    `SELECT ${ORDER_ITEM_COLUMNS} FROM order_items WHERE order_id IN (${placeholders})`,
    orders.map((o) => o.id)
  );

  const grouped = new Map<string, OrderItemRow[]>();
  for (const raw of allItems) {
    const item = normaliseItem(raw);
    const bucket = grouped.get(item.order_id);
    if (bucket) bucket.push(item);
    else grouped.set(item.order_id, [item]);
  }

  return orders.map((order) => ({ ...order, items: grouped.get(order.id) ?? [] }));
}

export async function getUserOrders(
  userId: string,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<OrderWithItems[]> {
  await getDb();
  const orders = await sql.all<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE user_id = ?
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
  return attachItems(orders.map(normaliseOrder));
}

export interface AdminOrderFilters {
  status?: OrderStatus;
  date?: string;
  limit?: number;
  offset?: number;
}

export async function getAllOrders({
  status,
  date,
  limit = 50,
  offset = 0,
}: AdminOrderFilters = {}) {
  await getDb();

  const where: string[] = [];
  const params: Array<string | number> = [];
  if (status) {
    where.push("o.status = ?");
    params.push(status);
  }
  if (date) {
    where.push("o.order_date = ?");
    params.push(date);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Customer details come from a join rather than a lookup per order.
  // The page of orders and the unpaginated count are independent, so they go
  // out together. The dashboard polls this every few seconds, and each query
  // is a round trip to the database.
  const [rows, totalRow] = await Promise.all([
    sql.all<OrderRow & { customer_name: string; customer_email: string }>(
      `SELECT o.id, o.user_id, o.order_number, o.order_date, o.status, o.total_cents,
              o.stripe_session_id, o.stripe_payment_intent, o.qr_token,
              o.created_at, o.updated_at,
              COALESCE(u.name, 'Unknown') AS customer_name,
              COALESCE(u.email, '')       AS customer_email
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ),
    sql.one<{ count: number }>(
      `SELECT COUNT(*) as count FROM orders o ${whereClause}`,
      params
    ),
  ]);

  const orders = await attachItems(
    rows.map((r) => ({ ...normaliseOrder(r), customer_name: r.customer_name, customer_email: r.customer_email }))
  );

  return { orders, total: num(totalRow?.count ?? 0) };
}

/** Points earned by an order: 1 point per whole RM spent. */
function pointsForOrder(order: OrderRow): number {
  return Math.floor(order.total_cents / 100);
}

/**
 * Applies a points change through the ledger. The UNIQUE (order_id, reason)
 * constraint makes each award or reversal happen at most once, so a replayed
 * Stripe webhook cannot double-credit an account.
 */
async function applyPoints(
  tx: Queryable,
  order: OrderRow,
  delta: number,
  reason: string
): Promise<void> {
  if (delta === 0) return;

  const inserted = await tx.run(
    `INSERT OR IGNORE INTO points_ledger (id, user_id, order_id, delta, reason)
     VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), order.user_id, order.id, delta, reason]
  );

  if (inserted === 0) return; // already applied

  // Balances are never allowed to go negative.
  await tx.run("UPDATE users SET points = MAX(0, COALESCE(points, 0) + ?) WHERE id = ?", [
    delta,
    order.user_id,
  ]);
}

/**
 * Moves an order to a new status, enforcing the state machine and keeping
 * loyalty points in step. Returns the updated order.
 */
export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<OrderRow> {
  if (!isOrderStatus(status)) {
    throw new OrderError("Invalid status");
  }

  await getDb();

  await transaction(async (tx) => {
    const row = await tx.one<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`, [
      orderId,
    ]);
    if (!row) throw new OrderError("Order not found", 404);
    const order = normaliseOrder(row);

    if (order.status === status) return;

    if (!canTransition(order.status, status)) {
      throw new OrderError(`Cannot move an order from ${order.status} to ${status}`);
    }

    if (status === "paid") {
      await applyPoints(tx, order, pointsForOrder(order), "earned");
    }

    if (status === "cancelled") {
      // Claw back anything already earned on this order.
      const earned = await tx.one<{ total: number }>(
        "SELECT COALESCE(SUM(delta), 0) as total FROM points_ledger WHERE order_id = ?",
        [orderId]
      );
      const total = num(earned?.total ?? 0);
      if (total > 0) {
        await applyPoints(tx, order, -total, "cancelled");
      }
    }

    await tx.run("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [
      status,
      orderId,
    ]);
  });

  return (await getOrder(orderId))!;
}

export async function updateOrderStripeSession(
  orderId: string,
  sessionId: string
): Promise<void> {
  await getDb();
  await sql.run(
    "UPDATE orders SET stripe_session_id = ?, updated_at = datetime('now') WHERE id = ?",
    [sessionId, orderId]
  );
}

/** Marks an order paid from a verified Stripe webhook. Idempotent. */
export async function markOrderPaid(orderId: string, paymentIntent: string): Promise<void> {
  await getDb();

  await transaction(async (tx) => {
    const row = await tx.one<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`, [
      orderId,
    ]);
    if (!row) return;
    const order = normaliseOrder(row);

    await tx.run(
      "UPDATE orders SET stripe_payment_intent = ?, updated_at = datetime('now') WHERE id = ?",
      [paymentIntent, orderId]
    );

    if (order.status !== "pending_payment") return;

    await applyPoints(tx, order, pointsForOrder(order), "earned");
    await tx.run(
      "UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ?",
      [orderId]
    );
  });
}

export async function getOrderByStripeSession(sessionId: string): Promise<OrderRow | null> {
  await getDb();
  const row = await sql.one<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE stripe_session_id = ?`,
    [sessionId]
  );
  return row ? normaliseOrder(row) : null;
}
