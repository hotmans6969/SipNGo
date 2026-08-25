import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getOrderWithItems,
  updateOrderStripeSession,
  updateOrderStatus,
  OrderError,
} from "@/lib/orders";
import { getStripe } from "@/lib/stripe";
import { isPaymentSimulated } from "@/lib/env";
import { CURRENCY } from "@/lib/format";
import { parseBody, checkoutSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await parseBody(request, checkoutSchema);
    if (error) return error;

    const order = getOrderWithItems(data.orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (order.status !== "pending_payment") {
      return NextResponse.json({ error: "This order has already been paid" }, { status: 409 });
    }

    // Simulated payment is only reachable outside production; isPaymentSimulated
    // throws if a production deploy is missing its Stripe key, rather than
    // quietly handing out free orders.
    if (isPaymentSimulated()) {
      updateOrderStatus(order.id, "paid");
      return NextResponse.json({
        success: true,
        mode: "demo",
        message: "Payment simulated (Stripe not configured). Order is now paid.",
        orderId: order.id,
      });
    }

    const stripe = getStripe();

    // Built from our own configured URL, not a client-supplied Origin header.
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
      /\/$/,
      ""
    );

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: order.items.map((item) => ({
        price_data: {
          currency: CURRENCY,
          product_data: { name: item.name },
          unit_amount: item.price_cents,
        },
        quantity: item.quantity,
      })),
      mode: "payment",
      success_url: `${appUrl}/orders/${order.id}?payment=success`,
      cancel_url: `${appUrl}/orders/${order.id}?payment=cancelled`,
      // Used to reconcile the webhook back to this order.
      client_reference_id: order.id,
      metadata: { order_id: order.id, user_id: user.id },
    });

    updateOrderStripeSession(order.id, session.id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
