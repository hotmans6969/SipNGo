"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { formatPrice } from "@/lib/format";

type Period = "today" | "week" | "month";

interface DailyTotal {
  date: string;
  totalCents: number;
  orderCount: number;
}

interface TopItem {
  name: string;
  quantity: number;
  revenueCents: number;
}

interface Summary {
  period: Period;
  from: string;
  to: string;
  totalCents: number;
  orderCount: number;
  averageOrderCents: number;
  itemsSold: number;
  byDay: DailyTotal[];
  topItems: TopItem[];
  topToppings: TopItem[];
}

const PERIODS: { id: Period; label: string; caption: string }[] = [
  { id: "today", label: "Today", caption: "since midnight" },
  { id: "week", label: "Week", caption: "last 7 days" },
  { id: "month", label: "Month", caption: "last 30 days" },
];

/**
 * A date for a human, e.g. "Tue 26" or "26 Jul".
 *
 * The month is included when a range crosses one, because "Wed 29 – Thu 27"
 * reads like nonsense without it.
 */
function shortDate(iso: string, withMonth = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-MY", {
    timeZone: "UTC",
    ...(withMonth ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric" }),
  });
}

/** True when two ISO dates fall in different months. */
function spansMonths(from: string, to: string): boolean {
  return from.slice(0, 7) !== to.slice(0, 7);
}

export default function SalesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("today");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchSummary = useCallback(async (next: Period) => {
    setError("");
    try {
      const res = await fetch(`/api/admin/sales?period=${next}`);
      if (res.status === 403) {
        router.push("/");
        return;
      }
      if (!res.ok) {
        setError("Could not load sales.");
        return;
      }
      setSummary(await res.json());
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || (user.role !== "admin" && user.role !== "staff")) {
      router.push("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSummary(period);
  }, [user, authLoading, router, period, fetchSummary]);

  if (authLoading || (loading && !summary)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="space-y-4">
          <div className="h-8 skeleton rounded w-40" />
          <div className="h-28 skeleton rounded-2xl" />
          <div className="h-64 skeleton rounded-2xl" />
        </div>
      </div>
    );
  }

  // The tallest day sets the scale, so the bars stay readable whatever the
  // takings are.
  const peak = Math.max(1, ...(summary?.byDay.map((d) => d.totalCents) ?? [1]));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-stone-900">Sales</h1>
          {summary && (
            <p className="text-sm text-stone-500 mt-0.5">
              {summary.from === summary.to
                ? shortDate(summary.to)
                : (() => {
                    const withMonth = spansMonths(summary.from, summary.to);
                    return `${shortDate(summary.from, withMonth)} – ${shortDate(summary.to, withMonth)}`;
                  })()}
            </p>
          )}
        </div>
        <Link
          href="/admin"
          className="shrink-0 text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors"
        >
          &larr; Orders
        </Link>
      </div>

      {/* Full-width targets: this is read on a phone at the counter. */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setPeriod(p.id);
              setLoading(true);
            }}
            className={`py-3 rounded-xl font-semibold transition-all active:scale-95 ${
              period === p.id
                ? "bg-stone-900 text-white shadow-md"
                : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
            }`}
          >
            {p.label}
            <span
              className={`block text-[10px] font-normal mt-0.5 ${
                period === p.id ? "text-stone-300" : "text-stone-400"
              }`}
            >
              {p.caption}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {summary && (
        <>
          <div className="bg-stone-900 text-white rounded-2xl p-6 mb-4 animate-scale-in">
            <p className="text-stone-400 text-sm">Takings</p>
            <p className="text-4xl font-black text-amber-400 mt-1 tabular-nums">
              {formatPrice(summary.totalCents)}
            </p>
            <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-stone-700">
              <div>
                <p className="text-xl font-bold tabular-nums">{summary.orderCount}</p>
                <p className="text-stone-400 text-xs mt-0.5">orders</p>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums">{summary.itemsSold}</p>
                <p className="text-stone-400 text-xs mt-0.5">drinks</p>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums">
                  {formatPrice(summary.averageOrderCents)}
                </p>
                <p className="text-stone-400 text-xs mt-0.5">avg order</p>
              </div>
            </div>
          </div>

          {summary.orderCount === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center">
              <div className="text-4xl mb-3" aria-hidden="true">
                🧾
              </div>
              <p className="text-stone-500">No paid orders in this period</p>
            </div>
          ) : (
            <>
              {summary.byDay.length > 1 && (
                <section className="bg-white rounded-2xl border border-stone-200 p-5 mb-4">
                  <h2 className="font-bold text-stone-900 mb-4">By day</h2>
                  <div className="space-y-2.5">
                    {summary.byDay.map((day) => (
                      <div key={day.date} className="flex items-center gap-3">
                        <span className="w-14 shrink-0 text-xs text-stone-500 tabular-nums">
                          {shortDate(day.date)}
                        </span>
                        <div className="flex-1 h-6 bg-stone-100 rounded-md overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-md transition-[width] duration-500"
                            style={{ width: `${(day.totalCents / peak) * 100}%` }}
                          />
                        </div>
                        <span className="w-20 shrink-0 text-right text-sm font-semibold text-stone-700 tabular-nums">
                          {formatPrice(day.totalCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="bg-white rounded-2xl border border-stone-200 p-5 mb-4">
                <h2 className="font-bold text-stone-900 mb-3">Best sellers</h2>
                <div className="divide-y divide-stone-100">
                  {summary.topItems.map((item, index) => (
                    <div key={item.name} className="py-2.5 flex items-center gap-3">
                      <span className="w-6 text-sm font-bold text-stone-300 tabular-nums">
                        {index + 1}
                      </span>
                      <span className="flex-1 text-stone-900 truncate">{item.name}</span>
                      <span className="text-sm text-stone-500 tabular-nums">
                        {item.quantity} sold
                      </span>
                      <span className="w-20 text-right font-semibold text-amber-600 tabular-nums">
                        {formatPrice(item.revenueCents)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {summary.topToppings.length > 0 && (
                <section className="bg-white rounded-2xl border border-stone-200 p-5">
                  <h2 className="font-bold text-stone-900 mb-1">Toppings</h2>
                  <p className="text-xs text-stone-400 mb-3">
                    How much to keep prepped
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {summary.topToppings.map((topping) => (
                      <span
                        key={topping.name}
                        className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-full text-sm font-medium"
                      >
                        {topping.name}
                        <span className="ml-1.5 font-bold tabular-nums">×{topping.quantity}</span>
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
