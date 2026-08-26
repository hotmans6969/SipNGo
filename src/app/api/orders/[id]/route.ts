import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrderWithItems, updateOrderStatus, OrderError } from "@/lib/orders";
import { customerCanCancel } from "@/lib/order-status";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const order = await getOrderWithItems(id);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Customers can only see their own orders.
    if (user.role === "customer" && order.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("Get order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Customer-initiated cancellation. Allowed only before the drink is being
 * made; once it is `preparing` the customer has to talk to staff.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const order = await getOrderWithItems(id);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (order.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!customerCanCancel(order.status)) {
      return NextResponse.json(
        { error: "This order is already being prepared and can no longer be cancelled." },
        { status: 409 }
      );
    }

    // A paid order that is cancelled still needs its refund issued in Stripe.
    // That is deliberately a staff action, not an automatic one.
    const updated = await updateOrderStatus(id, "cancelled");
    return NextResponse.json({
      order: updated,
      refundRequired: order.status === "paid",
    });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Cancel order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
