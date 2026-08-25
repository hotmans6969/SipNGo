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
 * Whether checkout should simulate payment instead of charging a card.
 *
 * A real Stripe key always wins. Outside production, a missing key simulates,
 * which is what local development wants. In production simulation has to be
 * asked for by name via ALLOW_SIMULATED_PAYMENTS, so a demo deployment can run
 * without Stripe while a real deployment that merely loses its key fails loudly
 * instead of quietly handing out free drinks.
 */
export function isPaymentSimulated(): boolean {
  if (process.env.STRIPE_SECRET_KEY) return false;

  const explicitlyAllowed = process.env.ALLOW_SIMULATED_PAYMENTS === "true";
  if (isProduction && !explicitlyAllowed) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Set it to take real payments, or set " +
        "ALLOW_SIMULATED_PAYMENTS=true to run this deployment in demo mode."
    );
  }
  return true;
}

/** True when orders are being placed without any real payment taking place. */
export function isDemoDeployment(): boolean {
  return isProduction && !process.env.STRIPE_SECRET_KEY;
}
