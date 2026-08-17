import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrderWithItems, updateOrderStripeSession, updateOrderStatus } from "@/lib/orders";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = await request.json();

    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
    }

    const order = getOrderWithItems(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (order.status !== "pending_payment") {
      return NextResponse.json({ error: "Order has already been paid" }, { status: 400 });
    }

    // If Stripe is not configured, simulate payment (dev mode)
    if (!isStripeConfigured()) {
      updateOrderStatus(orderId, "paid");
      return NextResponse.json({
        success: true,
        mode: "demo",
        message: "Payment simulated (Stripe not configured). Order is now paid.",
        orderId: order.id,
      });
    }

    // Create Stripe Checkout Session
    const stripe = getStripe();
    const origin = request.headers.get("origin") || "http://localhost:3000";

    const lineItems = order.items.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name,
        },
        unit_amount: item.price_cents,
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/orders/${order.id}?payment=success`,
      cancel_url: `${origin}/orders/${order.id}?payment=cancelled`,
      metadata: {
        order_id: order.id,
        user_id: user.id,
      },
    });

    updateOrderStripeSession(orderId, session.id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
