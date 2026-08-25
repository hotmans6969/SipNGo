/** Currency shown to customers and charged through Stripe. */
export const CURRENCY = "myr";
export const CURRENCY_SYMBOL = "RM";

/** Formats a sen amount as a display price, e.g. 550 -> "RM 5.50". */
export function formatPrice(cents: number): string {
  return `${CURRENCY_SYMBOL} ${(cents / 100).toFixed(2)}`;
}
