import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Push is optional: a deployment without VAPID keys must still take orders,
 * and a notification failure must never surface as a failed order. These pin
 * the wording customers see and the "configured" gate that everything else
 * hangs off.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL };
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("isPushConfigured", () => {
  it("is false when no keys are set", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const { isPushConfigured } = await import("../push");
    expect(isPushConfigured()).toBe(false);
  });

  it("is false when only half the pair is set", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    delete process.env.VAPID_PRIVATE_KEY;
    const { isPushConfigured } = await import("../push");
    expect(isPushConfigured()).toBe(false);
  });

  it("is true with both keys", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    const { isPushConfigured } = await import("../push");
    expect(isPushConfigured()).toBe(true);
  });
});

describe("sending without configuration", () => {
  it("is a no-op rather than an error", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const { notifyUser, notifyStaff } = await import("../push");

    // No keys means no database access either, so these resolve without
    // needing a connection.
    await expect(notifyUser("someone", { title: "t", body: "b" })).resolves.toBe(0);
    await expect(notifyStaff({ title: "t", body: "b" })).resolves.toBe(0);
  });
});

describe("customerStatusMessage", () => {
  it("announces preparing, ready and cancelled", async () => {
    const { customerStatusMessage } = await import("../push");
    expect(customerStatusMessage("preparing", 7)?.title).toMatch(/preparing/i);
    expect(customerStatusMessage("ready", 7)?.title).toMatch(/ready/i);
    expect(customerStatusMessage("cancelled", 7)?.title).toMatch(/cancelled/i);
  });

  it("says nothing for statuses the customer does not need pushed", async () => {
    const { customerStatusMessage } = await import("../push");
    // "paid" is the customer's own action and "picked_up" happens with them
    // stood at the counter; neither warrants buzzing a phone.
    expect(customerStatusMessage("paid", 7)).toBeNull();
    expect(customerStatusMessage("picked_up", 7)).toBeNull();
    expect(customerStatusMessage("pending_payment", 7)).toBeNull();
  });

  it("pads the order number the way the app displays it", async () => {
    const { customerStatusMessage } = await import("../push");
    expect(customerStatusMessage("ready", 7)?.body).toContain("#007");
    expect(customerStatusMessage("ready", 142)?.body).toContain("#142");
  });

  it("tags per order so updates replace rather than stack", async () => {
    const { customerStatusMessage } = await import("../push");
    const preparing = customerStatusMessage("preparing", 7);
    const ready = customerStatusMessage("ready", 7);
    expect(preparing?.tag).toBe(ready?.tag);
  });
});
