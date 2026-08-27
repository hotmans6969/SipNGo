"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import RewardsPanel from "@/components/RewardsPanel";

/**
 * Membership: the points balance and everything those points buy.
 *
 * These used to live at the bottom of the account page, below the profile and
 * the settings, which is the wrong end of the screen for the part customers
 * open most. Account is now just the housekeeping.
 */
export default function MembershipPage() {
  const { user, loading: authLoading, refreshUser } = useAuth();

  if (authLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="h-8 w-48 skeleton rounded-lg mb-6" />
        <div className="h-44 skeleton rounded-2xl mb-6" />
        <div className="h-40 skeleton rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-stone-900 mb-6">Membership</h1>
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
          <span className="text-4xl block mb-3" aria-hidden="true">🎟️</span>
          <h2 className="text-xl font-semibold text-stone-700 mb-2">Join the club</h2>
          <p className="text-stone-500 mb-6">
            Log in to collect points on every order and swap them for free drinks.
          </p>
          <Link
            href="/auth/login"
            className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3 rounded-lg transition-all active:scale-95"
          >
            Log in
          </Link>
        </div>
      </div>
    );
  }

  // Staff do not earn points on the counter they work behind.
  if (user.role === "admin" || user.role === "staff") {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-stone-900 mb-6">Membership</h1>
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center">
          <p className="text-stone-500">Points and vouchers are for customer accounts.</p>
        </div>
      </div>
    );
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

  // How far along the current tier the customer is, so the bar means
  // something rather than just decorating the card.
  const nextAt = points >= 500 ? null : points >= 100 ? 500 : 100;
  const floor = points >= 100 ? 100 : 0;
  const progress = nextAt ? Math.min(100, ((points - floor) / (nextAt - floor)) * 100) : 100;

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-6">Membership</h1>

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

          {nextAt && (
            <div className="mt-5">
              <div className="h-1.5 bg-stone-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-stone-400 mt-2">
                {nextAt - points} more points to {nextAt >= 500 ? "Gold" : "Silver"}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-2 mb-6">
        <p className="text-sm text-stone-500 px-4 py-3 bg-stone-50 rounded-xl text-center">
          Earn 1 point for every RM 1 spent
        </p>
      </div>

      <RewardsPanel onPointsChange={refreshUser} />
    </div>
  );
}
