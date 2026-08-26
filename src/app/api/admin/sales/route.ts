import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getSalesSummary } from "@/lib/sales";
import { parseQuery } from "@/lib/validation";

const salesQuerySchema = z.object({
  period: z.enum(["today", "week", "month"]).default("today"),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== "admin" && user.role !== "staff")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = parseQuery(request, salesQuerySchema);
    if (error) return error;

    const summary = await getSalesSummary(data.period);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Sales summary error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
