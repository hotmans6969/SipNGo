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
 * Allowed forward transitions. Orders move through the flow in one direction;
 * without this an admin could send a collected order back to `pending_payment`
 * and re-trigger payment and points handling.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["picked_up"],
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
