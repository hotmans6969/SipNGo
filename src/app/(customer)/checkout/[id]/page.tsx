"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useActiveOrders } from "@/context/ActiveOrderContext";
import { formatPrice } from "@/lib/format";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_INFO,
  type PaymentMethod,
} from "@/lib/payment-methods";

interface OrderItem {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
}

interface Order {
  id: string;
  order_number: number;
  status: string;
  total_cents: number;
  discount_cents: number;
  items: OrderItem[];
}

/**
 * Choosing how to pay for an order that has already been placed.
 *
 * Split from the cart on purpose. The order exists before this screen is
 * reached, so a customer who closes the tab mid-payment has not lost it —
 * they can come back through Orders and settle it later, which is the same
 * path someone who chose to pay at the counter takes.
 */
export default function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const { refresh: refreshOrders } = useActiveOrders();
  const router = useRouter();

  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    fetch(`/api/orders/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (!data?.order) {
          setNotFound(true);
          return;
        }
        setOrder(data.order);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  const pay = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id, method }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Payment could not be started. Please try again.");
        setBusy(false);
        return;
      }

      refreshOrders();

      // A card or wallet payment leaves the app for Stripe. Everything else
      // lands back on the order, where the status is already correct.
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      router.replace(`/orders/${id}?payment=${data.mode === "counter" ? "counter" : "success"}`);
    } catch {
      setError("Payment could not be started. Please try again.");
      setBusy(false);
    }
  }, [id, method, refreshOrders, router]);

  if (authLoading || (user && !order && !notFound)) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="h-8 w-40 skeleton rounded-lg mb-6" />
        <div className="h-28 skeleton rounded-2xl mb-4" />
        <div className="h-64 skeleton rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 text-center pt-20">
        <h2 className="text-2xl font-semibold text-stone-700 mb-4">Please Login</h2>
        <p className="text-stone-500 mb-6">You need to be logged in to pay for an order.</p>
        <Link
          href="/auth/login"
          className="bg-amber-500 text-white px-6 py-2 rounded-lg font-semibold inline-block"
        >
          Login
        </Link>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 text-center pt-20">
        <h2 className="text-2xl font-semibold text-stone-700 mb-4">Order not found</h2>
        <Link
          href="/orders"
          className="bg-amber-500 text-white px-6 py-2 rounded-lg font-semibold inline-block"
        >
          My orders
        </Link>
      </div>
    );
  }

  // An order that is already paid for has nothing to do here.
  if (order.status !== "pending_payment") {
    return (
      <div className="max-w-md mx-auto px-4 py-8 text-center pt-20">
        <span className="text-5xl block mb-4" aria-hidden="true">
          ✅
        </span>
        <h2 className="text-2xl font-semibold text-stone-700 mb-2">Already paid</h2>
        <p className="text-stone-500 mb-6">
          Order #{String(order.order_number).padStart(3, "0")} has been paid for.
        </p>
        <Link
          href={`/orders/${order.id}`}
          className="bg-amber-500 text-white px-6 py-3 rounded-lg font-semibold inline-block"
        >
          View order
        </Link>
      </div>
    );
  }

  const chosen = PAYMENT_METHOD_INFO[method];

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-1">Payment</h1>
      <p className="text-stone-500 mb-6">
        Order #{String(order.order_number).padStart(3, "0")}
      </p>

      <div className="bg-stone-900 text-white rounded-2xl p-5 mb-6">
        <div className="space-y-1.5 mb-4">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-3 text-sm">
              <span className="text-stone-300 truncate">
                {item.quantity}&times; {item.name}
              </span>
              <span className="shrink-0 text-stone-300">
                {formatPrice(item.price_cents * item.quantity)}
              </span>
            </div>
          ))}
        </div>
        {order.discount_cents > 0 && (
          <div className="flex justify-between text-sm text-green-400 pb-3">
            <span>Voucher</span>
            <span>&minus;{formatPrice(order.discount_cents)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-4 border-t border-white/15">
          <span className="font-semibold">Total to pay</span>
          <span className="text-2xl font-black text-amber-400">
            {formatPrice(order.total_cents)}
          </span>
        </div>
      </div>

      <h2 className="font-bold text-stone-900 mb-3">How would you like to pay?</h2>

      <div className="space-y-3 mb-6" role="radiogroup" aria-label="Payment method">
        {PAYMENT_METHODS.map((option) => {
          const info = PAYMENT_METHOD_INFO[option];
          const selected = method === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMethod(option)}
              className={`w-full text-left p-4 rounded-2xl border-2 transition-all active:scale-[0.99] flex items-center gap-4 ${
                selected
                  ? "border-amber-500 bg-amber-50"
                  : "border-stone-200 bg-white hover:bg-stone-50"
              }`}
            >
              <span className="text-3xl shrink-0" aria-hidden="true">
                {info.glyph}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-stone-900">{info.label}</span>
                <span className="block text-sm text-stone-500 mt-0.5">{info.blurb}</span>
              </span>
              <span
                aria-hidden="true"
                className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  selected ? "border-amber-500 bg-amber-500" : "border-stone-300"
                }`}
              >
                {selected && <span className="text-white text-sm font-bold">✓</span>}
              </span>
            </button>
          );
        })}
      </div>

      {!chosen.settlesNow && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-900">
          Your order goes to the counter now and stays <strong>unpaid</strong> until you pay for
          it there. Points are added once payment is taken.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <button
        onClick={pay}
        disabled={busy}
        className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold text-lg rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
      >
        {busy
          ? "Please wait…"
          : chosen.settlesNow
            ? `Pay ${formatPrice(order.total_cents)}`
            : "Place order, pay at the counter"}
      </button>

      <Link
        href="/cart"
        className="block text-center w-full py-3 mt-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
      >
        Back to cart
      </Link>
    </div>
  );
}
