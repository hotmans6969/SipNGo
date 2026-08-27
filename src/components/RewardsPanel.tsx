"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import { useDialog } from "@/components/DialogProvider";
import type { Reward, VoucherRow } from "@/lib/rewards";

/**
 * Points, vouchers, and what points can be exchanged for.
 *
 * The balance shown here comes from the same request as the rewards, so the
 * cost of a reward is never compared against a stale balance.
 */
export default function RewardsPanel({ onPointsChange }: { onPointsChange?: () => void }) {
  const [points, setPoints] = useState(0);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { notify } = useDialog();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/vouchers");
      if (!res.ok) return;
      const data = await res.json();
      setPoints(data.points ?? 0);
      setVouchers(data.vouchers ?? []);
      setRewards(data.rewards ?? []);
    } catch {
      // Leave whatever was already on screen.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const redeem = useCallback(
    async (reward: Reward) => {
      setBusyId(reward.id);
      try {
        const res = await fetch("/api/vouchers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rewardId: reward.id }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          await notify({
            title: "Could not redeem",
            message: data.error || "Please try again.",
            tone: "danger",
          });
          return;
        }

        await notify({
          title: `${reward.label} is yours`,
          message: "Apply it at checkout on your next order.",
          tone: "success",
        });
        await load();
        onPointsChange?.();
      } finally {
        setBusyId(null);
      }
    },
    [notify, load, onPointsChange]
  );

  const usable = vouchers.filter(
    (v) => !v.redeemed_at && (!v.expires_at || new Date(v.expires_at.replace(" ", "T") + "Z") > new Date())
  );
  const spent = vouchers.filter((v) => v.redeemed_at);

  if (loading) {
    return <div className="h-40 skeleton rounded-2xl mb-6" />;
  }

  return (
    <>
      {usable.length > 0 && (
        <section className="mb-6">
          <h2 className="font-bold text-stone-900 mb-3">Your vouchers</h2>
          <div className="space-y-2">
            {usable.map((voucher) => (
              <div
                key={voucher.id}
                className="bg-amber-50 border-2 border-dashed border-amber-300 rounded-xl p-4 flex items-center gap-3 animate-fade-in-up"
              >
                <span className="text-2xl" aria-hidden="true">
                  {voucher.kind === "free_drink" ? "🎁" : "🎟️"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-amber-900">{voucher.label}</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {voucher.expires_at
                      ? `Use by ${voucher.expires_at.slice(0, 10)}`
                      : "No expiry"}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-400 mt-2 px-1">
            Choose one at checkout. Only one voucher applies per order.
          </p>
        </section>
      )}

      <section className="mb-6">
        <h2 className="font-bold text-stone-900 mb-3">Spend your points</h2>
        <div className="space-y-2">
          {rewards.map((reward) => {
            const affordable = points >= reward.points;
            return (
              <div
                key={reward.id}
                className={`bg-white border rounded-xl p-4 flex items-center gap-3 ${
                  affordable ? "border-stone-200" : "border-stone-100 opacity-60"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-stone-900">{reward.label}</p>
                  <p className="text-sm text-stone-500 mt-0.5">
                    {reward.points} points
                    {!affordable && ` · ${reward.points - points} more to go`}
                  </p>
                </div>
                <button
                  onClick={() => redeem(reward)}
                  disabled={!affordable || busyId !== null}
                  className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-5 py-2.5 rounded-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busyId === reward.id ? "…" : "Redeem"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {spent.length > 0 && (
        <section className="mb-6">
          <h2 className="font-bold text-stone-900 mb-3">Used</h2>
          <div className="space-y-1.5">
            {spent.slice(0, 5).map((voucher) => (
              <div
                key={voucher.id}
                className="flex items-center justify-between text-sm text-stone-400 px-4 py-2.5 bg-stone-50 rounded-lg"
              >
                <span className="line-through truncate">{voucher.label}</span>
                <span className="shrink-0 ml-3">
                  {voucher.discount_cents > 0 && `−${formatPrice(voucher.discount_cents)}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
