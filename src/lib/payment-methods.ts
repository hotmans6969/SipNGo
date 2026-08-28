/**
 * How an order can be paid for.
 *
 * Kept in one place because three parts of the app have to agree: the portal
 * the customer chooses from, the route that acts on the choice, and the
 * counter screen that has to know whether cash is coming.
 */
export const PAYMENT_METHODS = ["counter", "ewallet", "card"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export interface PaymentMethodInfo {
  label: string;
  blurb: string;
  glyph: string;
  /**
   * Whether choosing this settles the order there and then. Paying at the
   * counter does not: the order is placed but stays unpaid until someone
   * takes the money, which is the whole point of offering it.
   */
  settlesNow: boolean;
}

export const PAYMENT_METHOD_INFO: Record<PaymentMethod, PaymentMethodInfo> = {
  counter: {
    label: "Pay at the counter",
    blurb: "Order now, pay with cash or card when you collect.",
    glyph: "🧾",
    settlesNow: false,
  },
  ewallet: {
    label: "E-wallet",
    blurb: "GrabPay and other supported wallets.",
    glyph: "📱",
    settlesNow: true,
  },
  card: {
    label: "Credit or debit card",
    blurb: "Visa, Mastercard and other major cards.",
    glyph: "💳",
    settlesNow: true,
  },
};

/**
 * Stripe payment method types for each online option.
 *
 * Stripe rejects a session asking for a method the account has not enabled,
 * so the wallet list is overridable: an account with FPX or Alipay switched on
 * can offer them without a code change. GrabPay is the default because it is
 * the wallet Stripe supports for ringgit.
 */
export function stripeMethodTypesFor(method: "ewallet" | "card"): string[] {
  if (method === "card") return ["card"];

  const configured = process.env.STRIPE_EWALLET_METHODS;
  const list = (configured ?? "grabpay")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return list.length > 0 ? list : ["grabpay"];
}
