import getDb from "./db";
import { v4 as uuidv4 } from "uuid";
import { getMalaysiaDateString } from "./dates";
import { getIcedSurchargeCents } from "./env";
import { canTransition, isOrderStatus, type OrderStatus } from "./order-status";

export interface CartItem {
  menuItemId: string;
  quantity: number;
  sugarLevel?: string;
  temperature?: "hot" | "iced";
  remark?: string;
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
}

export type OrderWithItems = OrderRow & { items: OrderItemRow[] };

/** Explicit column lists keep the API response decoupled from the schema. */
const ORDER_COLUMNS = `
  id, user_id, order_number, order_date, status, total_cents,
  stripe_session_id, stripe_payment_intent, qr_token, created_at, updated_at
`;

const ORDER_ITEM_COLUMNS = `
  id, order_id, menu_item_id, name, price_cents, quantity,
  sugar_level, temperature, remark
`;

/** Thrown for conditions the caller should surface to the user verbatim. */
export class OrderError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = "OrderError";
  }
}

export function getNextOrderNumber(): number {
  const db = getDb();
  const today = getMalaysiaDateString();
  const result = db
    .prepare("SELECT MAX(order_number) as max_num FROM orders WHERE order_date = ?")
    .get(today) as { max_num: number | null } | undefined;
  return (result?.max_num ?? 0) + 1;
}

export function createOrder(userId: string, items: CartItem[]): OrderRow {
  const db = getDb();
  const icedSurcharge = getIcedSurchargeCents();

  const menuItemIds = [...new Set(items.map((i) => i.menuItemId))];
  const placeholders = menuItemIds.map(() => "?").join(",");
  const menuItems = db
    .prepare(
      `SELECT id, name, price_cents, available FROM menu_items WHERE id IN (${placeholders})`
    )
    .all(...menuItemIds) as Array<{
    id: string;
    name: string;
    price_cents: number;
    available: number;
  }>;

  if (menuItems.length !== menuItemIds.length) {
    throw new OrderError("One or more menu items are no longer on the menu");
  }

  const unavailable = menuItems.filter((m) => !m.available);
  if (unavailable.length > 0) {
    throw new OrderError(`Sold out: ${unavailable.map((m) => m.name).join(", ")}`);
  }

  const byId = new Map(menuItems.map((m) => [m.id, m]));

  // Prices always come from the database, never from the client.
  let totalCents = 0;
  const orderItems = items.map((cartItem) => {
    const menuItem = byId.get(cartItem.menuItemId)!;
    const unitPrice =
      menuItem.price_cents + (cartItem.temperature === "iced" ? icedSurcharge : 0);
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
    };
  });

  const orderId = uuidv4();
  const qrToken = uuidv4();

  const insertOrder = db.prepare(`
    INSERT INTO orders (id, user_id, order_number, order_date, status, total_cents, qr_token)
    VALUES (?, ?, ?, ?, 'pending_payment', ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items
      (id, order_id, menu_item_id, name, price_cents, quantity, sugar_level, temperature, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // The order number is allocated inside the transaction so two concurrent
  // checkouts cannot be handed the same number for the day.
  const create = db.transaction(() => {
    const orderNumber = getNextOrderNumber();
    const today = getMalaysiaDateString();
    insertOrder.run(orderId, userId, orderNumber, today, totalCents, qrToken);
    for (const item of orderItems) {
      insertItem.run(
        item.id,
        orderId,
        item.menuItemId,
        item.name,
        item.unitPrice,
        item.quantity,
        item.sugarLevel,
        item.temperature,
        item.remark
      );
    }
  });
  create();

  return getOrder(orderId)!;
}

export function getOrder(orderId: string): OrderRow | null {
  const db = getDb();
  return (
    (db.prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`).get(orderId) as
      | OrderRow
      | undefined) ?? null
  );
}

export function getOrderWithItems(orderId: string): OrderWithItems | null {
  const db = getDb();
  const order = getOrder(orderId);
  if (!order) return null;

  const items = db
    .prepare(`SELECT ${ORDER_ITEM_COLUMNS} FROM order_items WHERE order_id = ?`)
    .all(orderId) as OrderItemRow[];

  return { ...order, items };
}

export function getOrderByQrToken(qrToken: string): OrderWithItems | null {
  const db = getDb();
  const order = db
    .prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE qr_token = ?`)
    .get(qrToken) as OrderRow | undefined;
  if (!order) return null;
  return getOrderWithItems(order.id);
}

/**
 * Loads orders plus their items in two queries regardless of how many orders
 * come back, instead of one query per order.
 */
function attachItems<T extends OrderRow>(orders: T[]): Array<T & { items: OrderItemRow[] }> {
  if (orders.length === 0) return [];
  const db = getDb();
  const placeholders = orders.map(() => "?").join(",");
  const allItems = db
    .prepare(
      `SELECT ${ORDER_ITEM_COLUMNS} FROM order_items WHERE order_id IN (${placeholders})`
    )
    .all(...orders.map((o) => o.id)) as OrderItemRow[];

  const grouped = new Map<string, OrderItemRow[]>();
  for (const item of allItems) {
    const bucket = grouped.get(item.order_id);
    if (bucket) bucket.push(item);
    else grouped.set(item.order_id, [item]);
  }

  return orders.map((order) => ({ ...order, items: grouped.get(order.id) ?? [] }));
}

export function getUserOrders(
  userId: string,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}
): OrderWithItems[] {
  const db = getDb();
  const orders = db
    .prepare(
      `SELECT ${ORDER_COLUMNS} FROM orders WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(userId, limit, offset) as OrderRow[];
  return attachItems(orders);
}

export interface AdminOrderFilters {
  status?: OrderStatus;
  date?: string;
  limit?: number;
  offset?: number;
}

export function getAllOrders({ status, date, limit = 50, offset = 0 }: AdminOrderFilters = {}) {
  const db = getDb();

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
  const orders = db
    .prepare(
      `SELECT o.id, o.user_id, o.order_number, o.order_date, o.status, o.total_cents,
              o.stripe_session_id, o.stripe_payment_intent, o.qr_token,
              o.created_at, o.updated_at,
              COALESCE(u.name, 'Unknown') AS customer_name,
              COALESCE(u.email, '')       AS customer_email
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Array<
    OrderRow & { customer_name: string; customer_email: string }
  >;

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM orders o ${whereClause}`).get(...params) as {
      count: number;
    }
  ).count;

  return { orders: attachItems(orders), total };
}

/** Points earned by an order: 1 point per whole RM spent. */
function pointsForOrder(order: OrderRow): number {
  return Math.floor(order.total_cents / 100);
}

/**
 * Applies a points change through the ledger. The UNIQUE (order_id, reason)
 * constraint makes each award or reversal happen at most once, so a replayed
 * Stripe webhook cannot double-credit an account.
 *
 * Must be called inside a transaction.
 */
function applyPoints(order: OrderRow, delta: number, reason: string): void {
  if (delta === 0) return;
  const db = getDb();
  const inserted = db
    .prepare(
      `INSERT OR IGNORE INTO points_ledger (id, user_id, order_id, delta, reason)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(uuidv4(), order.user_id, order.id, delta, reason);

  if (inserted.changes === 0) return; // already applied

  // Balances are never allowed to go negative.
  db.prepare("UPDATE users SET points = MAX(0, COALESCE(points, 0) + ?) WHERE id = ?").run(
    delta,
    order.user_id
  );
}

/**
 * Moves an order to a new status, enforcing the state machine and keeping
 * loyalty points in step. Returns the updated order.
 */
export function updateOrderStatus(orderId: string, status: OrderStatus): OrderRow {
  if (!isOrderStatus(status)) {
    throw new OrderError("Invalid status");
  }

  const db = getDb();

  const run = db.transaction(() => {
    const order = getOrder(orderId);
    if (!order) throw new OrderError("Order not found", 404);

    if (order.status === status) return order;

    if (!canTransition(order.status, status)) {
      throw new OrderError(`Cannot move an order from ${order.status} to ${status}`);
    }

    if (status === "paid") {
      applyPoints(order, pointsForOrder(order), "earned");
    }

    if (status === "cancelled") {
      // Claw back anything already earned on this order.
      const earned = db
        .prepare(
          "SELECT COALESCE(SUM(delta), 0) as total FROM points_ledger WHERE order_id = ?"
        )
        .get(orderId) as { total: number };
      if (earned.total > 0) {
        applyPoints(order, -earned.total, "cancelled");
      }
    }

    db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
      status,
      orderId
    );

    return getOrder(orderId)!;
  });

  return run();
}

export function updateOrderStripeSession(orderId: string, sessionId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE orders SET stripe_session_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(sessionId, orderId);
}

/** Marks an order paid from a verified Stripe webhook. Idempotent. */
export function markOrderPaid(orderId: string, paymentIntent: string): void {
  const db = getDb();
  const run = db.transaction(() => {
    const order = getOrder(orderId);
    if (!order) return;

    db.prepare(
      "UPDATE orders SET stripe_payment_intent = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(paymentIntent, orderId);

    if (order.status !== "pending_payment") return;

    applyPoints(order, pointsForOrder(order), "earned");
    db.prepare("UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ?").run(
      orderId
    );
  });
  run();
}

export function getOrderByStripeSession(sessionId: string): OrderRow | null {
  const db = getDb();
  return (
    (db
      .prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE stripe_session_id = ?`)
      .get(sessionId) as OrderRow | undefined) ?? null
  );
}
