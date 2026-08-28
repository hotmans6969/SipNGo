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

/**
 * A hosted Stripe Payment Link to send card and wallet customers to, if one
 * is configured.
 *
 * This is a stand-in for creating a Checkout Session, and it comes with a
 * limitation worth being blunt about: a payment link charges the fixed amount
 * set on it in the Stripe dashboard. There is no URL parameter for the amount
 * — only UTM codes and client_reference_id — so a RM 4 drink and a RM 40 round
 * both charge whatever that link says. It is fine for testing the flow and
 * must not be relied on to take real money.
 *
 * `client_reference_id` is what makes the payment traceable: Stripe passes it
 * through to the checkout.session.completed webhook, which is how the order
 * gets marked paid.
 */
export function paymentLinkFor(orderId: string): string | null {
  const configured = process.env.STRIPE_PAYMENT_LINK_URL?.trim();
  if (!configured) return null;

  try {
    const url = new URL(configured);
    // Only ever hand a customer an https destination: this value comes from
    // the environment and ends up as a redirect.
    if (url.protocol !== "https:") return null;
    url.searchParams.set("client_reference_id", orderId);
    return url.toString();
  } catch {
    return null;
  }
}
