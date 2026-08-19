"use client";

import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AccountPage() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  if (authLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-stone-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    router.push("/auth/login");
    return null;
  }

  const points = user.points || 0;
  
  let tier = "Bronze Member";
  let tierColor = "bg-orange-100 text-orange-800 border-orange-200";
  if (points >= 500) {
    tier = "Gold Member";
    tierColor = "bg-yellow-100 text-yellow-800 border-yellow-300";
  } else if (points >= 100) {
    tier = "Silver Member";
    tierColor = "bg-stone-200 text-stone-800 border-stone-300";
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-6">My Account</h1>

      <div className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-2xl p-6 text-white shadow-xl mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-amber-500 opacity-20 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>

        <div className="relative z-10">
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="text-stone-400 text-sm mb-1">Member Name</p>
              <h2 className="text-2xl font-bold">{user.name}</h2>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${tierColor}`}>
              {tier}
            </span>
          </div>

          <div>
            <p className="text-stone-400 text-sm mb-1">Available Points</p>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-black text-amber-400">{points}</span>
              <span className="text-stone-300 mb-1 font-medium">pts</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-2 mb-6">
        <p className="text-sm text-stone-500 px-4 py-3 bg-stone-50 rounded-xl text-center">
          Earn 1 point for every RM 1 spent!
        </p>
      </div>

      <div className="space-y-3">
        {(user.role === "admin" || user.role === "staff") && (
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
