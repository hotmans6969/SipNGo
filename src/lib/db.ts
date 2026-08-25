import Database from "better-sqlite3";
import path from "path";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { getAdminSeed } from "./env";
import { seedMenuIfEmpty } from "./seed-menu";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "sipngo.db");

let db: Database.Database | undefined;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
    seedAdmin(db);
    seedMenuIfEmpty(db);
  }
  return db;
}

/** True if `table` already has `column`. Used to keep ALTERs idempotent. */
function hasColumn(database: Database.Database, table: string, column: string): boolean {
  const columns = database
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return columns.some((c) => c.name === column);
}

function addColumnIfMissing(
  database: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  if (!hasColumn(database, table, column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Ordered, append-only migrations. Each runs at most once, tracked in the
 * `schema_migrations` table. Never edit a migration that has shipped — add a
 * new one instead.
 *
 * Migrations that add columns are written defensively, because databases
 * created before this system existed already have some of those columns.
 */
const MIGRATIONS: Array<{ version: number; name: string; up: (d: Database.Database) => void }> = [
  {
    version: 1,
    name: "base_schema",
    up: (d) => {
      d.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'staff')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS menu_items (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          price_cents INTEGER NOT NULL,
          category TEXT NOT NULL DEFAULT 'drinks',
          image_url TEXT NOT NULL DEFAULT '',
          available INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS orders (
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

        CREATE TABLE IF NOT EXISTS order_items (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          menu_item_id TEXT NOT NULL,
          name TEXT NOT NULL,
          price_cents INTEGER NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY (order_id) REFERENCES orders(id),
          FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
        );

        CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_qr_token ON orders(qr_token);
        CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);
        CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
      `);
    },
  },
  {
    version: 2,
    name: "loyalty_points",
    up: (d) => {
      addColumnIfMissing(d, "users", "points", "INTEGER NOT NULL DEFAULT 0");
    },
  },
  {
    version: 3,
    name: "order_item_customisations",
    up: (d) => {
      addColumnIfMissing(d, "order_items", "sugar_level", "TEXT");
      addColumnIfMissing(d, "order_items", "temperature", "TEXT");
      addColumnIfMissing(d, "order_items", "remark", "TEXT");
    },
  },
  {
    version: 4,
    name: "login_attempts",
    up: (d) => {
      d.exec(`
        CREATE TABLE IF NOT EXISTS login_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bucket TEXT NOT NULL,
          attempted_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_login_attempts_bucket
          ON login_attempts(bucket, attempted_at);
      `);
    },
  },
  {
    version: 5,
    name: "points_ledger",
    up: (d) => {
      // A ledger makes point awards idempotent and reversible. Without it,
      // a replayed webhook could award the same order twice and a cancelled
      // order could never be clawed back.
      d.exec(`
        CREATE TABLE IF NOT EXISTS points_ledger (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          order_id TEXT NOT NULL,
          delta INTEGER NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (order_id, reason),
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (order_id) REFERENCES orders(id)
        );
        CREATE INDEX IF NOT EXISTS idx_points_ledger_user ON points_ledger(user_id);
      `);
    },
  },
  {
    version: 6,
    name: "order_created_at_index",
    up: (d) => {
      // The admin dashboard sorts every query by created_at.
      d.exec("CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)");
    },
  },
];

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    (database.prepare("SELECT version FROM schema_migrations").all() as Array<{
      version: number;
    }>).map((r) => r.version)
  );

  const record = database.prepare(
    "INSERT INTO schema_migrations (version, name) VALUES (?, ?)"
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    const run = database.transaction(() => {
      migration.up(database);
      record.run(migration.version, migration.name);
    });
    run();
  }
}

/**
 * Creates the initial admin from ADMIN_EMAIL / ADMIN_PASSWORD, once.
 * If those are unset no admin is created — promote a user by hand instead.
 * Existing admin accounts are never modified.
 */
function seedAdmin(database: Database.Database): void {
  const seed = getAdminSeed();
  if (!seed) return;

  const existing = database
    .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    .get();
  if (existing) return;

  const emailTaken = database
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(seed.email);
  if (emailTaken) {
    database.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(seed.email);
    return;
  }

  database
    .prepare(
      "INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'admin')"
    )
    .run(uuidv4(), seed.email, "Admin", bcrypt.hashSync(seed.password, 12));
}

export default getDb;
