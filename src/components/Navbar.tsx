"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import { useStaffAlerts } from "@/context/StaffAlertContext";
import { useActiveOrders } from "@/context/ActiveOrderContext";

export default function Navbar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const isStaff = user?.role === "admin" || user?.role === "staff";
  const { awaitingCount } = useStaffAlerts();
  const { activeCount } = useActiveOrders();

  // isActive matches by prefix, so /admin/sales would light the Orders tab as
  // well as its own. Orders covers the dashboard and everything under it
  // except the pages that have a tab of their own.
  const onSales = !!pathname?.startsWith("/admin/sales");
  const onOrders = !!pathname?.startsWith("/admin") && !onSales;

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
          
          {/* Staff have no use for the ordering menu — they are not buying
              drinks from their own counter. That slot shows sales instead. */}
          {isStaff ? (
            <Link href="/admin/sales" className={tabClasses(onSales)}>
              <svg className={iconClasses(onSales)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 20h18M7 16V9m5 7V5m5 11v-4" />
              </svg>
              <span className="text-[10px] font-medium font-sans uppercase tracking-wider">Sales</span>
            </Link>
          ) : (
            <Link href="/menu" className={tabClasses(!!isActive("/menu"))}>
              <svg className={iconClasses(!!isActive("/menu"))} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="text-[10px] font-medium font-sans uppercase tracking-wider">Menu</span>
            </Link>
          )}

          {/* An order in progress has to be findable without knowing to look
              under Account. The badge is the point: it says out loud that
              something of yours is being made, from wherever you are. */}
          {!isStaff && (
            <Link href="/orders" className={`${tabClasses(!!isActive("/orders"))} relative`}>
              <div className="relative">
                <svg className={iconClasses(!!isActive("/orders"))} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                {activeCount > 0 && (
                  <span
                    aria-label={`${activeCount} ${activeCount === 1 ? "order" : "orders"} in progress`}
                    className="absolute -top-1.5 -right-2.5 bg-amber-500 text-white text-[10px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center shadow-sm animate-scale-in"
                  >
                    {activeCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium font-sans uppercase tracking-wider">Orders</span>
            </Link>
          )}

          {/* The customer's cart is not a tab — it rises as a bar the moment
              there is something in it. This slot is membership: points and
              the vouchers they buy. */}
          {isStaff ? (
            <Link href="/admin" className={`${tabClasses(onOrders)} relative`}>
              <div className="relative">
                <svg className={iconClasses(onOrders)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                {awaitingCount > 0 && (
                  <span
                    aria-label={`${awaitingCount} orders waiting`}
                    className="absolute -top-2 -right-3 bg-red-600 text-white text-[10px] font-bold h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center shadow-md animate-blink"
                  >
                    {awaitingCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium font-sans uppercase tracking-wider">Orders</span>
            </Link>
          ) : (
            <Link href="/membership" className={tabClasses(!!isActive("/membership"))}>
              <svg className={iconClasses(!!isActive("/membership"))} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              <span className="text-[10px] font-medium font-sans uppercase tracking-wider">Membership</span>
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
