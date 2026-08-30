"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import type { VoucherRow } from "@/lib/rewards";

const SEEN_KEY = "sipngo_welcome_voucher_seen";

/**
 * Announces the free drink that came with signing up.
 *
 * Shown while the signup voucher is still unspent, and only until it is
 * dismissed. Firing on every sign-in would turn a gift into a nuisance, and
 * showing it after the drink has been claimed would be a lie.
 *
 * The dismissal is remembered per device rather than on the account. A
 * customer signing in on a second phone sees it again, which reads as a
 * reminder that they still have a free drink waiting — not as a bug.
 */
export default function WelcomeVoucherPopup() {
  const { user, loading: authLoading } = useAuth();
  const [voucher, setVoucher] = useState<VoucherRow | null>(null);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/vouchers");
        if (!res.ok) return;
        const data = await res.json();

        const signup = (data.vouchers as VoucherRow[]).find(
          (v) =>
            v.source === "signup" &&
            !v.redeemed_at &&
            (!v.expires_at ||
              new Date(v.expires_at.replace(" ", "T") + "Z") > new Date())
        );
        if (!signup || cancelled) return;

        let alreadySeen = false;
        try {
          alreadySeen = localStorage.getItem(SEEN_KEY) === signup.id;
        } catch {
          // Private browsing can throw; treat as not seen.
        }
        if (alreadySeen) return;

        // A short delay lets the menu settle first, so the gift lands on a
        // page rather than on a loading skeleton.
        setTimeout(() => {
          if (!cancelled) setVoucher(signup);
        }, 900);
      } catch {
        // A missed celebration is not worth surfacing an error for.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const dismiss = useCallback(() => {
    setClosing(true);
    if (voucher) {
      try {
        localStorage.setItem(SEEN_KEY, voucher.id);
      } catch {
        // It simply shows again next visit.
      }
    }
    setTimeout(() => {
      setVoucher(null);
      setClosing(false);
    }, 200);
  }, [voucher]);

  useEffect(() => {
    if (!voucher) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [voucher, dismiss]);

  if (!mounted || !voucher) return null;

  return createPortal(
    <div className="app-overlay z-[150] flex items-center justify-center p-4">
      <div
        className={`app-overlay bg-black/60 transition-opacity duration-200 ${
          closing ? "opacity-0" : "animate-fade-in"
        }`}
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="You have a free drink"
        className={`relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden ${
          closing ? "scale-95 opacity-0 transition-all duration-200" : "animate-scale-in"
        }`}
      >
        <div className="bg-gradient-to-br from-amber-500 to-orange-500 px-6 py-8 text-center text-white">
          <div className="text-6xl mb-2 animate-bounce-short" aria-hidden="true">
            🎁
          </div>
          <h2 className="text-2xl font-black">Welcome to SipNGo!</h2>
          <p className="text-amber-50 mt-1">Here is a drink on us.</p>
        </div>

        <div className="p-6">
          <div className="border-2 border-dashed border-amber-300 bg-amber-50 rounded-2xl p-4 text-center">
            <p className="font-bold text-amber-900 text-lg">{voucher.label}</p>
            {voucher.expires_at && (
              <p className="text-xs text-amber-700 mt-1">
                Use by {voucher.expires_at.slice(0, 10)}
              </p>
            )}
          </div>

          <p className="text-sm text-stone-500 text-center mt-4">
            It is waiting in your account. Pick a drink and apply it at checkout.
          </p>

          <div className="flex flex-col gap-2 mt-5">
            <Link
              href="/menu"
              onClick={dismiss}
              className="w-full text-center py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all active:scale-[0.98]"
            >
              Choose my drink
            </Link>
            <button
              onClick={dismiss}
              className="w-full py-2.5 text-stone-500 hover:text-stone-700 font-medium transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
