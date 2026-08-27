/**
 * Categories the storefront actually sells. The seeded food and pastry rows
 * were previously filtered out with an inline NOT IN clause duplicated across
 * routes; keeping the list here means the customer menu and the admin menu
 * can never disagree about what is on sale.
 */
export const DRINK_CATEGORIES = ["coffee", "tea", "smoothies", "juices"] as const;

/** Columns returned to clients — never `SELECT *`. */
export const MENU_COLUMNS = "id, name, description, price_cents, category, image_url, available";

/** The same columns, qualified, for the query that joins sales onto the menu. */
export const MENU_COLUMNS_QUALIFIED = MENU_COLUMNS.split(", ")
  .map((column) => `m.${column}`)
  .join(", ");

/** How many best sellers are lifted to the top of the menu and badged. */
export const POPULAR_COUNT = 3;

/**
 * How far back the best-seller ranking looks.
 *
 * All-time totals ossify: a drink that sold well in the shop's first month
 * would sit at the top for ever, and a new favourite could never overtake it.
 * A rolling month reflects what people are actually buying now, and matches
 * the longest window the sales dashboard reports on.
 */
export const POPULARITY_WINDOW_DAYS = 30;

/** libSQL hands back integer aggregates as bigint. */
export function toCount(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}
