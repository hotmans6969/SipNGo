import webpush from "web-push";
import getDb from "./db";
import { sql } from "./sql";

/**
 * Web Push delivery.
 *
 * This is the part that works with the app closed. The in-app banner and the
 * `new Notification()` calls it replaced only ever fired while a page was open
 * and polling; a push message is delivered by the browser's push service to
 * the service worker, so it arrives with the app shut and the screen off.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Where tapping the notification should land. */
  url?: string;
  /** Collapses replaced notifications, e.g. successive updates to one order. */
  tag?: string;
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

let configured = false;

/** True when VAPID keys are present. Push is optional; the app runs without it. */
export function isPushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configure(): void {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@sipngo.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export async function saveSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  await getDb();
  // A device that re-subscribes gets the same endpoint back, so this is an
  // upsert rather than an insert — and re-pointing it at the current user
  // matters on a shared phone.
  await sql.run(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth`,
    [subscription.endpoint, userId, subscription.keys.p256dh, subscription.keys.auth]
  );
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await getDb();
  await sql.run("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
}

async function subscriptionsFor(userIds: string[]): Promise<SubscriptionRow[]> {
  if (userIds.length === 0) return [];
  const placeholders = userIds.map(() => "?").join(",");
  return sql.all<SubscriptionRow>(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`,
    userIds
  );
}

/**
 * Sends to every device belonging to the given users.
 *
 * Failures never propagate: a notification that cannot be delivered must not
 * fail the order it was reporting on. A subscription the push service rejects
 * as gone (404/410) is deleted, which is the documented way to keep the table
 * from filling with dead endpoints.
 */
async function sendTo(userIds: string[], payload: PushPayload): Promise<number> {
  if (!isPushConfigured()) return 0;
  await getDb();
  configure();

  const subscriptions = await subscriptionsFor(userIds);
  if (subscriptions.length === 0) return 0;

  const body = JSON.stringify(payload);
  let delivered = 0;

  await Promise.all(
    subscriptions.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body
        );
        delivered++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await deleteSubscription(row.endpoint).catch(() => {});
        } else {
          console.error("Push delivery failed:", status ?? error);
        }
      }
    })
  );

  return delivered;
}

/** Notifies one customer about their own order. */
export async function notifyUser(userId: string, payload: PushPayload): Promise<number> {
  return sendTo([userId], payload);
}

/** Notifies everyone who works the counter. */
export async function notifyStaff(payload: PushPayload): Promise<number> {
  if (!isPushConfigured()) return 0;
  await getDb();
  const staff = await sql.all<{ id: string }>(
    "SELECT id FROM users WHERE role IN ('admin', 'staff')"
  );
  return sendTo(
    staff.map((s) => s.id),
    payload
  );
}

/** Wording for each status a customer is told about. */
export function customerStatusMessage(
  status: string,
  orderNumber: number
): PushPayload | null {
  const number = String(orderNumber).padStart(3, "0");
  switch (status) {
    case "preparing":
      return {
        title: "Order preparing ☕",
        body: `Order #${number} has been accepted and is being made.`,
        tag: `order-${orderNumber}`,
      };
    case "ready":
      return {
        title: "Order ready for pickup! 🎉",
        body: `Order #${number} is waiting at the counter. Show your QR code.`,
        tag: `order-${orderNumber}`,
      };
    case "cancelled":
      return {
        title: "Order cancelled",
        body: `Order #${number} has been cancelled.`,
        tag: `order-${orderNumber}`,
      };
    default:
      return null;
  }
}
