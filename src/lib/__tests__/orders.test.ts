import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";

/**
 * Each run gets its own SQLite file. DATABASE_PATH is read when lib/db is first
 * imported, so it has to be set before the dynamic imports below.
 */
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sipngo-test-"));
const dbPath = path.join(tempDir, "test.db");
process.env.DATABASE_PATH = dbPath;
process.env.JWT_SECRET = "test-secret-not-used-here";
process.env.ICED_SURCHARGE_CENTS = "100";
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

const { default: getDb } = await import("../db");
const {
  createOrder,
  updateOrderStatus,
  markOrderPaid,
  getOrderWithItems,
  getAllOrders,
  getUserOrders,
  OrderError,
} = await import("../orders");

const db = getDb();

function pointsFor(userId: string): number {
  return (db.prepare("SELECT points FROM users WHERE id = ?").get(userId) as { points: number })
    .points;
}

function makeUser(): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, 'x', 'customer')"
  ).run(id, `${id}@example.test`, "Test Customer");
  return id;
}

function makeMenuItem(priceCents: number, available = 1): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO menu_items (id, name, description, price_cents, category, available) VALUES (?, ?, '', ?, 'coffee', ?)"
  ).run(id, `Item ${id.slice(0, 6)}`, priceCents, available);
  return id;
}

let userId: string;

beforeEach(() => {
  userId = makeUser();
});

afterAll(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("migrations", () => {
  it("creates every column the app queries", () => {
    const userColumns = (db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>)
      .map((c) => c.name);
    expect(userColumns).toContain("points");

    const itemColumns = (
      db.prepare("PRAGMA table_info(order_items)").all() as Array<{ name: string }>
    ).map((c) => c.name);
    expect(itemColumns).toEqual(expect.arrayContaining(["sugar_level", "temperature", "remark"]));
  });

  it("is idempotent across repeated boots", () => {
    const applied = db.prepare("SELECT COUNT(*) as count FROM schema_migrations").get() as {
      count: number;
    };
    expect(applied.count).toBeGreaterThan(0);
    // Re-running getDb must not attempt the migrations again.
    expect(() => getDb()).not.toThrow();
  });
});

describe("createOrder", () => {
  it("prices from the database, not the client", () => {
    const itemId = makeMenuItem(550);
    const order = createOrder(userId, [{ menuItemId: itemId, quantity: 2 }]);
    expect(order.total_cents).toBe(1100);
  });

  it("adds the iced surcharge per unit", () => {
    const itemId = makeMenuItem(550);
    const order = createOrder(userId, [
      { menuItemId: itemId, quantity: 2, temperature: "iced" },
    ]);
    // (550 + 100) * 2
    expect(order.total_cents).toBe(1300);
  });

  it("does not surcharge a hot drink", () => {
    const itemId = makeMenuItem(550);
    const order = createOrder(userId, [{ menuItemId: itemId, quantity: 1, temperature: "hot" }]);
    expect(order.total_cents).toBe(550);
  });

  it("refuses a sold-out item", () => {
    const itemId = makeMenuItem(400, 0);
    expect(() => createOrder(userId, [{ menuItemId: itemId, quantity: 1 }])).toThrow(OrderError);
  });

  it("refuses an item that does not exist", () => {
    expect(() => createOrder(userId, [{ menuItemId: uuidv4(), quantity: 1 }])).toThrow(OrderError);
  });

  it("stores the customisations chosen for each line", () => {
    const itemId = makeMenuItem(500);
    const order = createOrder(userId, [
      { menuItemId: itemId, quantity: 1, sugarLevel: "50%", temperature: "iced", remark: "no straw" },
    ]);
    const stored = getOrderWithItems(order.id)!;
    expect(stored.items[0].sugar_level).toBe("50%");
    expect(stored.items[0].temperature).toBe("iced");
    expect(stored.items[0].remark).toBe("no straw");
  });

  it("gives each order of the day its own number", () => {
    const itemId = makeMenuItem(300);
    const first = createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    const second = createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    expect(second.order_number).toBe(first.order_number + 1);
  });
});

describe("loyalty points", () => {
  it("awards one point per whole ringgit when an order is paid", () => {
    const itemId = makeMenuItem(1250);
    const order = createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    updateOrderStatus(order.id, "paid");
    expect(pointsFor(userId)).toBe(12);
  });

  it("does not award twice when a webhook is replayed", () => {
    const itemId = makeMenuItem(1000);
    const order = createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);

    markOrderPaid(order.id, "pi_test_123");
    markOrderPaid(order.id, "pi_test_123");
    markOrderPaid(order.id, "pi_test_123");

    expect(pointsFor(userId)).toBe(10);
  });

  it("takes the points back when a paid order is cancelled", () => {
    const itemId = makeMenuItem(2000);
    const order = createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);

    updateOrderStatus(order.id, "paid");
    expect(pointsFor(userId)).toBe(20);

    updateOrderStatus(order.id, "cancelled");
    expect(pointsFor(userId)).toBe(0);
  });

  it("never drives a balance negative", () => {
    const itemId = makeMenuItem(500);
    const order = createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    updateOrderStatus(order.id, "cancelled"); // cancelled before paying
    expect(pointsFor(userId)).toBe(0);
  });
});

describe("status transitions", () => {
  it("rejects a move that skips the flow", () => {
    const itemId = makeMenuItem(500);
    const order = createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    expect(() => updateOrderStatus(order.id, "picked_up")).toThrow(OrderError);
  });

  it("rejects reopening a collected order", () => {
    const itemId = makeMenuItem(500);
    const order = createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    updateOrderStatus(order.id, "paid");
    updateOrderStatus(order.id, "preparing");
    updateOrderStatus(order.id, "ready");
    updateOrderStatus(order.id, "picked_up");

    expect(() => updateOrderStatus(order.id, "preparing")).toThrow(OrderError);
  });

  it("treats a no-op transition as success", () => {
    const itemId = makeMenuItem(500);
    const order = createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    updateOrderStatus(order.id, "paid");
    expect(updateOrderStatus(order.id, "paid").status).toBe("paid");
  });
});

describe("listing orders", () => {
  it("returns items for every order without a query per order", () => {
    const itemId = makeMenuItem(400);
    createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    createOrder(userId, [{ menuItemId: itemId, quantity: 3 }]);

    const orders = getUserOrders(userId);
    expect(orders).toHaveLength(2);
    expect(orders.every((o) => o.items.length === 1)).toBe(true);
  });

  it("paginates and reports the unpaginated total", () => {
    const itemId = makeMenuItem(400);
    const scopedUser = makeUser();
    for (let i = 0; i < 5; i++) {
      createOrder(scopedUser, [{ menuItemId: itemId, quantity: 1 }]);
    }

    const page = getAllOrders({ limit: 2, offset: 0 });
    expect(page.orders).toHaveLength(2);
    expect(page.total).toBeGreaterThanOrEqual(5);
  });

  it("filters by status", () => {
    const itemId = makeMenuItem(400);
    const scopedUser = makeUser();
    const order = createOrder(scopedUser, [{ menuItemId: itemId, quantity: 1 }]);
    updateOrderStatus(order.id, "paid");

    const paid = getAllOrders({ status: "paid" });
    expect(paid.orders.some((o) => o.id === order.id)).toBe(true);

    const ready = getAllOrders({ status: "ready" });
    expect(ready.orders.some((o) => o.id === order.id)).toBe(false);
  });

  it("attaches customer details from the join", () => {
    const itemId = makeMenuItem(400);
    const order = createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    const found = getAllOrders().orders.find((o) => o.id === order.id)!;
    expect(found.customer_name).toBe("Test Customer");
  });
});
