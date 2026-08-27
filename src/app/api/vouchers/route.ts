import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, getUserFromDb } from "@/lib/auth";
import { getAllVouchers, redeemPoints, REWARDS, VoucherError } from "@/lib/vouchers";
import { parseBody } from "@/lib/validation";

const redeemSchema = z.object({
  rewardId: z.string().min(1).max(40),
});

/** The customer's vouchers, their points, and what those points can buy. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [vouchers, dbUser] = await Promise.all([
      getAllVouchers(user.id),
      getUserFromDb(user.id),
    ]);

    return NextResponse.json({
      points: dbUser?.points ?? 0,
      vouchers,
      rewards: REWARDS,
    });
  } catch (error) {
    console.error("Vouchers fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Spends points on a reward. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await parseBody(request, redeemSchema);
    if (error) return error;

    const voucher = await redeemPoints(user.id, data.rewardId);
    return NextResponse.json({ voucher }, { status: 201 });
  } catch (error) {
    // Not having enough points is the customer's business, not a fault.
    if (error instanceof VoucherError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Redeem error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
