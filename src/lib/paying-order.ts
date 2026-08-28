/**
 * Where the browser notes the order it is about to go and pay for.
 *
 * A hosted Stripe payment link returns to a URL fixed in the dashboard, with
 * no room for an order id, so the only thing that knows which order the
 * customer just paid for is the browser that sent them. This is that note.
 *
 * It is a convenience for finding the way back to the right QR code, never a
 * claim that anything was paid — only the webhook, or a member of staff, can
 * say that.
 */
export const PAYING_ORDER_KEY = "sipngo_paying_order";
