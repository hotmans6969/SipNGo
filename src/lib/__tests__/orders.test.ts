import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";

/**
 * Each run gets its own local database file. DATABASE_PATH is read when
 * lib/sql is first imported, so it has to be set before the dynamic imports
 * below. libSQL talks to a `file:` URL exactly as it talks to Turso, so these
 * exercise the same code path production uses.
 */
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sipngo-test-"));
const dbPath = path.join(tempDir, "test.db");
process.env.DATABASE_PATH = dbPath;
delete process.env.DATABASE_URL;
process.env.JWT_SECRET = "test-secret-not-used-here-but-long-enough";
process.env.ICED_SURCHARGE_CENTS = "100";
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

const { default: getDb } = await import("../db");
const { sql, closeClient } = await import("../sql");
const {
  createOrder,
  updateOrderStatus,
  markOrderPaid,
  getOrderWithItems,
  getAllOrders,
  getUserOrders,
  OrderError,
} = await import("../orders");

await getDb();

async function pointsFor(userId: string): Promise<number> {
  const row = await sql.one<{ points: number }>("SELECT points FROM users WHERE id = ?", [
    userId,
  ]);
  return Number(row!.points);
}

async function makeUser(): Promise<string> {
  const id = uuidv4();
  await sql.run(
    "INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, 'x', 'customer')",
    [id, `${id}@example.test`, "Test Customer"]
  );
  return id;
}

async function makeMenuItem(priceCents: number, available = 1): Promise<string> {
  const id = uuidv4();
  await sql.run(
    "INSERT INTO menu_items (id, name, description, price_cents, category, available) VALUES (?, ?, '', ?, 'coffee', ?)",
    [id, `Item ${id.slice(0, 6)}`, priceCents, available]
  );
  return id;
}

let userId: string;

beforeEach(async () => {
  userId = await makeUser();
});

afterAll(async () => {
  await closeClient();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file; the OS can reap it.
  }
});

describe("migrations", () => {
  it("creates every column the app queries", async () => {
    const userColumns = (await sql.all<{ name: string }>("PRAGMA table_info(users)")).map(
      (c) => c.name
    );
    expect(userColumns).toContain("points");

    const itemColumns = (
      await sql.all<{ name: string }>("PRAGMA table_info(order_items)")
    ).map((c) => c.name);
    expect(itemColumns).toEqual(
      expect.arrayContaining(["sugar_level", "temperature", "remark"])
    );
  });

  it("is idempotent across repeated boots", async () => {
    const applied = await sql.one<{ count: number }>(
      "SELECT COUNT(*) as count FROM schema_migrations"
    );
    expect(Number(applied!.count)).toBeGreaterThan(0);
    await expect(getDb()).resolves.toBeDefined();
  });
});

describe("createOrder", () => {
  it("prices from the database, not the client", async () => {
    const itemId = await makeMenuItem(550);
    const order = await createOrder(userId, [{ menuItemId: itemId, quantity: 2 }]);
    expect(order.total_cents).toBe(1100);
  });

  it("adds the iced surcharge per unit", async () => {
    const itemId = await makeMenuItem(550);
    const order = await createOrder(userId, [
      { menuItemId: itemId, quantity: 2, temperature: "iced" },
    ]);
    // (550 + 100) * 2
    expect(order.total_cents).toBe(1300);
  });

  it("does not surcharge a hot drink", async () => {
    const itemId = await makeMenuItem(550);
    const order = await createOrder(userId, [
      { menuItemId: itemId, quantity: 1, temperature: "hot" },
    ]);
    expect(order.total_cents).toBe(550);
  });

  it("refuses a sold-out item", async () => {
    const itemId = await makeMenuItem(400, 0);
    await expect(createOrder(userId, [{ menuItemId: itemId, quantity: 1 }])).rejects.toThrow(
      OrderError
    );
  });

  it("refuses an item that does not exist", async () => {
    await expect(createOrder(userId, [{ menuItemId: uuidv4(), quantity: 1 }])).rejects.toThrow(
      OrderError
    );
  });

  it("stores the customisations chosen for each line", async () => {
    const itemId = await makeMenuItem(500);
    const order = await createOrder(userId, [
      {
        menuItemId: itemId,
        quantity: 1,
        sugarLevel: "50%",
        temperature: "iced",
        remark: "no straw",
      },
    ]);
    const stored = (await getOrderWithItems(order.id))!;
    expect(stored.items[0].sugar_level).toBe("50%");
    expect(stored.items[0].temperature).toBe("iced");
    expect(stored.items[0].remark).toBe("no straw");
  });

  it("gives each order of the day its own number", async () => {
    const itemId = await makeMenuItem(300);
    const first = await createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    const second = await createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    expect(second.order_number).toBe(first.order_number + 1);
  });
});

describe("loyalty points", () => {
  it("awards one point per whole ringgit when an order is paid", async () => {
    const itemId = await makeMenuItem(1250);
    const order = await createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    await updateOrderStatus(order.id, "paid");
    expect(await pointsFor(userId)).toBe(12);
  });

  it("does not award twice when a webhook is replayed", async () => {
    const itemId = await makeMenuItem(1000);
    const order = await createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);

    await markOrderPaid(order.id, "pi_test_123");
    await markOrderPaid(order.id, "pi_test_123");
    await markOrderPaid(order.id, "pi_test_123");

    expect(await pointsFor(userId)).toBe(10);
  });

  it("takes the points back when a paid order is cancelled", async () => {
    const itemId = await makeMenuItem(2000);
    const order = await createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);

    await updateOrderStatus(order.id, "paid");
    expect(await pointsFor(userId)).toBe(20);

    await updateOrderStatus(order.id, "cancelled");
    expect(await pointsFor(userId)).toBe(0);
  });

  it("never drives a balance negative", async () => {
    const itemId = await makeMenuItem(500);
    const order = await createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    await updateOrderStatus(order.id, "cancelled"); // cancelled before paying
    expect(await pointsFor(userId)).toBe(0);
  });
});

describe("status transitions", () => {
  it("rejects a move that skips the flow", async () => {
    const itemId = await makeMenuItem(500);
    const order = await createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    await expect(updateOrderStatus(order.id, "picked_up")).rejects.toThrow(OrderError);
  });

  it("rejects reopening a collected order", async () => {
    const itemId = await makeMenuItem(500);
    const order = await createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    await updateOrderStatus(order.id, "paid");
    await updateOrderStatus(order.id, "preparing");
    await updateOrderStatus(order.id, "ready");
    await updateOrderStatus(order.id, "picked_up");

    await expect(updateOrderStatus(order.id, "preparing")).rejects.toThrow(OrderError);
  });

  it("treats a no-op transition as success", async () => {
    const itemId = await makeMenuItem(500);
    const order = await createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    await updateOrderStatus(order.id, "paid");
    expect((await updateOrderStatus(order.id, "paid")).status).toBe("paid");
  });

  it("rolls the transaction back when a transition is rejected", async () => {
    // A failed transition must leave no partial ledger entry behind.
    const itemId = await makeMenuItem(500);
    const order = await createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    await expect(updateOrderStatus(order.id, "ready")).rejects.toThrow(OrderError);

    const ledger = await sql.one<{ count: number }>(
      "SELECT COUNT(*) as count FROM points_ledger WHERE order_id = ?",
      [order.id]
    );
    expect(Number(ledger!.count)).toBe(0);
    expect((await getOrderWithItems(order.id))!.status).toBe("pending_payment");
  });
});

describe("listing orders", () => {
  it("returns items for every order without a query per order", async () => {
    const itemId = await makeMenuItem(400);
    await createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    await createOrder(userId, [{ menuItemId: itemId, quantity: 3 }]);

    const orders = await getUserOrders(userId);
    expect(orders).toHaveLength(2);
    expect(orders.every((o) => o.items.length === 1)).toBe(true);
  });

  it("paginates and reports the unpaginated total", async () => {
    const itemId = await makeMenuItem(400);
    const scopedUser = await makeUser();
    for (let i = 0; i < 5; i++) {
      await createOrder(scopedUser, [{ menuItemId: itemId, quantity: 1 }]);
    }

    const page = await getAllOrders({ limit: 2, offset: 0 });
    expect(page.orders).toHaveLength(2);
    expect(page.total).toBeGreaterThanOrEqual(5);
  });

  it("filters by status", async () => {
    const itemId = await makeMenuItem(400);
    const scopedUser = await makeUser();
    const order = await createOrder(scopedUser, [{ menuItemId: itemId, quantity: 1 }]);
    await updateOrderStatus(order.id, "paid");

    const paid = await getAllOrders({ status: "paid" });
    expect(paid.orders.some((o) => o.id === order.id)).toBe(true);

    const ready = await getAllOrders({ status: "ready" });
    expect(ready.orders.some((o) => o.id === order.id)).toBe(false);
  });

  it("attaches customer details from the join", async () => {
    const itemId = await makeMenuItem(400);
    const order = await createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    const found = (await getAllOrders()).orders.find((o) => o.id === order.id)!;
    expect(found.customer_name).toBe("Test Customer");
  });

  it("returns money as numbers, not bigints", async () => {
    // libSQL can hand back INTEGER columns as bigint, which breaks arithmetic
    // and strict comparisons downstream.
    const itemId = await makeMenuItem(400);
    const order = await createOrder(userId, [{ menuItemId: itemId, quantity: 2 }]);
    const fetched = (await getOrderWithItems(order.id))!;
    expect(typeof fetched.total_cents).toBe("number");
    expect(typeof fetched.order_number).toBe("number");
    expect(typeof fetched.items[0].price_cents).toBe("number");
    expect(typeof fetched.items[0].quantity).toBe("number");
  });
});
