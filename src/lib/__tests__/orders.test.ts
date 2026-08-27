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
const { getSalesSummary } = await import("../sales");
const { grantSignupVoucher, redeemPoints, getUsableVouchers, VoucherError } = await import(
  "../vouchers"
);
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

  it("charges RM 2.00 per topping on top of the drink", async () => {
    const itemId = await makeMenuItem(550);
    const order = await createOrder(userId, [
      { menuItemId: itemId, quantity: 1, toppings: ["boba", "pudding"] },
    ]);
    // 550 + (2 x 200)
    expect(order.total_cents).toBe(950);
  });

  it("stacks toppings with the iced surcharge, per unit", async () => {
    const itemId = await makeMenuItem(550);
    const order = await createOrder(userId, [
      { menuItemId: itemId, quantity: 2, temperature: "iced", toppings: ["boba"] },
    ]);
    // (550 + 100 iced + 200 topping) x 2
    expect(order.total_cents).toBe(1700);
  });

  it("ignores toppings that are not on the menu", async () => {
    // Pricing is computed server-side, so an invented topping earns nothing.
    const itemId = await makeMenuItem(500);
    const order = await createOrder(userId, [
      { menuItemId: itemId, quantity: 1, toppings: ["boba", "gold_leaf"] },
    ]);
    expect(order.total_cents).toBe(700);
  });

  it("charges a repeated topping once", async () => {
    const itemId = await makeMenuItem(500);
    const order = await createOrder(userId, [
      { menuItemId: itemId, quantity: 1, toppings: ["boba", "boba", "boba"] },
    ]);
    expect(order.total_cents).toBe(700);
  });

  it("records which toppings were chosen", async () => {
    const itemId = await makeMenuItem(500);
    const order = await createOrder(userId, [
      { menuItemId: itemId, quantity: 1, toppings: ["pudding", "boba"] },
    ]);
    const stored = (await getOrderWithItems(order.id))!;
    // Stored in menu order, so two identical drinks always look identical.
    expect(JSON.parse(stored.items[0].toppings!)).toEqual(["boba", "pudding"]);
  });

  it("stores nothing when no toppings were chosen", async () => {
    const itemId = await makeMenuItem(500);
    const order = await createOrder(userId, [{ menuItemId: itemId, quantity: 1 }]);
    const stored = (await getOrderWithItems(order.id))!;
    expect(stored.items[0].toppings).toBeNull();
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

describe("vouchers", () => {
  it("can only be spent once, even across two orders", async () => {
    const scopedUser = await makeUser();
    await grantSignupVoucher(sql, scopedUser);
    const [voucher] = await getUsableVouchers(scopedUser);
    const itemId = await makeMenuItem(600);

    const first = await createOrder(scopedUser, [{ menuItemId: itemId, quantity: 1 }], voucher.id);
    expect(first.total_cents).toBe(0);
    expect(first.discount_cents).toBe(600);

    // The second attempt must be refused rather than discounting again.
    await expect(
      createOrder(scopedUser, [{ menuItemId: itemId, quantity: 1 }], voucher.id)
    ).rejects.toThrow(VoucherError);
  });

  it("belongs to one customer only", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    await grantSignupVoucher(sql, owner);
    const [voucher] = await getUsableVouchers(owner);
    const itemId = await makeMenuItem(500);

    await expect(
      createOrder(stranger, [{ menuItemId: itemId, quantity: 1 }], voucher.id)
    ).rejects.toThrow(VoucherError);
  });

  it("frees the cheapest drink, not the dearest", async () => {
    const scopedUser = await makeUser();
    await grantSignupVoucher(sql, scopedUser);
    const [voucher] = await getUsableVouchers(scopedUser);
    const cheap = await makeMenuItem(400);
    const dear = await makeMenuItem(900);

    const order = await createOrder(
      scopedUser,
      [
        { menuItemId: cheap, quantity: 1 },
        { menuItemId: dear, quantity: 1 },
      ],
      voucher.id
    );
    expect(order.discount_cents).toBe(400);
    expect(order.total_cents).toBe(900);
  });

  it("comes back when the order is cancelled", async () => {
    const scopedUser = await makeUser();
    await grantSignupVoucher(sql, scopedUser);
    const [voucher] = await getUsableVouchers(scopedUser);
    const itemId = await makeMenuItem(500);

    const order = await createOrder(scopedUser, [{ menuItemId: itemId, quantity: 1 }], voucher.id);
    expect(await getUsableVouchers(scopedUser)).toHaveLength(0);

    // The customer never got the drink, so they keep the reward.
    await updateOrderStatus(order.id, "cancelled");
    const back = await getUsableVouchers(scopedUser);
    expect(back).toHaveLength(1);
    expect(back[0].id).toBe(voucher.id);
  });

  it("awards points on what was actually paid, not the pre-discount total", async () => {
    const scopedUser = await makeUser();
    await grantSignupVoucher(sql, scopedUser);
    const [voucher] = await getUsableVouchers(scopedUser);
    const itemId = await makeMenuItem(1000);

    const order = await createOrder(scopedUser, [{ menuItemId: itemId, quantity: 2 }], voucher.id);
    // 2000 subtotal, one drink free: 1000 paid, so 10 points not 20.
    expect(order.total_cents).toBe(1000);
    await updateOrderStatus(order.id, "paid");
    expect(await pointsFor(scopedUser)).toBe(10);
  });
});

describe("redeeming points", () => {
  it("refuses when the balance is short", async () => {
    const scopedUser = await makeUser();
    await expect(redeemPoints(scopedUser, "off5")).rejects.toThrow(/Not enough points/);
  });

  it("deducts the cost and issues the voucher", async () => {
    const scopedUser = await makeUser();
    await sql.run("UPDATE users SET points = 250 WHERE id = ?", [scopedUser]);

    const voucher = await redeemPoints(scopedUser, "off5");
    expect(voucher.discount_cents).toBe(500);
    expect(await pointsFor(scopedUser)).toBe(150);
  });

  it("cannot be overdrawn", async () => {
    const scopedUser = await makeUser();
    await sql.run("UPDATE users SET points = 100 WHERE id = ?", [scopedUser]);

    // Exactly enough for one. The balance check lives in the UPDATE's WHERE
    // clause, so the second attempt matches no row and is refused rather than
    // driving the balance negative.
    //
    // Run one after the other rather than at once: two simultaneous write
    // transactions cannot be issued over a single local connection, so true
    // concurrency here is the database's guarantee to keep, not something
    // this suite can exercise.
    await expect(redeemPoints(scopedUser, "off5")).resolves.toBeDefined();
    await expect(redeemPoints(scopedUser, "off5")).rejects.toThrow(/Not enough points/);
    expect(await pointsFor(scopedUser)).toBe(0);
  });

  it("rejects a reward that does not exist", async () => {
    const scopedUser = await makeUser();
    await expect(redeemPoints(scopedUser, "free_everything")).rejects.toThrow(VoucherError);
  });
});

describe("sales reporting", () => {
  it("counts only orders that were actually paid for", async () => {
    const scopedUser = await makeUser();
    const itemId = await makeMenuItem(1000);

    const before = (await getSalesSummary("today")).totalCents;

    // Paid and being made: real takings.
    const paid = await createOrder(scopedUser, [{ menuItemId: itemId, quantity: 1 }]);
    await updateOrderStatus(paid.id, "paid");

    // Never paid for: must not count.
    await createOrder(scopedUser, [{ menuItemId: itemId, quantity: 1 }]);

    // Paid then refunded: must not count either.
    const refunded = await createOrder(scopedUser, [{ menuItemId: itemId, quantity: 1 }]);
    await updateOrderStatus(refunded.id, "paid");
    await updateOrderStatus(refunded.id, "cancelled");

    const after = await getSalesSummary("today");
    expect(after.totalCents - before).toBe(1000);
  });

  it("keeps counting an order through to collection", async () => {
    const scopedUser = await makeUser();
    const itemId = await makeMenuItem(500);
    const before = (await getSalesSummary("today")).totalCents;

    const order = await createOrder(scopedUser, [{ menuItemId: itemId, quantity: 1 }]);
    for (const status of ["paid", "preparing", "ready", "picked_up"] as const) {
      await updateOrderStatus(order.id, status);
    }

    expect((await getSalesSummary("today")).totalCents - before).toBe(500);
  });

  it("averages across paid orders only", async () => {
    const summary = await getSalesSummary("today");
    if (summary.orderCount > 0) {
      expect(summary.averageOrderCents).toBe(
        Math.round(summary.totalCents / summary.orderCount)
      );
    }
  });

  it("reports what sold, including toppings", async () => {
    const scopedUser = await makeUser();
    const itemId = await makeMenuItem(400);
    const order = await createOrder(scopedUser, [
      { menuItemId: itemId, quantity: 3, toppings: ["boba"] },
    ]);
    await updateOrderStatus(order.id, "paid");

    const summary = await getSalesSummary("today");
    expect(summary.itemsSold).toBeGreaterThanOrEqual(3);
    // Three drinks each carrying boba is three portions of boba to prep.
    const boba = summary.topToppings.find((t) => t.name === "Boba");
    expect(boba?.quantity).toBeGreaterThanOrEqual(3);
  });

  it("widens the window for longer periods", async () => {
    const today = await getSalesSummary("today");
    const month = await getSalesSummary("month");
    expect(today.from).toBe(today.to);
    expect(month.from < month.to).toBe(true);
    expect(month.totalCents).toBeGreaterThanOrEqual(today.totalCents);
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
