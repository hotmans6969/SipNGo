"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

export interface CartItem {
  id: string; // unique id for cart item, because same menu item can have different customizations
  menuItemId: string;
  name: string;
  priceCents: number;
  quantity: number;
  category: string;
  sugarLevel?: string;
  // Narrowed to what the order API accepts, so a mismatch is a compile
  // error rather than a rejected checkout.
  temperature?: "hot" | "iced";
  remark?: string;
  /** Topping ids, already normalised by the picker. */
  toppings?: string[];
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity" | "id">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  totalCents: number;
  totalItems: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "sipngo_cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount. This has to run after mount rather
  // than as a lazy initial state, or the server-rendered HTML and the first
  // client render disagree and hydration fails.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
        setItems(JSON.parse(stored));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // Save cart to localStorage on changes
  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((item: Omit<CartItem, "quantity" | "id">) => {
    setItems((prev) => {
      // Find if we already have this exact configuration
      // Toppings are part of what makes two lines the same drink. Without
      // comparing them, adding a boba latte on top of a plain one would just
      // bump the plain one's quantity and lose the topping.
      const sameToppings = (a?: string[], b?: string[]) =>
        (a ?? []).join(",") === (b ?? []).join(",");

      const existing = prev.find(
        (i) =>
          i.menuItemId === item.menuItemId &&
          i.sugarLevel === item.sugarLevel &&
          i.temperature === item.temperature &&
          i.remark === item.remark &&
          sameToppings(i.toppings, item.toppings)
      );
      
      if (existing) {
        return prev.map((i) =>
          i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      
      const newId = Math.random().toString(36).substring(2, 9);
      return [...prev, { ...item, id: newId, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantity } : i))
      );
    }
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, totalCents, totalItems }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
