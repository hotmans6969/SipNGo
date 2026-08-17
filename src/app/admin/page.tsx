"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRScanner from "@/components/QRScanner";

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

// A simple notification "ding" in base64
const notificationSound = "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExDQA/4PAAAAiAAAAGYAAAAAJgAAAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExFUAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExHUA8gO/wQAEgAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExJYAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  // Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState("");

  const router = useRouter();
  const prevOrdersRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);

  const playNotification = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // Ignore audio errors if blocked by browser
    }
  }, []);

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
      
      // Determine if there are NEW 'paid' orders demanding attention
      if (prevOrdersRef.current.size > 0) {
        const hasNewPaid = newOrders.some(o => 
          o.status === "paid" && !prevOrdersRef.current.has(o.id)
        );
        if (hasNewPaid) {
          playNotification();
        }
      }
      
      // Update our refs
      prevOrdersRef.current = new Set(newOrders.map(o => o.id));
      setOrders(newOrders);

    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [statusFilter, router, playNotification]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || (user.role !== "admin" && user.role !== "staff")) {
      router.push("/");
      return;
    }
    fetchOrders();
  }, [user, authLoading, router, fetchOrders]);

  // Auto-refresh every 2 seconds
  useEffect(() => {
    const interval = setInterval(fetchOrders, 2000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const updateStatus = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        await fetchOrders();
      }
    } catch {
      // silently fail
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
    } catch (e) {
      setScanError("Failed to parse QR Code");
    } finally {
      setUpdatingId(null);
    }
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const statusActions: Record<string, { label: string; next: string; color: string }[]> = {
    paid: [{ label: "Start Preparing", next: "preparing", color: "bg-orange-500 hover:bg-orange-600 border border-orange-600 shadow-sm" }],
    preparing: [{ label: "Mark Ready", next: "ready", color: "bg-green-500 hover:bg-green-600 border border-green-600 shadow-sm" }],
  };

  const statuses = ["", "paid", "preparing", "ready", "picked_up", "cancelled", "pending_payment"];

  if (authLoading || loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-stone-200 rounded w-48" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-stone-200 rounded-xl" />
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
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className={`bg-white rounded-xl border p-5 transition-shadow ${
                order.status === "paid" 
                  ? "border-amber-400 shadow-md shadow-amber-100 bg-amber-50/10"
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
                    {order.customer_name} &middot; {new Date(order.created_at).toLocaleTimeString()}
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

                  {order.status !== "cancelled" && order.status !== "picked_up" && (
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
