import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateOrderStatus, getOrderWithItems, getOrderByQrToken } from "@/lib/orders";

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
    const { status, qrToken } = await request.json();

    // If qrToken is provided, verify it matches and handle pickup
    if (qrToken) {
      const order = getOrderByQrToken(qrToken);
      if (!order || order.id !== id) {
        return NextResponse.json({ error: "Invalid QR code" }, { status: 400 });
      }
      if (order.status !== "ready") {
        return NextResponse.json(
          { error: `Cannot mark as picked up. Order status is: ${order.status}` },
          { status: 400 }
        );
      }
      const updated = updateOrderStatus(id, "picked_up");
      return NextResponse.json({ order: updated });
    }

    if (!status) {
      return NextResponse.json({ error: "Status is required" }, { status: 400 });
    }

    const validStatuses = ["paid", "preparing", "ready", "picked_up", "cancelled"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const order = getOrderWithItems(id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const updated = updateOrderStatus(id, status);
    return NextResponse.json({ order: updated });
  } catch (error) {
    console.error("Admin update order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
