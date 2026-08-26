import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { saveSubscription, deleteSubscription, isPushConfigured } from "@/lib/push";
import { parseBody } from "@/lib/validation";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
});

/** Registers this device to receive push notifications for the signed-in user. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isPushConfigured()) {
      return NextResponse.json(
        { error: "Push notifications are not configured on this deployment" },
        { status: 503 }
      );
    }

    const { data, error } = await parseBody(request, subscribeSchema);
    if (error) return error;

    await saveSubscription(user.id, data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push subscribe error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Removes this device. Called when a user turns notifications off. */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await parseBody(request, unsubscribeSchema);
    if (error) return error;

    await deleteSubscription(data.endpoint);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
