"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const { user } = useAuth();
  const { totalItems } = useCart();
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path || (path !== "/" && pathname?.startsWith(path));

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
          
          <Link href="/menu" className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${isActive("/menu") ? "text-amber-500" : "text-stone-400 hover:text-stone-600"}`}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span className="text-[10px] font-medium font-sans uppercase tracking-wider">Menu</span>
          </Link>

          <Link href="/cart" className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors relative ${isActive("/cart") ? "text-amber-500" : "text-stone-400 hover:text-stone-600"}`}>
            <div className="relative">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              {totalItems > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-amber-500 text-white text-[10px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center shadow-sm">
                  {totalItems}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium font-sans uppercase tracking-wider">Cart</span>
          </Link>

          <Link href={user ? "/account" : "/auth/login"} className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${isActive("/account") || isActive("/auth") || isActive("/admin") ? "text-amber-500" : "text-stone-400 hover:text-stone-600"}`}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-[10px] font-medium font-sans uppercase tracking-wider">Account</span>
          </Link>

        </div>
      </nav>
    </>
  );
}
