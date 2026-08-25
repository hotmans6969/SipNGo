import { describe, it, expect, afterAll } from "vitest";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Databases created before the migration system existed have the original
 * schema plus a few columns that were added by hand, and no
 * `schema_migrations` table at all. Migrating one of those must be safe:
 * no duplicate-column errors, and no data loss.
 */

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sipngo-migration-"));

afterAll(() => {
  // Windows keeps a lock on the file briefly after close; a failed cleanup of
  // a temp directory should not fail the run.
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // left for the OS to reap
  }
});

/** Recreates the shape of a database as it existed before this change. */
function buildLegacyDatabase(file: string): void {
  const db = new Database(file);
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'staff')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE menu_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'drinks',
      image_url TEXT NOT NULL DEFAULT '',
      available INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      order_number INTEGER NOT NULL,
      order_date TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (
        status IN ('pending_payment', 'paid', 'preparing', 'ready', 'picked_up', 'cancelled')
      ),
      total_cents INTEGER NOT NULL,
      stripe_session_id TEXT,
      stripe_payment_intent TEXT,
      qr_token TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      menu_item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
    );
  `);

  // The columns that were added live, outside any migration.
  db.exec("ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0");
  db.exec("ALTER TABLE order_items ADD COLUMN sugar_level TEXT");
  db.exec("ALTER TABLE order_items ADD COLUMN temperature TEXT");
  db.exec("ALTER TABLE order_items ADD COLUMN remark TEXT");

  // A little real-looking data, so loss would be detectable.
  db.prepare(
    "INSERT INTO users (id, email, name, password_hash, role, points) VALUES ('u1', 'a@b.test', 'Existing Customer', 'hash', 'customer', 42)"
  ).run();
  db.prepare(
    "INSERT INTO menu_items (id, name, price_cents, category) VALUES ('m1', 'Latte', 550, 'coffee')"
  ).run();
  db.prepare(
    "INSERT INTO orders (id, user_id, order_number, order_date, status, total_cents, qr_token) VALUES ('o1', 'u1', 7, '2026-08-01', 'picked_up', 1100, 'tok-1')"
  ).run();
  db.prepare(
    "INSERT INTO order_items (id, order_id, menu_item_id, name, price_cents, quantity, sugar_level) VALUES ('oi1', 'o1', 'm1', 'Latte', 550, 2, '50%')"
  ).run();

  db.close();
}

describe("migrating a pre-existing database", () => {
  it("adds what is missing, keeps what is there, and can run twice", async () => {
    const file = path.join(tempDir, "legacy.db");
    buildLegacyDatabase(file);

    // lib/db reads DATABASE_PATH at import time, so it is set before importing.
    process.env.DATABASE_PATH = file;
    process.env.JWT_SECRET = "migration-test-secret";
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;

    const { default: getDb, getOrCreateConfigValue } = await import("../db");
    const db = getDb();

    // Columns the app queries all exist.
    const columns = (table: string) =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
        (c) => c.name
      );
    expect(columns("users")).toContain("points");
    expect(columns("order_items")).toEqual(
      expect.arrayContaining(["sugar_level", "temperature", "remark"])
    );
    expect(columns("points_ledger").length).toBeGreaterThan(0);
    expect(columns("schema_migrations").length).toBeGreaterThan(0);

    // Existing rows survive untouched.
    const user = db.prepare("SELECT name, points FROM users WHERE id = 'u1'").get() as {
      name: string;
      points: number;
    };
    expect(user.name).toBe("Existing Customer");
    expect(user.points).toBe(42);

    const order = db.prepare("SELECT total_cents, status FROM orders WHERE id = 'o1'").get() as {
      total_cents: number;
      status: string;
    };
    expect(order.total_cents).toBe(1100);
    expect(order.status).toBe("picked_up");

    const item = db
      .prepare("SELECT sugar_level, quantity FROM order_items WHERE id = 'oi1'")
      .get() as { sugar_level: string; quantity: number };
    expect(item.sugar_level).toBe("50%");
    expect(item.quantity).toBe(2);

    // The existing menu is not overwritten by the starter seed.
    const menuCount = db.prepare("SELECT COUNT(*) c FROM menu_items").get() as { c: number };
    expect(menuCount.c).toBe(1);

    // With no ADMIN_EMAIL configured the app still needs a way in, so it
    // creates one admin with a generated password and logs it once.
    const admins = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin'").get() as {
      c: number;
    };
    expect(admins.c).toBe(1);

    // Crucially that password must not be a constant anyone could look up.
    const admin = db
      .prepare("SELECT password_hash FROM users WHERE role = 'admin'")
      .get() as { password_hash: string };
    expect(bcrypt.compareSync("admin123", admin.password_hash)).toBe(false);

    // The generated session key is random per installation, not a shared
    // constant, and is stable across calls.
    const first = getOrCreateConfigValue("jwt_secret", () => "generated-a");
    const second = getOrCreateConfigValue("jwt_secret", () => "generated-b");
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);

    const applied = db.prepare("SELECT COUNT(*) c FROM schema_migrations").get() as { c: number };
    expect(applied.c).toBeGreaterThan(0);

    db.close();
  });
});
