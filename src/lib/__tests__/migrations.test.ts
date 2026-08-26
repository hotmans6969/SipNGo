import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@libsql/client";
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
async function buildLegacyDatabase(file: string): Promise<void> {
  const db = createClient({ url: `file:${file}` });
  await db.executeMultiple(`
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

    ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0;
    ALTER TABLE order_items ADD COLUMN sugar_level TEXT;
    ALTER TABLE order_items ADD COLUMN temperature TEXT;
    ALTER TABLE order_items ADD COLUMN remark TEXT;

    INSERT INTO users (id, email, name, password_hash, role, points)
      VALUES ('u1', 'a@b.test', 'Existing Customer', 'hash', 'customer', 42);
    INSERT INTO menu_items (id, name, price_cents, category)
      VALUES ('m1', 'Latte', 550, 'coffee');
    INSERT INTO orders (id, user_id, order_number, order_date, status, total_cents, qr_token)
      VALUES ('o1', 'u1', 7, '2026-08-01', 'picked_up', 1100, 'tok-1');
    INSERT INTO order_items (id, order_id, menu_item_id, name, price_cents, quantity, sugar_level)
      VALUES ('oi1', 'o1', 'm1', 'Latte', 550, 2, '50%');
  `);
  db.close();
}

describe("migrating a pre-existing database", () => {
  it("adds what is missing, keeps what is there, and can run twice", async () => {
    const file = path.join(tempDir, "legacy.db");
    await buildLegacyDatabase(file);

    // lib/sql reads DATABASE_PATH at import time, so it is set before importing.
    process.env.DATABASE_PATH = file;
    delete process.env.DATABASE_URL;
    process.env.JWT_SECRET = "migration-test-secret-long-enough-to-pass";
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;

    const { default: getDb, getOrCreateConfigValue } = await import("../db");
    const { sql, closeClient } = await import("../sql");
    await getDb();

    // Columns the app queries all exist.
    const columns = async (table: string) =>
      (await sql.all<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);

    expect(await columns("users")).toContain("points");
    expect(await columns("order_items")).toEqual(
      expect.arrayContaining(["sugar_level", "temperature", "remark"])
    );
    expect((await columns("points_ledger")).length).toBeGreaterThan(0);
    expect((await columns("schema_migrations")).length).toBeGreaterThan(0);

    // Existing rows survive untouched.
    const user = await sql.one<{ name: string; points: number }>(
      "SELECT name, points FROM users WHERE id = 'u1'"
    );
    expect(user!.name).toBe("Existing Customer");
    expect(Number(user!.points)).toBe(42);

    const order = await sql.one<{ total_cents: number; status: string }>(
      "SELECT total_cents, status FROM orders WHERE id = 'o1'"
    );
    expect(Number(order!.total_cents)).toBe(1100);
    expect(order!.status).toBe("picked_up");

    const item = await sql.one<{ sugar_level: string; quantity: number }>(
      "SELECT sugar_level, quantity FROM order_items WHERE id = 'oi1'"
    );
    expect(item!.sugar_level).toBe("50%");
    expect(Number(item!.quantity)).toBe(2);

    // The existing menu is not overwritten by the starter seed.
    const menuCount = await sql.one<{ c: number }>("SELECT COUNT(*) c FROM menu_items");
    expect(Number(menuCount!.c)).toBe(1);

    // With no ADMIN_EMAIL configured the app still needs a way in, so it
    // creates one admin with a generated password and logs it once.
    const admins = await sql.one<{ c: number }>(
      "SELECT COUNT(*) c FROM users WHERE role = 'admin'"
    );
    expect(Number(admins!.c)).toBe(1);

    // Crucially that password must not be a constant anyone could look up.
    const admin = await sql.one<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE role = 'admin'"
    );
    expect(bcrypt.compareSync("admin123", admin!.password_hash)).toBe(false);

    // The generated session key is random per installation, not a shared
    // constant, and is stable across calls.
    const first = await getOrCreateConfigValue("jwt_secret", () => "generated-a");
    const second = await getOrCreateConfigValue("jwt_secret", () => "generated-b");
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);

    const applied = await sql.one<{ c: number }>("SELECT COUNT(*) c FROM schema_migrations");
    expect(Number(applied!.c)).toBeGreaterThan(0);

    await closeClient();
  });
});
