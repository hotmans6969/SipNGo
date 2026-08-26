import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateOrderStatus, getOrder, getOrderByQrToken, OrderError } from "@/lib/orders";
import { parseBody, adminUpdateOrderSchema } from "@/lib/validation";
import { notifyUser, customerStatusMessage } from "@/lib/push";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "staff")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { data, error } = await parseBody(request, adminUpdateOrderSchema);
    if (error) return error;

    // Pickup by QR scan: the token must belong to this order.
    if (data.qrToken) {
      const scanned = await getOrderByQrToken(data.qrToken);
      if (!scanned || scanned.id !== id) {
        return NextResponse.json({ error: "Invalid QR code" }, { status: 400 });
      }
      const updated = await updateOrderStatus(id, "picked_up");
      return NextResponse.json({ order: updated });
    }

    if (!(await getOrder(id))) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // updateOrderStatus enforces the allowed transitions.
    const updated = await updateOrderStatus(id, data.status!);

    // Delivered even with the customer's app closed. A failure here must not
    // fail the status change the counter just made.
    const message = customerStatusMessage(updated.status, updated.order_number);
    if (message) {
      await notifyUser(updated.user_id, {
        ...message,
        url: `/orders/${updated.id}`,
      }).catch(() => {});
    }

    return NextResponse.json({ order: updated });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admin update order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
