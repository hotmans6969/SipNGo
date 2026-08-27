"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { usePolling } from "@/hooks/usePolling";
import { useOrderAlarm } from "@/hooks/useOrderAlarm";

/**
 * Watches for orders waiting to be started, anywhere in the app.
 *
 * This lives above the pages rather than inside the dashboard because staff
 * do not stand on one screen. Someone checking sales or editing the menu
 * still has to hear an order arrive — previously the alarm only ran while the
 * orders board happened to be open, so an order placed while they were
 * elsewhere went unannounced.
 *
 * It is also the single owner of the alarm. Running it here and in the
 * dashboard would chime twice.
 */

interface StaffAlerts {
  awaitingCount: number;
  soundBlocked: boolean;
  enableSound: () => void | Promise<void>;
  /** Re-reads the count immediately, e.g. after accepting an order. */
  refresh: () => void;
}

const StaffAlertContext = createContext<StaffAlerts>({
  awaitingCount: 0,
  soundBlocked: false,
  enableSound: () => {},
  refresh: () => {},
});

export function useStaffAlerts(): StaffAlerts {
  return useContext(StaffAlertContext);
}

export function StaffAlertProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "staff";
  const [awaitingCount, setAwaitingCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isStaff) return;
    try {
      // Only the total is needed, so one row is asked for.
      const res = await fetch("/api/admin/orders?status=paid&limit=1");
      if (!res.ok) return;
      const data = await res.json();
      setAwaitingCount(data.total ?? 0);
    } catch {
      // Leave the previous count rather than falsely silencing the alarm.
    }
  }, [isStaff]);

  // Read the count once as soon as a staff member is known, rather than
  // waiting for the first poll. Polling pauses while the tab is hidden, so
  // without this the badge and alarm stayed dormant for up to five seconds —
  // and indefinitely if the app was opened into a hidden tab.
  useEffect(() => {
    if (!isStaff) {
      // Clearing on sign-out is the point, not a cascading render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAwaitingCount(0);
      return;
    }
    void refresh();
  }, [isStaff, refresh]);

  // Pauses while the tab is hidden and refreshes the moment it returns.
  usePolling(refresh, 5000, isStaff);

  const { blocked: soundBlocked, enableSound } = useOrderAlarm(isStaff && awaitingCount > 0);

  return (
    <StaffAlertContext.Provider
      value={{
        awaitingCount: isStaff ? awaitingCount : 0,
        soundBlocked,
        enableSound,
        refresh,
      }}
    >
      {children}
    </StaffAlertContext.Provider>
  );
}
