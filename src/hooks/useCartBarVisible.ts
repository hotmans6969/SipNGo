"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";

/**
 * Whether the cart bar is currently sitting above the bottom navigation.
 *
 * The bar itself needs this, and so does anything else that floats above the
 * navigation and would otherwise land on top of it. Both read the answer from
 * here rather than each deciding for themselves, because two copies of this
 * rule would drift and the overlap only shows up in the one combination
 * nobody thought to check.
 */
export function useCartBarVisible(): boolean {
  const { totalItems } = useCart();
  const { user } = useAuth();
  const pathname = usePathname();

  const isStaff = user?.role === "admin" || user?.role === "staff";

  // The bar is a shortcut to the cart, so it has no business on the cart
  // itself, behind the counter, or in the middle of signing in.
  return (
    totalItems > 0 &&
    !isStaff &&
    !pathname?.startsWith("/cart") &&
    !pathname?.startsWith("/admin") &&
    !pathname?.startsWith("/auth")
  );
}
