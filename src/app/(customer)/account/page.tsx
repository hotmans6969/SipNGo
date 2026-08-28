"use client";

import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Account: the housekeeping only.
 *
 * Points and vouchers moved to /membership, which has its own tab. What is
 * left here is the two things a customer comes to this screen to do — look up
 * a past order, or sign out.
 */
export default function AccountPage() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  if (authLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="space-y-4">
          <div className="h-32 skeleton rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    router.push("/auth/login");
    return null;
  }

  const isStaff = user.role === "admin" || user.role === "staff";

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-6">My Account</h1>

      <div className="bg-gradient-to-br from-stone-800 to-stone-900 rounded-2xl p-6 text-white shadow-md mb-6 relative overflow-hidden">
        <div className="relative z-10 flex flex-col items-center justify-center py-4">
          <div className="w-16 h-16 bg-stone-700 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-1">{user.name}</h2>
          <p className="text-stone-400 capitalize">{user.role} Account</p>
        </div>
      </div>

      <div className="space-y-3">
        {!isStaff && (
          <Link 
            href="/orders"
            className="flex items-center justify-between bg-white border border-stone-200 p-4 rounded-xl hover:bg-stone-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <span className="font-semibold text-stone-900">My Orders</span>
            </div>
            <span className="text-stone-400">&rarr;</span>
          </Link>
        )}

        {isStaff && (
          <Link 
            href="/admin"
            className="flex items-center justify-between bg-white border border-stone-200 p-4 rounded-xl hover:bg-stone-50 transition-colors"
          >
            <span className="font-semibold text-stone-900">Admin Dashboard</span>
            <span className="text-stone-400">&rarr;</span>
          </Link>
        )}
        
        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-between text-left bg-white border border-stone-200 p-4 rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors group"
        >
          <span className="font-semibold text-stone-900 group-hover:text-red-600">Logout</span>
          <svg className="w-5 h-5 text-stone-400 group-hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
