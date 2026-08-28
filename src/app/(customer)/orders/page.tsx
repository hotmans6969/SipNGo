"use client";

import { useAuth } from "@/context/AuthContext";
import { useActiveOrders, type CustomerOrder } from "@/context/ActiveOrderContext";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { formatMalaysiaDateTime } from "@/lib/dates";
import { formatPrice } from "@/lib/format";

/**
 * Where a customer goes to find their order.
 *
 * Anything still being made is lifted to the top and said in plain words,
 * because the people most likely to be waiting at the counter wondering are
 * the least likely to go looking for it three taps deep under Account. Past
 * orders keep the compact treatment below.
 */
const PROGRESS: Record<string, { headline: string; detail: string; tone: string }> = {
  pending_payment: {
    headline: "Waiting for payment",
    detail: "Finish paying and we will start making it.",
    tone: "border-yellow-300 bg-yellow-50",
  },
  paid: {
    headline: "Order received",
    detail: "The counter has your order and will start it shortly.",
    tone: "border-blue-300 bg-blue-50",
  },
  preparing: {
    headline: "Being made now",
    detail: "Your drink is on the counter being prepared.",
    tone: "border-orange-300 bg-orange-50",
  },
  ready: {
    headline: "Ready to collect",
    detail: "Show your QR code at the counter to pick it up.",
    tone: "border-green-400 bg-green-50",
  },
};

function itemSummary(order: CustomerOrder): string {
  return order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ");
}

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { orders, active, loaded } = useActiveOrders();

  const past = orders.filter((o) => !active.some((a) => a.id === o.id));
  const loading = !!user && !loaded;

  if (authLoading || loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-stone-900 mb-6">My Orders</h1>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 skeleton rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center pt-20">
        <h2 className="text-2xl font-semibold text-stone-700 mb-4">Please Login</h2>
        <p className="text-stone-500 mb-6">You need to be logged in to view your orders.</p>
        <Link href="/auth/login" className="bg-amber-500 text-white px-6 py-2 rounded-lg font-semibold inline-block">
          Login
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-6">My Orders</h1>

      <section className="mb-10">
        <h2 className="text-lg font-bold text-stone-900 mb-3">Happening now</h2>

        {active.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
            <p className="text-stone-500">Nothing being made right now</p>
            <p className="text-sm text-stone-400 mt-1">
              Anything you order will show here until you collect it.
            </p>
          </div>
        ) : (
          <div className="space-y-3 stagger-children">
            {active.map((order) => {
              const progress = PROGRESS[order.status];
              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className={`block rounded-2xl border-2 p-5 transition-all duration-200 hover:shadow-md active:scale-[0.99] ${
                    progress?.tone ?? "border-stone-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-xl font-bold text-stone-900">
                        {progress?.headline ?? "In progress"}
                      </p>
                      <p className="text-sm text-stone-600 mt-1">
                        {progress?.detail}
                      </p>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>

                  <p className="text-sm text-stone-600 truncate">{itemSummary(order)}</p>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-900/10">
                    <span className="text-sm text-stone-500">
                      Order #{String(order.order_number).padStart(3, "0")}
                    </span>
                    <span className="text-sm font-semibold text-stone-900">
                      View details &rarr;
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold text-stone-900 mb-3">Past orders</h2>

        {past.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-stone-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-xl font-semibold text-stone-700 mb-2">No past orders</h3>
            <p className="text-stone-400 mb-6">Once you collect an order it will appear here</p>
            <Link
              href="/menu"
              className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Start Ordering
            </Link>
          </div>
        ) : (
          <div className="space-y-4 stagger-children">
            {past.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="block bg-white rounded-xl border border-stone-200 p-5 hover:shadow-md transition-shadow transform hover:-translate-y-0.5 duration-200"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-stone-900">
                        Order #{String(order.order_number).padStart(3, "0")}
                      </span>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-sm text-stone-500 mt-1">
                      {formatMalaysiaDateTime(order.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-600 text-lg">
                      {formatPrice(order.total_cents)}
                    </p>
                    <p className="text-xs text-stone-500 mt-1">
                      {order.items.reduce((sum, item) => sum + item.quantity, 0)} items
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-sm">
                  <span className="text-stone-500 truncate max-w-[70%]">{itemSummary(order)}</span>
                  <span className="text-amber-500 font-medium whitespace-nowrap">View Details &rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
