/**
 * Drink toppings.
 *
 * Four are offered for now, and a drink may take any combination of them — so
 * four is both the size of the catalogue and the most that can go on one
 * drink. Adding a fifth here is all that is needed to offer it; the cap in
 * `validation.ts` is derived from this list rather than written down twice.
 *
 * Every topping currently costs the same, but the price lives per topping so
 * that changing one later does not mean restructuring the order data.
 */

export const TOPPING_PRICE_CENTS = 200; // RM 2.00

/**
 * Default surcharge for an iced drink, in sen.
 *
 * The server reads ICED_SURCHARGE_CENTS and falls back to this; the cart uses
 * it directly. Previously the client had its own hardcoded 100, so the cart
 * showed a total that did not match what the server charged.
 */
export const DEFAULT_ICED_SURCHARGE_CENTS = 100; // RM 1.00

export interface Topping {
  id: string;
  label: string;
  emoji: string;
}

export const TOPPINGS: readonly Topping[] = [
  { id: "boba", label: "Boba", emoji: "🧋" },
  { id: "tea_jelly", label: "Tea jelly", emoji: "🍮" },
  { id: "grass_jelly", label: "Grass jelly", emoji: "🟫" },
  { id: "pudding", label: "Pudding", emoji: "🍯" },
] as const;

export const TOPPING_IDS = TOPPINGS.map((t) => t.id);

/** The most toppings one drink can carry: every one on the menu. */
export const MAX_TOPPINGS_PER_ITEM = TOPPINGS.length;

export function isToppingId(value: unknown): value is string {
  return typeof value === "string" && TOPPING_IDS.includes(value);
}

export function getTopping(id: string): Topping | undefined {
  return TOPPINGS.find((t) => t.id === id);
}

/**
 * Normalises a list of topping ids: unknown ones dropped, duplicates removed,
 * and ordered to match the menu so two identical drinks always compare equal.
 */
export function normaliseToppings(ids: readonly string[] | null | undefined): string[] {
  if (!ids?.length) return [];
  const chosen = new Set(ids.filter(isToppingId));
  return TOPPING_IDS.filter((id) => chosen.has(id));
}

/** Extra charge for a set of toppings, in sen. */
export function toppingsPriceCents(ids: readonly string[]): number {
  return normaliseToppings(ids).length * TOPPING_PRICE_CENTS;
}

/** Human-readable list, e.g. "Boba, Pudding". */
export function formatToppings(ids: readonly string[]): string {
  return normaliseToppings(ids)
    .map((id) => getTopping(id)?.label ?? id)
    .join(", ");
}

/** Stored on the order line as JSON so the order keeps what was chosen. */
export function serialiseToppings(ids: readonly string[]): string | null {
  const normalised = normaliseToppings(ids);
  return normalised.length ? JSON.stringify(normalised) : null;
}

/** Reads back a stored value, tolerating rows written before this existed. */
export function parseToppings(stored: string | null | undefined): string[] {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? normaliseToppings(parsed) : [];
  } catch {
    return [];
  }
}
