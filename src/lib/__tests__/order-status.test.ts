import { describe, it, expect } from "vitest";
import {
  canTransition,
  customerCanCancel,
  isOrderStatus,
  ORDER_STATUSES,
} from "../order-status";

describe("order status transitions", () => {
  it("follows the happy path from payment to pickup", () => {
    expect(canTransition("pending_payment", "paid")).toBe(true);
    expect(canTransition("paid", "preparing")).toBe(true);
    expect(canTransition("preparing", "ready")).toBe(true);
    expect(canTransition("ready", "picked_up")).toBe(true);
  });

  it("refuses to move an order backwards", () => {
    expect(canTransition("picked_up", "ready")).toBe(false);
    expect(canTransition("ready", "preparing")).toBe(false);
    expect(canTransition("paid", "pending_payment")).toBe(false);
  });

  it("refuses to reopen a finished order", () => {
    for (const status of ORDER_STATUSES) {
      expect(canTransition("picked_up", status)).toBe(false);
      expect(canTransition("cancelled", status)).toBe(false);
    }
  });

  it("does not allow skipping straight to pickup", () => {
    expect(canTransition("paid", "picked_up")).toBe(false);
    expect(canTransition("pending_payment", "picked_up")).toBe(false);
  });

  it("allows cancelling up to the point of preparation", () => {
    expect(canTransition("pending_payment", "cancelled")).toBe(true);
    expect(canTransition("paid", "cancelled")).toBe(true);
    expect(canTransition("preparing", "cancelled")).toBe(true);
    expect(canTransition("ready", "cancelled")).toBe(false);
  });

  it("only lets customers cancel before the drink is made", () => {
    expect(customerCanCancel("pending_payment")).toBe(true);
    expect(customerCanCancel("paid")).toBe(true);
    expect(customerCanCancel("preparing")).toBe(false);
    expect(customerCanCancel("ready")).toBe(false);
  });

  it("rejects unknown status strings", () => {
    expect(isOrderStatus("refunded")).toBe(false);
    expect(isOrderStatus("")).toBe(false);
    expect(isOrderStatus(null)).toBe(false);
    expect(isOrderStatus("paid")).toBe(true);
  });
});
