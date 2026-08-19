"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMalaysiaDateTime } from "@/lib/dates";

interface OrderItem {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
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
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const fetchOrders = () => {
      fetch("/api/orders")
        .then((res) => res.json())
        .then((data) => {
          setOrders(data.orders || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };

    fetchOrders(); // Initial fetch
    
    // Poll every 2 seconds for live updates
    const interval = setInterval(fetchOrders, 2000);
    return () => clearInterval(interval);
  }, [user, authLoading, router]);

  const formatPrice = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;

  if (authLoading || loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-stone-200 rounded w-48" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-stone-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border border-stone-200 p-12">
          <h2 className="text-xl font-semibold text-stone-700 mb-2">No orders yet</h2>
          <p className="text-stone-400 mb-6">Place your first order from our menu</p>
          <Link
            href="/menu"
            className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Browse Menu
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-6">My Orders</h1>

      <div className="space-y-4">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/orders/${order.id}`}
            className="block bg-white rounded-xl border border-stone-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-stone-900">
                    Order #{String(order.order_number).padStart(3, "0")}
                  </span>
                  <StatusBadge status={order.status} />
                </div>
                <p className="text-sm text-stone-400 mt-1">
                  {formatMalaysiaDateTime(order.created_at)}
                </p>
              </div>
              <span className="font-bold text-amber-600 text-lg">{formatPrice(order.total_cents)}</span>
            </div>

            <div className="text-sm text-stone-500">
              {order.items.map((item) => (
                <span key={item.id} className="inline-block mr-3">
                  {item.quantity}x {item.name}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
