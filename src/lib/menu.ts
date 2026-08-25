/**
 * Categories the storefront actually sells. The seeded food and pastry rows
 * were previously filtered out with an inline NOT IN clause duplicated across
 * routes; keeping the list here means the customer menu and the admin menu
 * can never disagree about what is on sale.
 */
export const DRINK_CATEGORIES = ["coffee", "tea", "smoothies", "juices"] as const;

/** Columns returned to clients — never `SELECT *`. */
export const MENU_COLUMNS = "id, name, description, price_cents, category, image_url, available";
