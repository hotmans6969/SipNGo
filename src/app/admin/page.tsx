"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRScanner from "@/components/QRScanner";
import { formatMalaysiaTime } from "@/lib/dates";
import { formatPrice } from "@/lib/format";
import { usePolling } from "@/hooks/usePolling";
import { useOrderAlarm } from "@/hooks/useOrderAlarm";
import { canTransition, type OrderStatus } from "@/lib/order-status";

interface OrderItem {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
}

interface AdminOrder {
  id: string;
  order_number: number;
  order_date: string;
  status: string;
  total_cents: number;
  customer_name: string;
  customer_email: string;
  created_at: string;
  items: OrderItem[];
}

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [awaitingCount, setAwaitingCount] = useState(0);
  const [actionError, setActionError] = useState("");
  
  // Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState("");

  const router = useRouter();
  const fetchOrders = useCallback(async () => {
    const url = statusFilter ? `/api/admin/orders?status=${statusFilter}` : "/api/admin/orders";
    try {
      const res = await fetch(url);
      if (res.status === 403) {
        router.push("/");
        return;
      }
      const data = await res.json();
      const newOrders: AdminOrder[] = data.orders || [];
      
      setOrders(newOrders);

      // How many orders are waiting to be started, independent of the filter
      // being viewed. The endpoint reports the unpaginated total, so this
      // stays correct however many there are.
      try {
        const waitingRes = await fetch("/api/admin/orders?status=paid&limit=1");
        if (waitingRes.ok) {
          const waiting = await waitingRes.json();
          setAwaitingCount(waiting.total ?? 0);
        }
      } catch {
        // Leave the previous count rather than falsely silencing the alarm.
      }

    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [statusFilter, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || (user.role !== "admin" && user.role !== "staff")) {
      router.push("/");
      return;
    }
    // Initial load only; refreshes after this come from usePolling below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrders();
  }, [user, authLoading, router, fetchOrders]);

  // Refresh while the dashboard is on screen. Polling stops when the tab is
  // hidden and resumes with an immediate fetch when it comes back.
  usePolling(fetchOrders, 5000, !authLoading && !!user);

  // "paid" means the customer has paid and nobody has started making it. The
  // alarm is driven by that being true right now rather than by an order
  // arriving, so it keeps sounding for one that was already waiting when the
  // board was opened, and stops the instant the last one is accepted.
  //
  // This count is fetched separately rather than derived from `orders`,
  // because `orders` reflects the current status filter — deriving it there
  // silenced the alarm the moment staff filtered to any other status, while
  // orders sat unmade.
  const { blocked: soundBlocked, enableSound } = useOrderAlarm(awaitingCount > 0);

  const updateStatus = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        await fetchOrders();
        return;
      }

      // A rejected change used to be swallowed here, so the button simply did
      // nothing and gave the counter no idea why.
      const data = await res.json().catch(() => ({}));
      setActionError(data.error || `Could not update the order (${res.status}).`);
    } catch {
      setActionError("Could not reach the server. Check the connection and try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleQRScanSuccess = async (decodedText: string) => {
    try {
      setScanError("");
      const data = JSON.parse(decodedText);
      
      if (!data.orderId || !data.qrToken) {
        setScanError("Invalid QR Code content");
        return;
      }

      setUpdatingId("scan");
      setShowScanner(false);
      
      const res = await fetch(`/api/admin/orders/${data.orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrToken: data.qrToken }),
      });

      const resData = await res.json();
      
      if (res.ok) {
        alert(`Order #${data.orderNumber} Completed Successfully!`);
        await fetchOrders();
      } else {
        alert(resData.error || "Failed to complete order. Is it in 'Ready' status?");
      }
    } catch {
      setScanError("Failed to parse QR Code");
    } finally {
      setUpdatingId(null);
    }
  };


  const statusActions: Record<string, { label: string; next: string; color: string }[]> = {
    paid: [{ label: "Start Preparing", next: "preparing", color: "bg-orange-500 hover:bg-orange-600 border border-orange-600 shadow-sm" }],
    preparing: [{ label: "Mark Ready", next: "ready", color: "bg-green-500 hover:bg-green-600 border border-green-600 shadow-sm" }],
  };

  const statuses = ["", "paid", "preparing", "ready", "picked_up", "cancelled", "pending_payment"];

  if (authLoading || loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="space-y-4">
          <div className="h-8 skeleton rounded w-48" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 skeleton rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const activeOrders = orders.filter((o) => ["paid", "preparing", "ready"].includes(o.status));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 relative">
      {/* SCANNER MODAL */}
      {showScanner && (
        <QRScanner 
          onClose={() => setShowScanner(false)} 
          onScanSuccess={handleQRScanSuccess} 
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-3xl font-bold text-stone-900">Order Dashboard</h1>
          <p className="text-stone-500 mt-1">{activeOrders.length} active orders requiring attention</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setScanError("");
              setShowScanner(true);
            }}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-5 py-3 rounded-xl transition-colors shadow-md"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10V3h7m11 7V3h-7m-11 11v7h7m11-7v7h-7" />
            </svg>
            Scan QR
          </button>
          
          <Link
            href="/admin/menu-manage"
            className="flex items-center bg-stone-800 hover:bg-stone-700 text-white font-medium px-4 py-2 rounded-xl transition-colors text-sm"
          >
            Manage Menu
          </Link>
        </div>
      </div>
      
      {scanError && (
         <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm">
           {scanError}
         </div>
      )}

      {actionError && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm flex items-center justify-between gap-3 animate-fade-in-up">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError("")}
            aria-label="Dismiss"
            className="shrink-0 text-red-500 hover:text-red-700 transition-all active:scale-90"
          >
            ✕
          </button>
        </div>
      )}

      {/* An alarm nobody can hear is worse than no alarm, so a blocked audio
          context is stated plainly rather than failing quietly. */}
      {soundBlocked && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between gap-4 animate-fade-in-up">
          <div>
            <p className="font-semibold text-amber-900">Sound is blocked</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Your browser will not play the new-order alert until you allow it.
            </p>
          </div>
          <button
            onClick={enableSound}
            className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-4 py-2.5 rounded-lg transition-all active:scale-95"
          >
            Turn on sound
          </button>
        </div>
      )}

      {awaitingCount > 0 && (
        <div className="mb-4 p-4 bg-amber-500 text-white rounded-xl flex items-center gap-3 animate-attention-pulse">
          <span className="text-2xl" aria-hidden="true">🔔</span>
          <p className="font-bold" role="status">
            {awaitingCount} order{awaitingCount === 1 ? "" : "s"} waiting to be started
          </p>
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s);
              setLoading(true);
            }}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === s
                ? "bg-stone-800 text-white"
                : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
            }`}
          >
            {s === "" ? "All" : s === "pending_payment" ? "Pending Payment" : s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center">
          <p className="text-stone-400 text-lg">No orders found</p>
        </div>
      ) : (
        <div className="space-y-4 stagger-children">
          {orders.map((order) => (
            <div
              key={order.id}
              className={`bg-white rounded-xl border p-5 transition-all duration-300 ${
                order.status === "paid" 
                  ? "border-amber-400 shadow-md shadow-amber-100 bg-amber-50/10 animate-attention-pulse"
                  : order.status === "ready"
                  ? "border-green-300 shadow-md shadow-green-100"
                  : order.status === "preparing"
                  ? "border-orange-200"
                  : "border-stone-200"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-2xl font-bold text-stone-900">
                      #{String(order.order_number).padStart(3, "0")}
                    </span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-sm text-stone-500">
                    {order.customer_name} &middot; {formatMalaysiaTime(order.created_at)}
                  </p>
                  <div className="text-base text-stone-700 font-medium mt-3 bg-stone-50 p-3 rounded-lg border border-stone-100">
                    {order.items.map((item) => (
                      <span key={item.id} className="inline-block mr-4">
                        <span className="font-bold">{item.quantity}x</span> {item.name}
                      </span>
                    ))}
                  </div>
                  <p className="text-stone-500 text-sm font-semibold mt-2">Total: {formatPrice(order.total_cents)}</p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 flex-shrink-0 w-full sm:w-auto">
                  {statusActions[order.status]?.map((action) => (
                    <button
                      key={action.next}
                      onClick={() => updateStatus(order.id, action.next)}
                      disabled={updatingId === order.id}
                      className={`${action.color} text-white font-bold px-6 py-4 rounded-xl transition-colors text-lg disabled:opacity-50`}
                    >
                      {updatingId === order.id ? "Working..." : action.label}
                    </button>
                  ))}
                  
                  {order.status === "ready" && (
                    <div className="text-center bg-green-50 text-green-800 border border-green-200 p-3 rounded-xl">
                      <p className="font-semibold mb-2">Awaiting customer pickup</p>
                      <button 
                        onClick={() => setShowScanner(true)}
                        className="bg-stone-900 text-white text-sm font-bold w-full py-2 rounded-lg hover:bg-stone-800"
                      >
                        Scan & Complete
                      </button>
                    </div>
                  )}

                  {canTransition(order.status as OrderStatus, "cancelled") && (
                    <button
                      onClick={() => {
                        if (confirm(`Are you sure you want to cancel order #${order.order_number}?`)) {
                           updateStatus(order.id, "cancelled");
                        }
                      }}
                      disabled={updatingId === order.id}
                      className="bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-600 font-medium px-4 py-2 border border-transparent hover:border-red-200 rounded-lg transition-colors text-sm disabled:opacity-50 text-center"
                    >
                      Cancel Order
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
