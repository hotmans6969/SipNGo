import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getOrderWithItems,
  setOrderPaymentMethod,
  updateOrderStripeSession,
  updateOrderStatus,
  OrderError,
} from "@/lib/orders";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { isPaymentSimulated } from "@/lib/env";
import { CURRENCY } from "@/lib/format";
import { parseBody, checkoutSchema } from "@/lib/validation";
import { notifyStaff } from "@/lib/push";
import { stripeMethodTypesFor } from "@/lib/payment-methods";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await parseBody(request, checkoutSchema);
    if (error) return error;

    const order = await getOrderWithItems(data.orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (order.status !== "pending_payment") {
      return NextResponse.json({ error: "This order has already been paid" }, { status: 409 });
    }

    const orderNumber = String(order.order_number).padStart(3, "0");

    // The choice is recorded before anything is acted on, so an abandoned
    // card checkout still leaves a record of what was attempted.
    await setOrderPaymentMethod(order.id, data.method);

    // Paying at the counter deliberately settles nothing. The order is placed
    // and the kitchen can see it coming, but it stays at pending_payment until
    // somebody takes the money and marks it paid — which is also what awards
    // the points, so nothing is earned on a drink that was never paid for.
    if (data.method === "counter") {
      await notifyStaff({
        title: "Counter payment 🧾",
        body: `Order #${orderNumber} is being paid for at the counter.`,
        url: "/admin",
        tag: `counter-order-${order.id}`,
      }).catch(() => {});

      return NextResponse.json({
        mode: "counter",
        orderId: order.id,
        message: "Order placed. Pay at the counter when you collect it.",
      });
    }

    // Simulated payment is only reachable outside production; isPaymentSimulated
    // throws if a production deploy is missing its Stripe key, rather than
    // quietly handing out free orders.
    if (isPaymentSimulated()) {
      await updateOrderStatus(order.id, "paid");
      // Never let a notification failure break a paid order.
      await notifyStaff({
        title: "New order 🧾",
        body: `Order #${orderNumber} has been paid and needs making.`,
        url: "/admin",
        tag: `new-order-${order.id}`,
      }).catch(() => {});
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
      // The wallet list is configurable, so it is a plain string array here
      // and Stripe validates it for real when the session is created.
      payment_method_types: stripeMethodTypesFor(
        data.method
      ) as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
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
      metadata: { order_id: order.id, user_id: user.id, payment_method: data.method },
    });

    await updateOrderStripeSession(order.id, session.id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    // Stripe rejects a session asking for a method the account has not turned
    // on. That is a configuration problem, not a fault the customer can do
    // anything about, so it is worth saying so rather than "try again".
    if (
      error instanceof Error &&
      /payment_method_types|invalid.*payment method|not activated/i.test(error.message)
    ) {
      console.error("Checkout payment method error:", error);
      return NextResponse.json(
        {
          error:
            "That payment method is not available right now. Please choose another, " +
            "or pay at the counter.",
        },
        { status: 400 }
      );
    }

    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
