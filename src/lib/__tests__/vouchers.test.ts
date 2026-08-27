import { describe, it, expect } from "vitest";
import { discountFor, REWARDS, getReward } from "../vouchers";

/**
 * These are the pure money rules. Anything touching the database is exercised
 * in orders.test.ts against a real one, because the guarantees that matter —
 * a voucher spent once, points that cannot be overdrawn — are enforced by the
 * database, not by this arithmetic.
 */

describe("the reward catalogue", () => {
  it("has no duplicate ids", () => {
    const ids = REWARDS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("costs more points for a bigger discount", () => {
    const sorted = [...REWARDS].sort((a, b) => a.points - b.points);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].discountCents).toBeGreaterThan(sorted[i - 1].discountCents);
    }
  });

  it("looks up by id and rejects anything else", () => {
    expect(getReward(REWARDS[0].id)?.points).toBe(REWARDS[0].points);
    expect(getReward("free_everything")).toBeUndefined();
  });
});

describe("discountFor", () => {
  const freeDrink = { kind: "free_drink" as const, discount_cents: 0 };
  const fiveOff = { kind: "discount" as const, discount_cents: 500 };

  it("takes a fixed amount off", () => {
    expect(discountFor(fiveOff, [1000], 1000)).toBe(500);
  });

  it("never discounts more than the order is worth", () => {
    // A RM 12 voucher on a RM 4 order settles the bill and no more; the
    // remainder is not carried forward or paid out.
    expect(discountFor({ kind: "discount", discount_cents: 1200 }, [400], 400)).toBe(400);
  });

  it("makes one drink free, the cheapest on the order", () => {
    // Cheapest rather than dearest, so adding an expensive drink alongside a
    // free one cannot turn the voucher into a bigger discount.
    expect(discountFor(freeDrink, [400, 900], 1300)).toBe(400);
  });

  it("covers the whole order when it is a single drink", () => {
    expect(discountFor(freeDrink, [650], 650)).toBe(650);
  });

  it("discounts one unit, not the whole line", () => {
    // Three drinks at RM 4, one free: RM 4 off, not RM 12.
    expect(discountFor(freeDrink, [400], 1200)).toBe(400);
  });

  it("gives nothing away on an empty order", () => {
    expect(discountFor(freeDrink, [], 0)).toBe(0);
    expect(discountFor(fiveOff, [], 0)).toBe(0);
  });
});
