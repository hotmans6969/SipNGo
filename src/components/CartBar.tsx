"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useBumpOnChange } from "@/hooks/useBumpOnChange";
import { formatPrice } from "@/lib/format";

/**
 * The cart, as a bar that rises above the bottom navigation the moment there
 * is something in it.
 *
 * The cart used to be a permanent tab, which spent a slot on a screen that is
 * empty most of the time. Here it costs nothing until the customer adds a
 * drink, and then it is the widest tap target on the page.
 */
export default function CartBar() {
  const { totalItems, totalCents } = useCart();
  const { user } = useAuth();
  const pathname = usePathname();
  const bumping = useBumpOnChange(totalItems);

  const isStaff = user?.role === "admin" || user?.role === "staff";

  // The bar is a shortcut to the cart, so it has no business on the cart
  // itself, behind the counter, or in the middle of signing in.
  const hidden =
    totalItems === 0 ||
    isStaff ||
    !!pathname?.startsWith("/cart") ||
    !!pathname?.startsWith("/admin") ||
    !!pathname?.startsWith("/auth");

  if (hidden) return null;

  return (
    <>
      {/* Sits in the normal flow so the last of the page can still be
          scrolled clear of the bar. */}
      <div aria-hidden="true" className="h-[76px] shrink-0" />

      <div className="fixed bottom-16 left-0 right-0 z-40 px-3 pb-2 pointer-events-none">
        <Link
          href="/cart"
          className="pointer-events-auto max-w-md mx-auto flex items-center gap-3 bg-stone-900 text-white rounded-2xl pl-3 pr-4 py-3 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transition-all duration-200 active:scale-[0.98] hover:bg-stone-800 animate-slide-up"
        >
          <span className="relative shrink-0 w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <span
              className={`absolute -top-1.5 -right-1.5 bg-white text-stone-900 text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center shadow-sm ${
                bumping ? "animate-pop" : "animate-scale-in"
              }`}
            >
              {totalItems}
            </span>
          </span>

          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold leading-tight">
              {totalItems} {totalItems === 1 ? "item" : "items"} in cart
            </span>
            <span className="block text-xs text-stone-400 leading-tight mt-0.5">
              Tap to review and pay
            </span>
          </span>

          <span className="shrink-0 text-right">
            <span className="block font-bold text-amber-400">{formatPrice(totalCents)}</span>
            <span className="block text-[11px] text-stone-400 leading-tight">View cart &rarr;</span>
          </span>
        </Link>
      </div>
    </>
  );
}
