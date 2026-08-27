import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createOrder, getUserOrders, OrderError } from "@/lib/orders";
import { VoucherError } from "@/lib/vouchers";
import { parseBody, parseQuery, createOrderSchema, orderQuerySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = parseQuery(request, orderQuerySchema);
    if (error) return error;

    const orders = await getUserOrders(user.id, { limit: data.limit, offset: data.offset });
    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Get orders error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await parseBody(request, createOrderSchema);
    if (error) return error;

    const order = await createOrder(user.id, data.items, data.voucherId);
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    // Only OrderError carries a message meant for the customer. Anything else
    // is an internal fault and must not be echoed back.
    if (error instanceof OrderError || error instanceof VoucherError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Create order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
