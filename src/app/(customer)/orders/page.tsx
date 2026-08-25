"use client";

import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { formatMalaysiaDateTime } from "@/lib/dates";
import { formatPrice } from "@/lib/format";

interface OrderItem {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  sugar_level?: string;
  temperature?: string;
  remark?: string;
}

interface Order {
  id: string;
  order_number: number;
  order_date: string;
  status: string;
  total_cents: number;
  created_at: string;
  items: OrderItem[];
}

export default function OrdersPage() {
  const { user } = useAuth();
  // `null` means "not fetched yet", which lets loading be derived rather than
  // tracked in a second piece of state that has to be set from inside an effect.
  const [fetchedOrders, setFetchedOrders] = useState<Order[] | null>(null);
  const orders = fetchedOrders ?? [];
  const loading = !!user && fetchedOrders === null;

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    fetch("/api/orders")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setFetchedOrders(data.orders || []);
      })
      .catch(() => {
        if (!cancelled) setFetchedOrders([]);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);


  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-stone-900 mb-6">Order History</h1>
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
        <p className="text-stone-500 mb-6">You need to be logged in to view your order history.</p>
        <Link href="/auth/login" className="bg-amber-500 text-white px-6 py-2 rounded-lg font-semibold inline-block">
          Login
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-6 flex items-center justify-between">
        Order History
        <Link href="/account" className="text-sm text-stone-500 font-normal hover:text-stone-700 underline">Back to Account</Link>
      </h1>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-stone-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h2 className="text-xl font-semibold text-stone-700 mb-2">No orders yet</h2>
          <p className="text-stone-400 mb-6">When you place orders, they will appear here</p>
          <Link
            href="/menu"
            className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Start Ordering
          </Link>
        </div>
      ) : (
        <div className="space-y-4 stagger-children">
          {orders.map((order) => (
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
                <span className="text-stone-500 truncate max-w-[70%]">
                  {order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                </span>
                  <span className="text-amber-500 font-medium whitespace-nowrap">View Details &rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}