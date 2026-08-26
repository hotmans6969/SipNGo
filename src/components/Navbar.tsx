"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { usePathname } from "next/navigation";
import { useBumpOnChange } from "@/hooks/useBumpOnChange";

export default function Navbar() {
  const { user } = useAuth();
  const { totalItems } = useCart();
  const pathname = usePathname();
  const cartBumping = useBumpOnChange(totalItems);

  const isActive = (path: string) => pathname === path || (path !== "/" && pathname?.startsWith(path));

  // Every tab shares the same press and colour behaviour.
  const tabClasses = (active: boolean) =>
    `flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all duration-200 active:scale-90 ${
      active ? "text-amber-500" : "text-stone-400 hover:text-stone-600"
    }`;

  // The icon lifts slightly on the active tab, which reads as selection
  // without needing a separate indicator bar.
  const iconClasses = (active: boolean) =>
    `w-6 h-6 transition-transform duration-200 ${active ? "scale-110 -translate-y-0.5" : ""}`;

  return (
    <>
      {/* Top Header (Branding only) */}
      <header className="bg-stone-900 text-white sticky top-0 z-40 shadow-sm h-14 flex items-center justify-center">
        <Link href="/" className="font-bold text-xl tracking-tight">
          <span className="text-amber-400">SipNGo</span>
        </Link>
      </header>

      {/* Bottom Navigation Bar */}
      <nav className="bg-white border-t border-stone-200 fixed bottom-0 left-0 right-0 z-50 safe-area-pb shadow-[0_-5px_20px_-15px_rgba(0,0,0,0.3)]">
        <div className="max-w-md mx-auto flex justify-around items-center h-16">
          
          <Link href="/menu" className={tabClasses(!!isActive("/menu"))}>
            <svg className={iconClasses(!!isActive("/menu"))} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span className="text-[10px] font-medium font-sans uppercase tracking-wider">Menu</span>
          </Link>

          {user?.role === "admin" || user?.role === "staff" ? (
            <Link href="/admin" className={`${tabClasses(!!isActive("/admin"))} relative`}>
              <div className="relative">
                <svg className={iconClasses(!!isActive("/admin"))} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <span className="text-[10px] font-medium font-sans uppercase tracking-wider">Dashboard</span>
            </Link>
          ) : (
            <Link href="/cart" className={`${tabClasses(!!isActive("/cart"))} relative`}>
              <div className="relative">
                <svg className={iconClasses(!!isActive("/cart"))} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                {totalItems > 0 && (
                  <span
                    // Exactly one animation: both utilities set the same
                    // `animation` property, so applying them together would
                    // silently drop whichever lost the cascade.
                    className={`absolute -top-1.5 -right-2.5 bg-amber-500 text-white text-[10px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center shadow-sm ${
                      cartBumping ? "animate-pop" : "animate-scale-in"
                    }`}
                  >
                    {totalItems}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium font-sans uppercase tracking-wider">Orders</span>
            </Link>
          )}

          <Link
            href={user ? "/account" : "/auth/login"}
            className={tabClasses(!!(isActive("/account") || isActive("/auth")))}
          >
            <svg className={iconClasses(!!(isActive("/account") || isActive("/auth")))} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-[10px] font-medium font-sans uppercase tracking-wider">Account</span>
          </Link>

        </div>
      </nav>
    </>
  );
}
