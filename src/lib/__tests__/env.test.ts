import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * These guards are the difference between a misconfigured deploy failing loudly
 * and one quietly signing tokens with a public fallback key or giving away free
 * drinks, so they are worth pinning down.
 */

const ORIGINAL = { ...process.env };

/** NODE_ENV is typed readonly, but these tests need to vary it. */
function setNodeEnv(value: string): void {
  (process.env as Record<string, string>).NODE_ENV = value;
}

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL };
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("getJwtSecret", () => {
  it("throws rather than falling back to a default", async () => {
    delete process.env.JWT_SECRET;
    const { getJwtSecret } = await import("../env");
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET is not set/);
  });

  it("returns the configured secret", async () => {
    process.env.JWT_SECRET = "a-real-secret";
    const { getJwtSecret } = await import("../env");
    expect(getJwtSecret()).toBe("a-real-secret");
  });
});

describe("isPaymentSimulated", () => {
  it("simulates payment in development when Stripe is unconfigured", async () => {
    setNodeEnv("development");
    delete process.env.STRIPE_SECRET_KEY;
    const { isPaymentSimulated } = await import("../env");
    expect(isPaymentSimulated()).toBe(true);
  });

  it("refuses to simulate payment in production", async () => {
    setNodeEnv("production");
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.ALLOW_SIMULATED_PAYMENTS;
    const { isPaymentSimulated } = await import("../env");
    expect(() => isPaymentSimulated()).toThrow(/ALLOW_SIMULATED_PAYMENTS=true/);
  });

  it("simulates payment in production only when explicitly opted in", async () => {
    setNodeEnv("production");
    delete process.env.STRIPE_SECRET_KEY;
    process.env.ALLOW_SIMULATED_PAYMENTS = "true";
    const { isPaymentSimulated } = await import("../env");
    expect(isPaymentSimulated()).toBe(true);
  });

  it("does not accept a fuzzy opt-in value", async () => {
    setNodeEnv("production");
    delete process.env.STRIPE_SECRET_KEY;
    process.env.ALLOW_SIMULATED_PAYMENTS = "1";
    const { isPaymentSimulated } = await import("../env");
    expect(() => isPaymentSimulated()).toThrow();
  });

  it("uses real payments whenever a key is present", async () => {
    setNodeEnv("production");
    process.env.ALLOW_SIMULATED_PAYMENTS = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    const { isPaymentSimulated } = await import("../env");
    expect(isPaymentSimulated()).toBe(false);
  });
});

describe("getAdminSeed", () => {
  it("creates no admin when nothing is configured", async () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    const { getAdminSeed } = await import("../env");
    expect(getAdminSeed()).toBeNull();
  });

  it("rejects a half-configured seed", async () => {
    process.env.ADMIN_EMAIL = "admin@example.test";
    delete process.env.ADMIN_PASSWORD;
    const { getAdminSeed } = await import("../env");
    expect(() => getAdminSeed()).toThrow(/must be set together/);
  });

  it("rejects a short admin password", async () => {
    process.env.ADMIN_EMAIL = "admin@example.test";
    process.env.ADMIN_PASSWORD = "admin123";
    const { getAdminSeed } = await import("../env");
    expect(() => getAdminSeed()).toThrow(/at least 12 characters/);
  });

  it("normalises the admin email", async () => {
    process.env.ADMIN_EMAIL = "  Admin@Example.TEST ";
    process.env.ADMIN_PASSWORD = "a-long-enough-password";
    const { getAdminSeed } = await import("../env");
    expect(getAdminSeed()?.email).toBe("admin@example.test");
  });
});

describe("getIcedSurchargeCents", () => {
  it("defaults to RM 1.00", async () => {
    delete process.env.ICED_SURCHARGE_CENTS;
    const { getIcedSurchargeCents } = await import("../env");
    expect(getIcedSurchargeCents()).toBe(100);
  });

  it("accepts an override", async () => {
    process.env.ICED_SURCHARGE_CENTS = "150";
    const { getIcedSurchargeCents } = await import("../env");
    expect(getIcedSurchargeCents()).toBe(150);
  });

  it("rejects a nonsense value", async () => {
    process.env.ICED_SURCHARGE_CENTS = "free";
    const { getIcedSurchargeCents } = await import("../env");
    expect(() => getIcedSurchargeCents()).toThrow(/non-negative integer/);
  });
});
