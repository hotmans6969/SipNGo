import { describe, it, expect } from "vitest";
import {
  TOPPINGS,
  TOPPING_PRICE_CENTS,
  MAX_TOPPINGS_PER_ITEM,
  normaliseToppings,
  toppingsPriceCents,
  formatToppings,
  serialiseToppings,
  parseToppings,
} from "../toppings";

describe("the catalogue", () => {
  it("offers four toppings, each at RM 2.00", () => {
    expect(TOPPINGS).toHaveLength(4);
    expect(TOPPING_PRICE_CENTS).toBe(200);
    expect(MAX_TOPPINGS_PER_ITEM).toBe(4);
  });

  it("has no duplicate ids", () => {
    const ids = TOPPINGS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("normaliseToppings", () => {
  it("drops anything not on the menu", () => {
    // A client could otherwise invent a topping and be charged for it.
    expect(normaliseToppings(["boba", "gold_leaf"])).toEqual(["boba"]);
  });

  it("collapses duplicates", () => {
    // Sending the same topping twice must not double the charge.
    expect(normaliseToppings(["boba", "boba", "boba"])).toEqual(["boba"]);
  });

  it("orders by the menu so identical drinks compare equal", () => {
    const a = normaliseToppings(["pudding", "boba"]);
    const b = normaliseToppings(["boba", "pudding"]);
    expect(a).toEqual(b);
    expect(a.join(",")).toBe(b.join(","));
  });

  it("handles nothing at all", () => {
    expect(normaliseToppings([])).toEqual([]);
    expect(normaliseToppings(null)).toEqual([]);
    expect(normaliseToppings(undefined)).toEqual([]);
  });
});

describe("toppingsPriceCents", () => {
  it("charges RM 2.00 per topping", () => {
    expect(toppingsPriceCents([])).toBe(0);
    expect(toppingsPriceCents(["boba"])).toBe(200);
    expect(toppingsPriceCents(["boba", "pudding"])).toBe(400);
  });

  it("charges for all four when all four are chosen", () => {
    expect(toppingsPriceCents(TOPPINGS.map((t) => t.id))).toBe(800);
  });

  it("does not charge for duplicates or invented toppings", () => {
    expect(toppingsPriceCents(["boba", "boba"])).toBe(200);
    expect(toppingsPriceCents(["boba", "not_a_topping"])).toBe(200);
  });
});

describe("storage round-trip", () => {
  it("survives being written and read back", () => {
    const stored = serialiseToppings(["pudding", "boba"]);
    expect(parseToppings(stored)).toEqual(["boba", "pudding"]);
  });

  it("stores nothing rather than an empty array", () => {
    expect(serialiseToppings([])).toBeNull();
  });

  it("reads rows written before toppings existed as none", () => {
    expect(parseToppings(null)).toEqual([]);
    expect(parseToppings(undefined)).toEqual([]);
  });

  it("does not throw on a corrupt value", () => {
    expect(parseToppings("not json")).toEqual([]);
    expect(parseToppings('{"a":1}')).toEqual([]);
  });
});

describe("formatToppings", () => {
  it("reads as a label list", () => {
    expect(formatToppings(["boba", "pudding"])).toBe("Boba, Pudding");
  });
});
