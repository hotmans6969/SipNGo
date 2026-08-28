"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PAYING_ORDER_KEY } from "@/lib/paying-order";

/**
 * Where a hosted Stripe payment link sends the customer back to.
 *
 * A payment link's return URL is fixed in the Stripe dashboard and has
 * nowhere to carry an order id, so this reads the note the payment page left
 * before handing the customer over, and forwards them to that order — which
 * is where the pickup QR code is.
 *
 * It proves nothing about payment. Arriving here only means Stripe sent the
 * customer back; whether the money actually moved is settled by the webhook,
 * or by a member of staff. The order page shows the QR only once the order is
 * genuinely paid, so a customer who simply navigated here gains nothing.
 */
export default function PaymentReturnPage() {
  const router = useRouter();

  useEffect(() => {
    let orderId: string | null = null;
    try {
      orderId = localStorage.getItem(PAYING_ORDER_KEY);
    } catch {
      // Private browsing can refuse; the fallback below covers it.
    }

    // Deliberately not cleared here. React double-invokes this effect in
    // development: clearing on the way past meant the second run read nothing
    // and its fallback redirect — to the orders list rather than to the order
    // just paid for — landed last and won. The note is overwritten by the next
    // payment anyway, and the worst a stale one can do is show the customer
    // their own most recent order.
    router.replace(orderId ? `/orders/${orderId}?payment=success` : "/orders");
  }, [router]);

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="h-56 w-56 mx-auto skeleton rounded-2xl mb-6" />
      <p className="text-stone-500">Taking you back to your order…</p>
    </div>
  );
}
