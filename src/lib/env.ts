/**
 * Central environment access. Every value the server needs is read here once,
 * so a misconfigured deploy fails loudly at startup instead of silently
 * falling back to an insecure default.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in.`
    );
  }
  return value;
}

export const isProduction = process.env.NODE_ENV === "production";

/** Signing key for session JWTs. No fallback — an unset secret is fatal. */
export function getJwtSecret(): string {
  return required("JWT_SECRET");
}

/** Credentials for the one-time admin seed. Both must be set, or neither. */
export function getAdminSeed(): { email: string; password: string } | null {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email && !password) return null;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set together.");
  }
  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
  }
  return { email, password };
}

/** Surcharge for an iced drink, in sen. */
export function getIcedSurchargeCents(): number {
  const raw = process.env.ICED_SURCHARGE_CENTS;
  if (!raw) return 100;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("ICED_SURCHARGE_CENTS must be a non-negative integer.");
  }
  return parsed;
}

/**
 * Payments may be simulated only outside production. A production deploy with
 * no Stripe key would otherwise hand out free orders.
 */
export function isPaymentSimulated(): boolean {
  const configured = !!process.env.STRIPE_SECRET_KEY;
  if (configured) return false;
  if (isProduction) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Payment simulation is disabled in production."
    );
  }
  return true;
}
