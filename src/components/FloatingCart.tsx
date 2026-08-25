"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { usePathname } from "next/navigation";
import { formatPrice } from "@/lib/format";

export default function FloatingCart() {
  const { totalItems, totalCents } = useCart();
  const pathname = usePathname();

  // Don't show if cart is empty or if we are already on the cart/checkout/admin pages
  if (
    totalItems === 0 || 
    pathname === "/cart" || 
    pathname?.startsWith("/admin")
  ) {
    return null;
  }


  return (
    <Link
      href="/cart"
      className="fixed bottom-6 right-6 z-50 bg-amber-500 hover:bg-amber-600 text-stone-900 shadow-2xl rounded-full px-5 py-4 flex items-center gap-3 transition-transform hover:scale-105"
    >
      <div className="relative">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
        <span className="absolute -top-2 -right-2 bg-stone-900 text-amber-500 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {totalItems}
        </span>
      </div>
      <div className="flex flex-col text-sm border-l border-amber-600 pl-3 ml-1">
        <span className="font-bold leading-none">View Cart</span>
        <span className="font-medium leading-none mt-1">{formatPrice(totalCents)}</span>
      </div>
    </Link>
  );
}
