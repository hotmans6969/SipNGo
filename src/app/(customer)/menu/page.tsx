"use client";

import { useState, useEffect } from "react";
import MenuItemCard from "@/components/MenuItemCard";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import WelcomeVoucherPopup from "@/components/WelcomeVoucherPopup";

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  image_url: string;
  available: number;
  /** Units sold in the ranking window; drives the order the API returns. */
  sold: number;
  /** One of the three best sellers. */
  popular: boolean;
}

export default function MenuPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  // Priced by the server, so the cart and the payment page cannot disagree.
  const [icedSurchargeCents, setIcedSurchargeCents] = useState<number | undefined>(undefined);

  useEffect(() => {
    fetch("/api/menu")
      .then((res) => res.json())
      .then((data) => {
        setItems(data.items || []);
        setIcedSurchargeCents(data.icedSurchargeCents);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Categories are listed in the fixed order the shop sells in, not the order
  // the best-seller ranking happens to return them in — a filter bar that
  // reshuffles itself as sales come in is disorienting.
  const categories = ["all", "coffee", "tea", "smoothies", "juices"].filter(
    (cat) => cat === "all" || items.some((i) => i.category === cat)
  );
  // `items` arrives best-sellers-first from the API; filtering preserves that.
  const filtered = activeCategory === "all" ? items : items.filter((i) => i.category === activeCategory);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="space-y-4">
          <div className="h-8 skeleton rounded w-48" />
          <div className="grid gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 skeleton rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Announces the signup voucher on the first visit after registering. */}
      <WelcomeVoucherPopup />

      {/* Signed-out prompt. The menu is browsable without an account so a
          first-time visitor can see what is sold, but ordering needs one, and
          this says why it is worth making. */}
      {!authLoading && !user && (
        <div className="bg-stone-900 text-white rounded-2xl p-5 mb-6 flex flex-col gap-4 animate-fade-in-up">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl" aria-hidden="true">⭐</span>
              <h2 className="font-bold">Sign in to order</h2>
            </div>
            <p className="text-sm text-stone-300">
              Collect a point for every RM 1 you spend, and put them towards
              rewards. You will also get a notification the moment your drink
              is ready.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href="/auth/register"
              className="flex-1 text-center bg-amber-500 hover:bg-amber-600 text-white font-semibold px-5 py-3 rounded-xl transition-all active:scale-95"
            >
              Sign up
            </Link>
            <Link
              href="/auth/login"
              className="flex-1 text-center bg-stone-800 hover:bg-stone-700 text-white font-semibold px-5 py-3 rounded-xl transition-all active:scale-95"
            >
              Log in
            </Link>
          </div>
        </div>
      )}

      {/* Event/Offer Banner */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-6 mb-8 text-white shadow-md">
        <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3 inline-block">Special Offer</span>
        <h2 className="text-2xl font-bold mb-1">Buy 1 Get 1 Free on all Coffee! {'\u2615'}</h2>
        <p className="text-amber-50 opacity-90">Celebrate this week with double the energy. Available while supplies last.</p>
      </div>

      <div className="flex flex-col justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-900">Our Menu</h1>
          <p className="text-stone-500 mt-1">
            {items.some((i) => i.popular)
              ? "Our best sellers first — chosen by what people are ordering this month"
              : "Choose from our selection of drinks and food"}
          </p>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6 scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === cat
                ? "bg-amber-500 text-white"
                : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
            }`}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Menu Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-stone-400 text-lg">No items found in this category</p>
        </div>
      ) : (
        <div
          key={activeCategory}
          className="grid gap-5 stagger-children"
        >
          {filtered.map((item) => (
            <MenuItemCard
              key={item.id}
              id={item.id}
              name={item.name}
              description={item.description}
              priceCents={item.price_cents}
              category={item.category}
              imageUrl={item.image_url}
              popular={item.popular}
              icedSurchargeCents={icedSurchargeCents}
            />
          ))}
        </div>
      )}
    </div>
  );
}

