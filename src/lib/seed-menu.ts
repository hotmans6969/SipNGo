import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

/**
 * Starter menu, inserted only when `menu_items` is completely empty, so a
 * fresh clone or a fresh deployment has a full menu to order from. Existing
 * installs are never touched.
 *
 * These rows, including the artwork, previously existed only inside the
 * committed `sipngo.db`. That file is no longer in the repository, so the menu
 * lives here in code where it can be reviewed and changed like anything else.
 */
const STARTER_MENU: Array<{
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
}> = [
  {
    name: "Americano",
    description: "Espresso with hot water for a smooth finish",
    price: 400,
    category: "coffee",
    imageUrl:
      "https://images.unsplash.com/photo-1551030173-122aabc4489c?w=500&q=80",
  },
  {
    name: "Cappuccino",
    description: "Espresso with steamed milk and foam",
    price: 500,
    category: "coffee",
    imageUrl:
      "https://images.unsplash.com/photo-1534778101976-62847782c213?w=500&q=80",
  },
  {
    name: "Cold Brew",
    description: "Slow-steeped cold coffee, smooth and bold",
    price: 500,
    category: "coffee",
    imageUrl:
      "https://images.unsplash.com/photo-1461023058943-07cb126df8eb?w=500&q=80",
  },
  {
    name: "Espresso",
    description: "Rich and bold single shot espresso",
    price: 350,
    category: "coffee",
    imageUrl:
      "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=500&q=80",
  },
  {
    name: "Latte",
    description: "Espresso with steamed milk, lightly foamed",
    price: 550,
    category: "coffee",
    imageUrl:
      "https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?w=500&q=80",
  },
  {
    name: "Mocha",
    description: "Espresso with chocolate and steamed milk",
    price: 600,
    category: "coffee",
    imageUrl:
      "https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?w=500&q=80",
  },
  {
    name: "Fresh Orange Juice",
    description: "Freshly squeezed orange juice",
    price: 500,
    category: "juices",
    imageUrl:
      "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=500&q=80",
  },
  {
    name: "Lemonade",
    description: "House-made lemonade with fresh lemons",
    price: 450,
    category: "juices",
    imageUrl:
      "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&q=80",
  },
  {
    name: "Berry Blast Smoothie",
    description: "Mixed berries with banana and oat milk",
    price: 700,
    category: "smoothies",
    imageUrl:
      "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=500&q=80",
  },
  {
    name: "Mango Smoothie",
    description: "Fresh mango blended with yogurt and ice",
    price: 650,
    category: "smoothies",
    imageUrl:
      "https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=500&q=80",
  },
  {
    name: "Chai Latte",
    description: "Spiced chai concentrate with steamed milk",
    price: 550,
    category: "tea",
    imageUrl:
      "https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?w=500&q=80",
  },
  {
    name: "Earl Grey",
    description: "Black tea with bergamot oil",
    price: 350,
    category: "tea",
    imageUrl:
      "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=500&q=80",
  },
  {
    name: "Green Tea",
    description: "Classic brewed green tea",
    price: 350,
    category: "tea",
    imageUrl:
      "https://images.unsplash.com/photo-1625937751876-4515cd8e78be?w=500&q=80",
  },
  {
    name: "Iced Matcha Latte",
    description: "Japanese matcha with cold milk over ice",
    price: 600,
    category: "tea",
    imageUrl:
      "https://images.unsplash.com/photo-1536514072410-5019a3c69182?w=500&q=80",
  },
];

export function seedMenuIfEmpty(database: Database.Database): void {
  const count = database
    .prepare("SELECT COUNT(*) as count FROM menu_items")
    .get() as { count: number };
  if (count.count > 0) return;

  const insert = database.prepare(
    `INSERT INTO menu_items (id, name, description, price_cents, category, image_url)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertAll = database.transaction(() => {
    for (const item of STARTER_MENU) {
      insert.run(uuidv4(), item.name, item.description, item.price, item.category, item.imageUrl);
    }
  });
  insertAll();
}
