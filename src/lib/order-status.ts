export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "preparing",
  "ready",
  "picked_up",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Statuses that mean a drink was actually sold.
 *
 * An order sitting at `pending_payment` was never paid for, and a `cancelled`
 * one was refunded or written off. Sales reporting and the menu's best-seller
 * ordering both read from here, so a figure on the counter's dashboard and the
 * ranking a customer sees can never be counting different things.
 */
export const SOLD_STATUSES = ["paid", "preparing", "ready", "picked_up"] as const;

/**
 * Allowed forward transitions. Orders move through the flow in one direction;
 * without this an admin could send a collected order back to `pending_payment`
 * and re-trigger payment and points handling.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  // A made drink still has to be cancellable: customers do not always turn
  // up, and without this the order is stuck at "ready" for ever with no way
  // to close it out.
  ready: ["picked_up", "cancelled"],
  picked_up: [],
  cancelled: [],
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedNextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

/** Statuses a customer is allowed to cancel from themselves. */
export function customerCanCancel(status: OrderStatus): boolean {
  return status === "pending_payment" || status === "paid";
}
