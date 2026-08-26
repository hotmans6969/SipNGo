import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getOrder, getOrderByStripeSession, markOrderPaid, updateOrderStatus } from "@/lib/orders";
import { isPaymentSimulated } from "@/lib/env";
import getDb from "@/lib/db";
import { sql } from "@/lib/sql";
import type { OrderStatus } from "@/lib/order-status";

/**
 * Resolves the order a session belongs to. client_reference_id is set at
 * checkout; the session lookup is the fallback for older sessions.
 */
async function resolveOrderId(session: Stripe.Checkout.Session): Promise<string | null> {
  const reference = session.client_reference_id ?? session.metadata?.order_id;
  if (reference && (await getOrder(reference))) return reference;
  return (await getOrderByStripeSession(session.id))?.id ?? null;
}

export async function POST(request: NextRequest) {
  if (isPaymentSimulated()) {
    return NextResponse.json({ received: true });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: "Webhook signature verification failed" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = await resolveOrderId(session);
        if (orderId) {
          const paymentIntent =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? "";
          // Idempotent: a replayed event will not award points twice.
          await markOrderPaid(orderId, paymentIntent);
        }
        break;
      }

      case "checkout.session.expired": {
        // The customer abandoned checkout. Release the order so it does not
        // sit in pending_payment forever.
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = await resolveOrderId(session);
        const order = orderId ? await getOrder(orderId) : null;
        if (order && order.status === "pending_payment") {
          await updateOrderStatus(order.id, "cancelled");
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const intentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (intentId) {
          // Cancelling reverses the loyalty points through the ledger.
          await getDb();
          const row = await sql.one<{ id: string; status: OrderStatus }>(
            "SELECT id, status FROM orders WHERE stripe_payment_intent = ?",
            [intentId]
          );
          if (row && row.status !== "cancelled" && row.status !== "picked_up") {
            await updateOrderStatus(row.id, "cancelled");
          }
        }
        break;
      }

      default:
        break;
    }
  } catch (error) {
    // Returning 500 tells Stripe to retry, which is what we want for a
    // transient failure. The signature was already verified at this point.
    console.error(`Webhook handler failed for ${event.type}:`, error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
