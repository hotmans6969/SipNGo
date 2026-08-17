"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useState } from "react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { totalItems } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  return (
    <nav className="bg-stone-900 text-white sticky top-0 z-50 shadow-lg">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <span className="text-amber-400">SipNGo</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/menu" className="text-stone-300 hover:text-white transition-colors">
              Menu
            </Link>
            {user ? (
              <>
                <Link href="/orders" className="text-stone-300 hover:text-white transition-colors">
                  My Orders
                </Link>
                {(user.role === "admin" || user.role === "staff") && (
                  <Link href="/admin" className="text-amber-400 hover:text-amber-300 transition-colors">
                    Dashboard
                  </Link>
                )}
                <div className="flex items-center gap-3 ml-4 pl-4 border-l border-stone-700">
                  <span className="text-sm text-stone-400">{user.name}</span>
                  <button
                    onClick={handleLogout}
                    className="text-sm bg-stone-800 hover:bg-stone-700 px-3 py-1.5 rounded-md transition-colors"
                  >
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/auth/login"
                  className="text-stone-300 hover:text-white transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/auth/register"
                  className="bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-stone-300 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <div className="md:hidden pb-4 space-y-2">
            <Link
              href="/menu"
              className="block py-2 text-stone-300 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              Menu
            </Link>
            {user ? (
              <>
                <Link
                  href="/orders"
                  className="block py-2 text-stone-300 hover:text-white"
                  onClick={() => setMobileOpen(false)}
                >
                  My Orders
                </Link>
                {(user.role === "admin" || user.role === "staff") && (
                  <Link
                    href="/admin"
                    className="block py-2 text-amber-400 hover:text-amber-300"
                    onClick={() => setMobileOpen(false)}
                  >
                    Dashboard
                  </Link>
                )}
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileOpen(false);
                  }}
                  className="block py-2 text-stone-400 hover:text-white"
                >
                  Logout ({user.name})
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="block py-2 text-stone-300 hover:text-white"
                  onClick={() => setMobileOpen(false)}
                >
                  Login
                </Link>
                <Link
                  href="/auth/register"
                  className="block py-2 text-amber-400 hover:text-amber-300"
                  onClick={() => setMobileOpen(false)}
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
