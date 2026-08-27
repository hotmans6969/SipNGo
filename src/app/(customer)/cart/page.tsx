"use client";

import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { formatToppings } from "@/lib/toppings";
import { discountFor, type VoucherRow } from "@/lib/rewards";
import { formatMalaysiaTime } from "@/lib/dates";
import StatusBadge from "@/components/StatusBadge";
import { usePolling } from "@/hooks/usePolling";

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
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [voucherId, setVoucherId] = useState<string | null>(null);
  const router = useRouter();


  const fetchOrdersRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchOrders = () => {
      fetch("/api/orders")
        .then((res) => res.json())
        .then((data) => {
          const freshOrders = data.orders || [];
          
          // Status-change notifications are delivered by the service worker
          // from a push message, which works with the app closed. Raising one
          // here as well would duplicate it whenever this page happened to be
          // open.

          setOrders(freshOrders);
        })
        .catch(() => {});
    };

    fetchOrders();
    fetchOrdersRef.current = fetchOrders;

    // Only vouchers that can still be spent are offered.
    fetch("/api/vouchers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const usable = (data.vouchers as VoucherRow[]).filter(
          (v) =>
            !v.redeemed_at &&
            (!v.expires_at || new Date(v.expires_at.replace(" ", "T") + "Z") > new Date())
        );
        setVouchers(usable);
      })
      .catch(() => {});
  }, [user]);

  // Polling pauses while the tab is hidden.
  usePolling(() => fetchOrdersRef.current?.(), 5000, !!user);

  // Anything still moving through the counter. Collected and cancelled orders
  // belong in history, not on the page you watch while you wait.
  // The discount shown here is computed with the same function the server
  // uses, so the figure on the button is the figure that gets charged.
  const chosenVoucher = vouchers.find((v) => v.id === voucherId) ?? null;
  const discountCents = chosenVoucher
    ? discountFor(chosenVoucher, items.map((i) => i.priceCents), totalCents)
    : 0;
  const payableCents = Math.max(0, totalCents - discountCents);

  const ONGOING = ["pending_payment", "paid", "preparing", "ready"];
  const ongoing = orders.filter((o) => ONGOING.includes(o.status));

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
          // Every choice has to travel with the line. Sending only the id and
          // quantity silently discarded temperature, sugar, remarks and
          // toppings, so the drink made was not the drink ordered and no
          // surcharge was ever applied.
          voucherId: voucherId ?? undefined,
          items: items.map((i) => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            sugarLevel: i.sugarLevel,
            temperature: i.temperature,
            remark: i.remark || undefined,
            toppings: i.toppings?.length ? i.toppings : undefined,
          })),
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
      <h1 className="text-3xl font-bold text-stone-900 mb-6">Orders</h1>

      <h2 className="text-lg font-bold text-stone-900 mb-3">Your cart</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {totalItems === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-stone-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          <p className="text-stone-500 mb-4">Nothing in your cart yet</p>
          <Link
            href="/menu"
            className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold px-5 py-2.5 rounded-lg transition-all active:scale-95"
          >
            Browse menu
          </Link>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100 stagger-children">
            {items.map((item) => (
              <div key={item.id} className="p-5 flex items-center gap-4 transition-colors hover:bg-stone-50/60">
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
                    {item.toppings && item.toppings.length > 0 && (
                      <p className="text-xs">
                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                          + {formatToppings(item.toppings)}
                        </span>
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
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-stone-300 text-stone-600 hover:bg-stone-50 transition-all active:scale-90"
                  >
                    -
                  </button>
                  <span key={item.quantity} className="w-8 text-center font-semibold text-stone-900 animate-pop">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-all active:scale-90"
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={() => removeItem(item.id)}
                  className="text-stone-400 hover:text-red-500 transition-all hover:scale-110 active:scale-90 ml-2"
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
            {vouchers.length > 0 && (
              <div className="mb-4 pt-4 border-t border-stone-100">
                <p className="text-sm font-semibold text-stone-700 mb-2">Apply a voucher</p>
                <div className="space-y-2">
                  {vouchers.map((voucher) => {
                    const selected = voucherId === voucher.id;
                    return (
                      <button
                        key={voucher.id}
                        onClick={() => setVoucherId(selected ? null : voucher.id)}
                        aria-pressed={selected}
                        className={`w-full text-left p-3 rounded-xl border transition-all active:scale-[0.99] flex items-center gap-3 ${
                          selected
                            ? "border-amber-500 bg-amber-50 ring-1 ring-amber-500"
                            : "border-stone-200 hover:bg-stone-50"
                        }`}
                      >
                        <span className="text-xl" aria-hidden="true">
                          {voucher.kind === "free_drink" ? "🎁" : "🎟️"}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium text-stone-900 truncate">
                            {voucher.label}
                          </span>
                          {voucher.expires_at && (
                            <span className="block text-xs text-stone-400">
                              Use by {voucher.expires_at.slice(0, 10)}
                            </span>
                          )}
                        </span>
                        {selected && <span className="text-amber-600 font-bold">✓</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-stone-400 mt-2">One voucher per order.</p>
              </div>
            )}

            {discountCents > 0 && (
              <div className="flex justify-between items-center mb-4 text-green-700 animate-fade-in">
                <span className="text-sm font-medium">Voucher</span>
                <span className="font-semibold">−{formatPrice(discountCents)}</span>
              </div>
            )}

            <div className="flex justify-between items-center mb-6 pt-4 border-t border-stone-100">
              <span className="text-lg font-bold text-stone-900">Total</span>
              <span className="text-lg font-bold text-amber-600">
                {formatPrice(payableCents)}
              </span>
            </div>

            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold text-lg rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {loading
                ? "Processing..."
                : !user
                  ? "Login to Checkout"
                  : payableCents === 0
                    ? "Place order — free"
                    : `Pay ${formatPrice(payableCents)}`}
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

      <section className="mt-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-bold text-stone-900">Ongoing orders</h2>
          {ongoing.length > 0 && (
            <span className="text-sm text-stone-400">
              {ongoing.length} in progress
            </span>
          )}
        </div>

        {!user ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
            <p className="text-stone-500 mb-4">Log in to follow your orders</p>
            <Link
              href="/auth/login"
              className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold px-5 py-2.5 rounded-lg transition-all active:scale-95"
            >
              Log in
            </Link>
          </div>
        ) : ongoing.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
            <p className="text-stone-500">No orders in progress</p>
            <p className="text-sm text-stone-400 mt-1">
              Anything you order will show here until you collect it.
            </p>
          </div>
        ) : (
          <div className="space-y-3 stagger-children">
            {ongoing.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="block bg-white rounded-2xl border border-stone-200 p-5 hover:shadow-md hover:border-amber-200 transition-all duration-200 active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-bold text-stone-900">
                      Order #{String(order.order_number).padStart(3, "0")}
                    </p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {formatMalaysiaTime(order.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <p className="text-sm text-stone-500 truncate">
                  {order.items
                    .map((i) => `${i.quantity}x ${i.name}`)
                    .join(", ")}
                </p>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-100">
                  <span className="font-semibold text-amber-600">
                    {formatPrice(order.total_cents)}
                  </span>
                  <span className="text-sm text-stone-400">
                    {order.status === "ready" ? "Ready — show your QR" : "View details →"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

