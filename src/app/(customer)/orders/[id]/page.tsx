"use client";

import { useState, useEffect, use } from "react";
import { useAuth } from "@/context/AuthContext";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  qr_token: string | null;
  created_at: string;
  items: OrderItem[];
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  const paymentStatus = searchParams.get("payment");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }

    // Fetch order
    fetch(`/api/orders/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Order not found");
        return res.json();
      })
      .then((data) => {
        setOrder(data.order);
        setLoading(false);

        // Fetch QR code if order is paid/preparing/ready
        if (["paid", "preparing", "ready"].includes(data.order.status)) {
          fetch(`/api/orders/${id}/qrcode`)
            .then((res) => res.json())
            .then((qrData) => {
              if (qrData.qrCode) {
                setQrCode(qrData.qrCode);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        setError("Order not found");
        setLoading(false);
      });
  }, [id, user, authLoading, router]);

  // Ask for notification permission
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  // Poll for status changes
  useEffect(() => {
    if (!order || order.status === "picked_up" || order.status === "cancelled") return;

    const interval = setInterval(() => {
      fetch(`/api/orders/${id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.order) {
            // Check if status changed
            if (data.order.status !== order.status && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              if (data.order.status === "preparing") {
                new Notification("Order Preparing! 👩🍳", { body: `Order #${data.order.order_number} has been accepted and is now being prepared.` });
              } else if (data.order.status === "ready") {
                new Notification("Order Ready! ☕", { body: `Your order #${data.order.order_number} is ready for pickup!` });
              }
            }

            setOrder(data.order);
            // Fetch QR if newly paid
            if (["paid", "preparing", "ready"].includes(data.order.status) && !qrCode) {
              fetch(`/api/orders/${id}/qrcode`)
                .then((res) => res.json())
                .then((qrData) => {
                  if (qrData.qrCode) setQrCode(qrData.qrCode);
                })
                .catch(() => {});
            }
          }
        })
        .catch(() => {});
    }, 2000);

    return () => clearInterval(interval);
  }, [id, order, qrCode]);

  const formatPrice = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;

  if (authLoading || loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-stone-200 rounded w-48" />
          <div className="h-64 bg-stone-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border border-stone-200 p-12">
          <h2 className="text-xl font-semibold text-stone-700 mb-2">{error || "Order not found"}</h2>
          <Link
            href="/orders"
            className="inline-block mt-4 text-amber-600 hover:text-amber-700 font-medium"
          >
            Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {paymentStatus === "success" && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-800 rounded-xl">
          <p className="font-semibold">Payment successful!</p>
          <p className="text-sm mt-1">Your order has been placed. Show your QR code at pickup when your order is ready.</p>
        </div>
      )}

      {paymentStatus === "cancelled" && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl">
          <p className="font-semibold">Payment was cancelled</p>
          <p className="text-sm mt-1">You can try paying again below.</p>
        </div>
      )}

      <Link href="/orders" className="text-amber-600 hover:text-amber-700 font-medium text-sm mb-4 inline-block">
        &larr; Back to Orders
      </Link>

      {/* Order Header */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">
              Order #{String(order.order_number).padStart(3, "0")}
            </h1>
            <p className="text-sm text-stone-400 mt-1">
              {formatMalaysiaDateTime(order.created_at)}
            </p>
          </div>
          <StatusBadge status={order.status} />
        </div>

        {/* Status Progress */}
        {order.status !== "cancelled" && (
          <div className="mt-6 mb-2">
            <div className="flex justify-between text-xs text-stone-400 mb-2">
              <span className={order.status !== "pending_payment" ? "text-amber-600 font-semibold" : ""}>Paid</span>
              <span className={["preparing", "ready", "picked_up"].includes(order.status) ? "text-amber-600 font-semibold" : ""}>Preparing</span>
              <span className={["ready", "picked_up"].includes(order.status) ? "text-amber-600 font-semibold" : ""}>Ready</span>
              <span className={order.status === "picked_up" ? "text-amber-600 font-semibold" : ""}>Picked Up</span>
            </div>
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{
                  width:
                    order.status === "pending_payment"
                      ? "0%"
                      : order.status === "paid"
                      ? "25%"
                      : order.status === "preparing"
                      ? "50%"
                      : order.status === "ready"
                      ? "75%"
                      : "100%",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* QR Code */}
      {qrCode && ["paid", "preparing", "ready"].includes(order.status) && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 mb-6 text-center">
          <h2 className="text-lg font-semibold text-stone-900 mb-1">Your Pickup QR Code</h2>
          <p className="text-sm text-stone-500 mb-4">
            {order.status === "ready"
              ? "Your order is ready! Show this QR code at the counter."
              : "Show this QR code at the counter when your order is ready."}
          </p>
          <div className="inline-block bg-white p-4 rounded-xl border-2 border-stone-100">
            <img src={qrCode} alt="Pickup QR Code" className="w-56 h-56" />
          </div>
          <div className="mt-4 bg-amber-50 rounded-lg p-3">
            <p className="text-amber-800 font-bold text-2xl">
              #{String(order.order_number).padStart(3, "0")}
            </p>
            <p className="text-amber-600 text-sm">Your Order Number</p>
          </div>
        </div>
      )}

      {/* Pending Payment CTA */}
      {order.status === "pending_payment" && (
        <div className="bg-white rounded-2xl border border-stone-200 p-6 mb-6 text-center">
          <h2 className="text-lg font-semibold text-stone-900 mb-2">Payment Required</h2>
          <p className="text-sm text-stone-500 mb-4">Complete your payment to confirm this order.</p>
          <button
            onClick={async () => {
              try {
                const res = await fetch("/api/checkout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ orderId: order.id }),
                });
                const data = await res.json();
                if (data.url) {
                  window.location.href = data.url;
                } else if (data.mode === "demo") {
                  window.location.reload();
                }
              } catch {
                // silently fail
              }
            }}
            className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
          >
            Pay {formatPrice(order.total_cents)}
          </button>
        </div>
      )}

      {/* Order Items */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6">
        <h2 className="text-lg font-semibold text-stone-900 mb-4">Order Details</h2>
        <div className="divide-y divide-stone-100">
          {order.items.map((item) => (
            <div key={item.id} className="py-3 flex justify-between">
              <div>
                <span className="font-medium text-stone-900">{item.name}</span>
                <span className="text-stone-400 ml-2">x{item.quantity}</span>
              </div>
              <span className="text-stone-700 font-medium">
                {formatPrice(item.price_cents * item.quantity)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-stone-200 flex justify-between">
          <span className="text-lg font-bold text-stone-900">Total</span>
          <span className="text-lg font-bold text-amber-600">{formatPrice(order.total_cents)}</span>
        </div>
      </div>
    </div>
  );
}
