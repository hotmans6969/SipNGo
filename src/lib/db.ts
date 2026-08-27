import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { getAdminSeed } from "./env";
import { seedMenuIfEmpty } from "./seed-menu";
import { sql, executeMultiple, type Queryable } from "./sql";

/**
 * Schema setup and first-run seeding.
 *
 * `getDb()` is what routes call. It resolves once the database is migrated and
 * seeded, and memoises that work so concurrent requests share a single pass
 * rather than racing each other through the migrations.
 */

let ready: Promise<Queryable> | undefined;

export default function getDb(): Promise<Queryable> {
  if (!ready) {
    ready = initialise().catch((error) => {
      // Don't cache a failed initialisation, or every later request inherits
      // a transient startup error.
      ready = undefined;
      throw error;
    });
  }
  return ready;
}

async function initialise(): Promise<Queryable> {
  await migrate();
  await seedAdmin();
  await seedMenuIfEmpty(sql);
  return sql;
}

/** True if `table` already has `column`. Keeps ALTERs idempotent. */
async function hasColumn(table: string, column: string): Promise<boolean> {
  const columns = await sql.all<{ name: string }>(`PRAGMA table_info(${table})`);
  return columns.some((c) => c.name === column);
}

async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string
): Promise<void> {
  if (!(await hasColumn(table, column))) {
    await sql.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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
const MIGRATIONS: Array<{ version: number; name: string; up: () => Promise<void> }> = [
  {
    version: 1,
    name: "base_schema",
    up: async () => {
      await executeMultiple(`
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
    up: async () => {
      await addColumnIfMissing("users", "points", "INTEGER NOT NULL DEFAULT 0");
    },
  },
  {
    version: 3,
    name: "order_item_customisations",
    up: async () => {
      await addColumnIfMissing("order_items", "sugar_level", "TEXT");
      await addColumnIfMissing("order_items", "temperature", "TEXT");
      await addColumnIfMissing("order_items", "remark", "TEXT");
    },
  },
  {
    version: 4,
    name: "login_attempts",
    up: async () => {
      await executeMultiple(`
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
    up: async () => {
      // A ledger makes point awards idempotent and reversible. Without it,
      // a replayed webhook could award the same order twice and a cancelled
      // order could never be clawed back.
      await executeMultiple(`
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
    up: async () => {
      // The admin dashboard sorts every query by created_at.
      await sql.run("CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC)");
    },
  },
  {
    version: 7,
    name: "app_config",
    up: async () => {
      // Holds values generated for this installation, such as a session
      // signing key when the environment does not supply one.
      await executeMultiple(`
        CREATE TABLE IF NOT EXISTS app_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    version: 8,
    name: "push_subscriptions",
    up: async () => {
      // One row per browser/device a user has granted permission on. The
      // endpoint is unique per subscription and is what identifies it to the
      // push service, so it doubles as the primary key.
      await executeMultiple(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          endpoint TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
          ON push_subscriptions(user_id);
      `);
    },
  },
  {
    version: 9,
    name: "order_item_toppings",
    up: async () => {
      // Stored as a JSON array on the line rather than a join table: the set
      // is tiny and fixed, and an order line is only ever read whole. Rows
      // written before this exists read back as no toppings.
      await addColumnIfMissing("order_items", "toppings", "TEXT");
    },
  },
  {
    version: 10,
    name: "vouchers",
    up: async () => {
      await executeMultiple(`
        CREATE TABLE IF NOT EXISTS vouchers (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('free_drink', 'discount')),
          discount_cents INTEGER NOT NULL DEFAULT 0,
          label TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('signup', 'points')),
          points_spent INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT,
          redeemed_at TEXT,
          order_id TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_vouchers_user ON vouchers(user_id);
        CREATE INDEX IF NOT EXISTS idx_vouchers_order ON vouchers(order_id);
      `);

      // An order records what it was discounted by, so a receipt still adds
      // up years later even if the voucher row is changed or removed.
      await addColumnIfMissing("orders", "voucher_id", "TEXT");
      await addColumnIfMissing("orders", "discount_cents", "INTEGER NOT NULL DEFAULT 0");
    },
  },
  {
    version: 11,
    name: "repair_dead_menu_images",
    up: async () => {
      // Two of the seeded Unsplash photos have since been taken down and now
      // answer 404, which left those cards with a broken image on the menu.
      // The seed is only consulted when `menu_items` is empty, so a shop that
      // has been running since before the fix would never pick up the new
      // URLs on its own.
      //
      // Matched on the exact dead URL rather than the item name: a shop that
      // has already put its own photograph on either drink keeps it.
      for (const [dead, replacement] of DEAD_MENU_IMAGES) {
        await sql.run("UPDATE menu_items SET image_url = ? WHERE image_url = ?", [
          replacement,
          dead,
        ]);
      }
    },
  },
];

/** Withdrawn Unsplash photos, paired with the ones that replaced them. */
const DEAD_MENU_IMAGES: ReadonlyArray<readonly [string, string]> = [
  [
    "https://images.unsplash.com/photo-1461023058943-07cb126df8eb?w=500&q=80",
    "https://images.unsplash.com/photo-1531835207745-506a1bc035d8?w=500&q=80",
  ],
  [
    "https://images.unsplash.com/photo-1625937751876-4515cd8e78be?w=500&q=80",
    "https://images.unsplash.com/photo-1547825407-2d060104b7f8?w=500&q=80",
  ],
];

async function migrate(): Promise<void> {
  await executeMultiple(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const rows = await sql.all<{ version: number }>("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((r) => Number(r.version)));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    await migration.up();
    await sql.run("INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)", [
      migration.version,
      migration.name,
    ]);
  }
}

/**
 * Reads a generated value, creating it on first use.
 *
 * This is how the app supplies its own session signing key when the
 * environment does not provide one. The value is random per installation and
 * lives in the database rather than the repository, so it is nothing like the
 * shared constant this replaced — but a key set through JWT_SECRET is still
 * preferable, because it survives the database being recreated.
 */
export async function getOrCreateConfigValue(
  key: string,
  generate: () => string
): Promise<string> {
  await getDb();

  const existing = await sql.one<{ value: string }>(
    "SELECT value FROM app_config WHERE key = ?",
    [key]
  );
  if (existing) return existing.value;

  // INSERT OR IGNORE plus a re-read, so two simultaneous first requests agree.
  await sql.run("INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)", [
    key,
    generate(),
  ]);
  const stored = await sql.one<{ value: string }>(
    "SELECT value FROM app_config WHERE key = ?",
    [key]
  );
  return stored!.value;
}

/**
 * Creates the initial admin, once.
 *
 * ADMIN_EMAIL / ADMIN_PASSWORD choose the credentials. With neither set, an
 * admin is still created — with a random password printed once to the server
 * log — because otherwise a fresh deployment has no way in at all. Nothing
 * predictable is ever created.
 */
async function seedAdmin(): Promise<void> {
  const existing = await sql.one<{ id: string }>(
    "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
  );
  if (existing) return;

  const configured = getAdminSeed();
  const seed = configured ?? {
    email: "admin@sipngo.com",
    password: crypto.randomBytes(12).toString("base64url"),
  };

  const emailTaken = await sql.one<{ id: string }>("SELECT id FROM users WHERE email = ?", [
    seed.email,
  ]);
  if (emailTaken) {
    await sql.run("UPDATE users SET role = 'admin' WHERE email = ?", [seed.email]);
    return;
  }

  await sql.run(
    "INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'admin')",
    [uuidv4(), seed.email, "Admin", bcrypt.hashSync(seed.password, 12)]
  );

  if (!configured) {
    console.warn(
      [
        "",
        "  ==================================================================",
        "   No ADMIN_EMAIL / ADMIN_PASSWORD set, so an admin was created:",
        "",
        `     email:    ${seed.email}`,
        `     password: ${seed.password}`,
        "",
        "   This is shown once. Set ADMIN_EMAIL and ADMIN_PASSWORD to choose",
        "   your own, or sign in and change it.",
        "  ==================================================================",
        "",
      ].join("\n")
    );
  }
}
