import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

/**
 * Starter menu, inserted only when `menu_items` is completely empty, so a
 * fresh clone has something to order. Existing installs are never touched.
 */
const STARTER_MENU = [
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
];

export function seedMenuIfEmpty(database: Database.Database): void {
  const count = database
    .prepare("SELECT COUNT(*) as count FROM menu_items")
    .get() as { count: number };
  if (count.count > 0) return;

  const insert = database.prepare(
    "INSERT INTO menu_items (id, name, description, price_cents, category) VALUES (?, ?, ?, ?, ?)"
  );
  const insertAll = database.transaction(() => {
    for (const item of STARTER_MENU) {
      insert.run(uuidv4(), item.name, item.description, item.price, item.category);
    }
  });
  insertAll();
}
