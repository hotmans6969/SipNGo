"use client";

import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
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

export default function CartPage() {
  const { items, updateQuantity, removeItem, clearCart, totalCents, totalItems } = useCart();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const router = useRouter();

  const formatPrice = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;

  useEffect(() => {
    if (!user) return;

    let prevOrders: Order[] = [];

    const fetchOrders = () => {
      fetch("/api/orders")
        .then((res) => res.json())
        .then((data) => {
          const freshOrders = data.orders || [];
          
          // Check for status changes
          if (prevOrders.length > 0 && typeof window !== "undefined" && window.Notification?.permission === "granted") {
            freshOrders.forEach((newOrder: Order) => {
              const oldOrder = prevOrders.find((o) => o.id === newOrder.id);
              if (oldOrder && oldOrder.status !== newOrder.status) {
                if (newOrder.status === "preparing") {
                  new Notification("Order Preparing! 👩🍳", { body: `Order #${newOrder.order_number} has been accepted and is now being prepared.` });
                } else if (newOrder.status === "ready") {
                  new Notification("Order Ready! ☕", { body: `Your order #${newOrder.order_number} is ready for pickup!` });
                }
              }
            });
          }
          
          prevOrders = freshOrders;
          setOrders(freshOrders);
        })
        .catch(() => {});
    };

    fetchOrders();
    const interval = setInterval(fetchOrders, 2000);
    return () => clearInterval(interval);
  }, [user]);

  const handleCheckout = async () => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    setError("");
    setLoading(true);

    try {
      // Step 1: Create order
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
        }),
      });

      if (!orderRes.ok) {
        const data = await orderRes.json();
        throw new Error(data.error || "Failed to create order");
      }

      const { order } = await orderRes.json();

      // Step 2: Initiate payment
      const checkoutRes = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });

      if (!checkoutRes.ok) {
        const data = await checkoutRes.json();
        throw new Error(data.error || "Failed to initiate payment");
      }

      const checkoutData = await checkoutRes.json();

      // Clear cart after successful order creation
      clearCart();

      if (checkoutData.url) {
        // Redirect to Stripe Checkout
        window.location.href = checkoutData.url;
      } else {
        // Demo mode - redirect to order page
        router.push(`/orders/${order.id}?payment=success`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-6">Your Cart</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {totalItems === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center mb-8">
          <svg className="w-16 h-16 mx-auto text-stone-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          <h2 className="text-xl font-semibold text-stone-700 mb-2">Your cart is empty</h2>
          <p className="text-stone-400 mb-6">Browse our menu to add items</p>
          <Link
            href="/menu"
            className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Browse Menu
          </Link>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
            {items.map((item) => (
              <div key={item.id} className="p-5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-stone-900 truncate">{item.name}</h3>
                  <div className="text-sm text-stone-500 capitalize leading-relaxed space-y-0.5 mt-1">
                    <p>{item.category}</p>
                    {(item.temperature || item.sugarLevel) && (
                      <p className="text-xs space-x-2">
                        {item.temperature && <span className="bg-stone-100 px-2 py-0.5 rounded-full">{item.temperature === "iced" ? "\u2744\uFE0F Iced" : "\u2615 Hot"}</span>}
                        {item.sugarLevel && <span className="bg-stone-100 px-2 py-0.5 rounded-full">{item.sugarLevel} sugar</span>}
                      </p>
                    )}
                    {item.remark && (
                      <p className="text-xs italic text-stone-400 mt-1">Note: {item.remark}</p>
                    )}
                  </div>
                  <p className="text-amber-600 font-semibold mt-2">
                    {formatPrice(item.priceCents * item.quantity)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50 transition-colors"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-semibold text-stone-900">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={() => removeItem(item.id)}
                  className="text-stone-400 hover:text-red-500 transition-colors ml-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 bg-white rounded-2xl border border-stone-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <span className="text-stone-600">Subtotal ({totalItems} items)</span>
              <span className="font-semibold text-stone-900">{formatPrice(totalCents)}</span>
            </div>
            <div className="flex justify-between items-center mb-6 pt-4 border-t border-stone-100">
              <span className="text-lg font-bold text-stone-900">Total</span>
              <span className="text-lg font-bold text-amber-600">{formatPrice(totalCents)}</span>
            </div>

            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold text-lg rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Processing..." : user ? `Pay ${formatPrice(totalCents)}` : "Login to Checkout"}
            </button>

            <button
              onClick={clearCart}
              className="w-full py-2 mt-3 text-sm text-stone-500 hover:text-red-500 transition-colors"
            >
              Clear Cart
            </button>
          </div>
        </>
      )}

    </div>
  );
}

