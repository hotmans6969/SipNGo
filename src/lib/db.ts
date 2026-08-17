import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "sipngo.db");

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeDb(db);
  }
  return db;
}

function initializeDb(database: Database.Database): void {
  database.exec(`
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

  // Seed default admin user if none exists
  const adminExists = database.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!adminExists) {
    // We'll create admin on first run via the seed function
    seedData(database);
  }
}

function seedData(database: Database.Database): void {
  const bcrypt = require("bcryptjs");
  const { v4: uuidv4 } = require("uuid");

  // Create admin user (password: admin123)
  const adminId = uuidv4();
  const adminHash = bcrypt.hashSync("admin123", 10);
  database.prepare(
    "INSERT OR IGNORE INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)"
  ).run(adminId, "admin@sipngo.com", "Admin", adminHash, "admin");

  // Seed menu items
  const menuItems = [
    { name: "Espresso", description: "Rich and bold single shot espresso", price: 350, category: "coffee" },
    { name: "Americano", description: "Espresso with hot water for a smooth finish", price: 400, category: "coffee" },
    { name: "Cappuccino", description: "Espresso with steamed milk and foam", price: 500, category: "coffee" },
    { name: "Latte", description: "Espresso with steamed milk, lightly foamed", price: 550, category: "coffee" },
    { name: "Mocha", description: "Espresso with chocolate and steamed milk", price: 600, category: "coffee" },
    { name: "Cold Brew", description: "Slow-steeped cold coffee, smooth and bold", price: 500, category: "coffee" },
    { name: "Iced Matcha Latte", description: "Japanese matcha with cold milk over ice", price: 600, category: "tea" },
    { name: "Chai Latte", description: "Spiced chai concentrate with steamed milk", price: 550, category: "tea" },
    { name: "Green Tea", description: "Classic brewed green tea", price: 350, category: "tea" },
    { name: "Earl Grey", description: "Black tea with bergamot oil", price: 350, category: "tea" },
    { name: "Mango Smoothie", description: "Fresh mango blended with yogurt and ice", price: 650, category: "smoothies" },
    { name: "Berry Blast Smoothie", description: "Mixed berries with banana and oat milk", price: 700, category: "smoothies" },
    { name: "Fresh Orange Juice", description: "Freshly squeezed orange juice", price: 500, category: "juices" },
    { name: "Lemonade", description: "House-made lemonade with fresh lemons", price: 450, category: "juices" },
    { name: "Croissant", description: "Buttery, flaky French croissant", price: 400, category: "pastries" },
    { name: "Blueberry Muffin", description: "Freshly baked muffin loaded with blueberries", price: 450, category: "pastries" },
    { name: "Chocolate Chip Cookie", description: "Warm cookie with melted chocolate chips", price: 350, category: "pastries" },
    { name: "Avocado Toast", description: "Sourdough toast with smashed avocado and seasoning", price: 800, category: "food" },
    { name: "Ham & Cheese Sandwich", description: "Classic toasted sandwich with ham and Swiss cheese", price: 750, category: "food" },
    { name: "Caesar Salad", description: "Romaine lettuce with caesar dressing and croutons", price: 850, category: "food" },
  ];

  const insertMenu = database.prepare(
    "INSERT OR IGNORE INTO menu_items (id, name, description, price_cents, category) VALUES (?, ?, ?, ?, ?)"
  );

  const insertMany = database.transaction((items: typeof menuItems) => {
    for (const item of items) {
      insertMenu.run(uuidv4(), item.name, item.description, item.price, item.category);
    }
  });

  insertMany(menuItems);
}

export default getDb;
