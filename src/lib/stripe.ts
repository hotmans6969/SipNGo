import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

/**
 * Reads the key lazily rather than at module load, so importing this file
 * during a build without secrets present does not throw.
 */
export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }
    stripeInstance = new Stripe(key);
  }
  return stripeInstance;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}
