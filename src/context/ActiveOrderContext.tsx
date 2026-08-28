"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { usePolling } from "@/hooks/usePolling";
import { isActiveOrder } from "@/lib/order-status";

export interface CustomerOrderItem {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
}

export interface CustomerOrder {
  id: string;
  order_number: number;
  order_date: string;
  status: string;
  total_cents: number;
  created_at: string;
  items: CustomerOrderItem[];
}

interface ActiveOrders {
  /** Every order the customer has, newest first. */
  orders: CustomerOrder[];
  /** The ones still on their way — what the Orders badge counts. */
  active: CustomerOrder[];
  activeCount: number;
  /** False only while this customer's own orders are still on their way. */
  loaded: boolean;
  /** Re-reads immediately, e.g. straight after checkout. */
  refresh: () => void;
}

const ActiveOrderContext = createContext<ActiveOrders>({
  orders: [],
  active: [],
  activeCount: 0,
  loaded: false,
  refresh: () => {},
});

export function useActiveOrders(): ActiveOrders {
  return useContext(ActiveOrderContext);
}

/** Watched closely while something is being made, loosely the rest of the time. */
const WATCHING_MS = 5000;
const IDLE_MS = 30000;

/**
 * The customer's orders, owned above the pages that show them.
 *
 * The Orders tab carries a badge, so the count has to be known from anywhere
 * in the app, not only while the orders page happens to be open. Holding the
 * list here also means the badge and the page are never one poll apart, and
 * there is only ever one request in flight rather than one per screen.
 */
export function ActiveOrderProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isCustomer = !!user && user.role === "customer";
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  // Whose orders are being held. Tracking the id rather than a bare boolean
  // means a signed-out visitor and a member of staff are "loaded" — there is
  // nothing coming for them — while a customer only counts as loaded once
  // their own orders have arrived, so switching account cannot briefly show
  // one person the other's empty state.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const userId = user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!isCustomer || !userId) return;
    try {
      const res = await fetch("/api/orders");
      if (!res.ok) return;
      const data = await res.json();
      setOrders(data.orders ?? []);
      setLoadedFor(userId);
    } catch {
      // Keep whatever was last known rather than blanking the badge.
    }
  }, [isCustomer, userId]);

  useEffect(() => {
    if (!isCustomer) {
      // Clearing on sign-out is the point, not a cascading render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrders([]);
      return;
    }
    void refresh();
  }, [isCustomer, refresh]);

  const active = useMemo(() => orders.filter((o) => isActiveOrder(o.status)), [orders]);

  // A drink being made is worth watching closely; a customer browsing the menu
  // with nothing on order is not, and polling them every five seconds would be
  // a request per customer per five seconds for news that never comes.
  usePolling(refresh, active.length > 0 ? WATCHING_MS : IDLE_MS, isCustomer);

  const loaded = !isCustomer || loadedFor === userId;

  const value = useMemo(
    () => ({ orders, active, activeCount: active.length, loaded, refresh }),
    [orders, active, loaded, refresh]
  );

  return <ActiveOrderContext.Provider value={value}>{children}</ActiveOrderContext.Provider>;
}
