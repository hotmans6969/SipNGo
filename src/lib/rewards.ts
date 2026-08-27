/**
 * Voucher types and the money rules, with no database behind them.
 *
 * Split out because the cart shows the discount before checkout, and a client
 * component importing lib/vouchers pulled the native libSQL driver into the
 * browser bundle — the build failed trying to parse a README inside it. The
 * arithmetic here is the same code the server uses, so what the cart displays
 * is what the order is charged.
 */

export type VoucherKind = "free_drink" | "discount";
export type VoucherSource = "signup" | "points";

export interface VoucherRow {
  id: string;
  user_id: string;
  kind: VoucherKind;
  discount_cents: number;
  label: string;
  source: VoucherSource;
  points_spent: number;
  created_at: string;
  expires_at: string | null;
  redeemed_at: string | null;
  order_id: string | null;
}

export const VOUCHER_COLUMNS = `
  id, user_id, kind, discount_cents, label, source, points_spent,
  created_at, expires_at, redeemed_at, order_id
`;

/** What points can be exchanged for. */
export interface Reward {
  id: string;
  points: number;
  label: string;
  discountCents: number;
  /** Days the voucher stays valid once claimed. */
  validForDays: number;
}

export const REWARDS: readonly Reward[] = [
  { id: "off5", points: 100, label: "RM 5 off", discountCents: 500, validForDays: 60 },
  { id: "off12", points: 200, label: "RM 12 off", discountCents: 1200, validForDays: 60 },
] as const;

/** A free drink for signing up. Ninety days is long enough to be a real gift. */
export const SIGNUP_VOUCHER = {
  label: "Welcome drink — one free",
  validForDays: 90,
} as const;

export function getReward(id: string): Reward | undefined {
  return REWARDS.find((r) => r.id === id);
}


/**
 * What a voucher takes off an order.
 *
 * A free drink covers the cheapest line, which is the usual convention and
 * the one that cannot be gamed by adding an expensive drink alongside. The
 * discount never exceeds the order, so a voucher can bring a bill to zero but
 * never below it, and the remainder is not carried forward.
 */
export function discountFor(
  voucher: Pick<VoucherRow, "kind" | "discount_cents">,
  lineUnitPrices: readonly number[],
  subtotalCents: number
): number {
  if (subtotalCents <= 0) return 0;

  if (voucher.kind === "free_drink") {
    if (lineUnitPrices.length === 0) return 0;
    return Math.min(Math.min(...lineUnitPrices), subtotalCents);
  }

  return Math.min(voucher.discount_cents, subtotalCents);
}
