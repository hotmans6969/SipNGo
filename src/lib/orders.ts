import getDb from "./db";
import { v4 as uuidv4 } from "uuid";
import { getMalaysiaDateString } from "./dates";

export interface CartItem {
  menuItemId: string;
  quantity: number;
}

export interface OrderRow {
  id: string;
  user_id: string;
  order_number: number;
  order_date: string;
  status: string;
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
}

export function getNextOrderNumber(): number {
  const db = getDb();
  const today = getMalaysiaDateString();
  const result = db
    .prepare("SELECT MAX(order_number) as max_num FROM orders WHERE order_date = ?")
    .get(today) as { max_num: number | null } | undefined;
  return (result?.max_num || 0) + 1;
}

export function createOrder(userId: string, items: CartItem[]): OrderRow {
  const db = getDb();
  const orderId = uuidv4();
  const qrToken = uuidv4();
  const orderNumber = getNextOrderNumber();
  const today = getMalaysiaDateString();

  // Fetch menu items and validate
  const menuItemIds = items.map((i) => i.menuItemId);
  const placeholders = menuItemIds.map(() => "?").join(",");
  const menuItems = db
    .prepare(`SELECT id, name, price_cents, available FROM menu_items WHERE id IN (${placeholders})`)
    .all(...menuItemIds) as Array<{ id: string; name: string; price_cents: number; available: number }>;

  if (menuItems.length !== menuItemIds.length) {
    throw new Error("One or more menu items not found");
  }

  const unavailable = menuItems.filter((m) => !m.available);
  if (unavailable.length > 0) {
    throw new Error(`Unavailable items: ${unavailable.map((m) => m.name).join(", ")}`);
  }

  // Calculate total
  let totalCents = 0;
  const orderItems: Array<{ id: string; menuItem: (typeof menuItems)[0]; quantity: number }> = [];
  for (const cartItem of items) {
    const menuItem = menuItems.find((m) => m.id === cartItem.menuItemId);
    if (!menuItem) throw new Error(`Menu item ${cartItem.menuItemId} not found`);
    totalCents += menuItem.price_cents * cartItem.quantity;
    orderItems.push({ id: uuidv4(), menuItem, quantity: cartItem.quantity });
  }

  // Insert order and items in a transaction
  const insertOrder = db.prepare(`
    INSERT INTO orders (id, user_id, order_number, order_date, status, total_cents, qr_token)
    VALUES (?, ?, ?, ?, 'pending_payment', ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO order_items (id, order_id, menu_item_id, name, price_cents, quantity)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertOrder.run(orderId, userId, orderNumber, today, totalCents, qrToken);
    for (const item of orderItems) {
      insertItem.run(item.id, orderId, item.menuItem.id, item.menuItem.name, item.menuItem.price_cents, item.quantity);
    }
  });

  transaction();

  return db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow;
}

export function getOrderWithItems(orderId: string) {
  const db = getDb();
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow | undefined;
  if (!order) return null;

  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId) as OrderItemRow[];

  return { ...order, items };
}

export function getOrderByQrToken(qrToken: string) {
  const db = getDb();
  const order = db.prepare("SELECT * FROM orders WHERE qr_token = ?").get(qrToken) as OrderRow | undefined;
  if (!order) return null;

  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id) as OrderItemRow[];

  return { ...order, items };
}

export function getUserOrders(userId: string) {
  const db = getDb();
  const orders = db
    .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as OrderRow[];

  return orders.map((order) => {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id) as OrderItemRow[];
    return { ...order, items };
  });
}

export function updateOrderStatus(orderId: string, status: string): OrderRow | null {
  const db = getDb();
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, orderId);
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow | null;
}

export function updateOrderStripeSession(orderId: string, sessionId: string): void {
  const db = getDb();
  db.prepare("UPDATE orders SET stripe_session_id = ?, updated_at = datetime('now') WHERE id = ?").run(
    sessionId,
    orderId
  );
}

export function updateOrderPaymentIntent(orderId: string, paymentIntent: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE orders SET stripe_payment_intent = ?, status = 'paid', updated_at = datetime('now') WHERE id = ?"
  ).run(paymentIntent, orderId);
}

export function getOrderByStripeSession(sessionId: string): OrderRow | null {
  const db = getDb();
  return db.prepare("SELECT * FROM orders WHERE stripe_session_id = ?").get(sessionId) as OrderRow | null;
}

export function getAllOrders(status?: string) {
  const db = getDb();
  let orders: OrderRow[];
  if (status) {
    orders = db
      .prepare("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC")
      .all(status) as OrderRow[];
  } else {
    orders = db
      .prepare("SELECT * FROM orders ORDER BY created_at DESC")
      .all() as OrderRow[];
  }

  return orders.map((order) => {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id) as OrderItemRow[];
    const user = db.prepare("SELECT name, email FROM users WHERE id = ?").get(order.user_id) as
      | { name: string; email: string }
      | undefined;
    return { ...order, items, customer_name: user?.name || "Unknown", customer_email: user?.email || "" };
  });
}
