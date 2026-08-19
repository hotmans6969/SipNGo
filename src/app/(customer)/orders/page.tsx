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
  const { user, logout, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{title: string, message: string} | null>(null);
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  // Ask for notification permission via a manual request mechanism, but let's 
  // also rely on our in-app toast for a 100% reliable fallback!
  const requestNotificationPermission = () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }

    let prevOrders: Order[] = [];

    const fetchOrders = () => {
      fetch("/api/orders")
        .then((res) => res.json())
        .then((data) => {
          const freshOrders = data.orders || [];
          
          // Check for status changes
          if (prevOrders.length > 0) {
            freshOrders.forEach((newOrder: Order) => {
              const oldOrder = prevOrders.find((o) => o.id === newOrder.id);
              if (oldOrder && oldOrder.status !== newOrder.status) {
                let title = "";
                let body = "";
                
                if (newOrder.status === "preparing") {
                  title = "Order Preparing! 👩🍳";
                  body = `Order #${newOrder.order_number} has been accepted and is now being prepared.`;
                } else if (newOrder.status === "ready") {
                  title = "Order Ready! ☕";
                  body = `Your order #${newOrder.order_number} is ready for pickup!`;
                }

                if (title) {
                  // 1. Show in-app Toast overlay (works 100% of the time)
                  setToast({ title, message: body });
                  setTimeout(() => setToast(null), 5000);

                  // 2. Try OS-level Push Notification if permitted
                  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                    new Notification(title, { body });
                  }
                }
              }
            });
          }
          
          prevOrders = freshOrders;
          setOrders(freshOrders);
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
    <div className="max-w-3xl mx-auto px-4 py-8 relative">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 bg-stone-900 text-white p-5 rounded-2xl shadow-2xl z-50 animate-bounce-short border border-stone-700">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h4 className="font-bold text-lg text-amber-400 mb-1">{toast.title}</h4>
              <p className="text-sm opacity-90">{toast.message}</p>
            </div>
            <button onClick={() => setToast(null)} className="text-stone-400 hover:text-white">✕</button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-stone-900">My Orders</h1>
        <div className="flex gap-2">
          {(user?.role === "admin" || user?.role === "staff") && (
            <Link 
              href="/admin"
              className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-full font-medium hover:bg-amber-600"
            >
              Dashboard
            </Link>
          )}
          {typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted" && (
            <button 
              onClick={requestNotificationPermission}
              className="text-xs bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full font-medium hover:bg-amber-200"
            >
              Push Notifications
            </button>
          )}
          <button 
            onClick={handleLogout}
            className="text-xs bg-stone-200 text-stone-700 px-3 py-1.5 rounded-full font-medium hover:bg-stone-300"
          >
            Logout
          </button>
        </div>
      </div>

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
