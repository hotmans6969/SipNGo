import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth";
import { getOrderWithItems } from "@/lib/orders";

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

    if (user.role === "customer" && order.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!order.qr_token) {
      return NextResponse.json({ error: "QR code not available" }, { status: 400 });
    }

    // Only generate QR for paid/preparing/ready orders
    if (order.status === "pending_payment" || order.status === "cancelled") {
      return NextResponse.json({ error: "QR code not available for this order status" }, { status: 400 });
    }

    // Generate QR code as data URL
    const qrData = JSON.stringify({
      orderId: order.id,
      orderNumber: order.order_number,
      qrToken: order.qr_token,
    });

    const qrDataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });

    return NextResponse.json({
      qrCode: qrDataUrl,
      orderNumber: order.order_number,
      status: order.status,
    });
  } catch (error) {
    console.error("QR code generation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
