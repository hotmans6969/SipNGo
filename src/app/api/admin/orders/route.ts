import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAllOrders } from "@/lib/orders";
import { parseQuery, orderQuerySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "staff")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = parseQuery(request, orderQuerySchema);
    if (error) return error;

    const { orders, total } = getAllOrders({
      status: data.status,
      date: data.date,
      limit: data.limit,
      offset: data.offset,
    });

    return NextResponse.json({ orders, total, limit: data.limit, offset: data.offset });
  } catch (error) {
    console.error("Admin get orders error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
