"use client";

import { useCart } from "@/context/CartContext";

interface MenuItemCardProps {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  category: string;
  imageUrl?: string;
}

export default function MenuItemCard({ id, name, description, priceCents, category, imageUrl }: MenuItemCardProps) {
  const { addItem, items, updateQuantity, removeItem } = useCart();
  const cartItem = items.find((i) => i.menuItemId === id);

  const formatPrice = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;

  const categoryStyles: Record<string, string> = {
    coffee: "bg-amber-100 text-amber-800",
    tea: "bg-green-100 text-green-800",
    smoothies: "bg-purple-100 text-purple-800",
    juices: "bg-orange-100 text-orange-800",
    pastries: "bg-pink-100 text-pink-800",
    food: "bg-blue-100 text-blue-800",
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 flex flex-col justify-between hover:shadow-md transition-shadow overflow-hidden">
      {imageUrl && (
        <div className="w-full h-48 overflow-hidden bg-stone-100 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-5 flex flex-col justify-between flex-1">
        <div>
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-stone-900 text-lg">{name}</h3>
            <span className="font-bold text-amber-600 whitespace-nowrap">{formatPrice(priceCents)}</span>
          </div>
          <span
            className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-2 ${
              categoryStyles[category] || "bg-stone-100 text-stone-600"
            }`}
          >
            {category}
          </span>
          {description && (
            <p className="text-stone-500 text-sm mt-1">{description}</p>
          )}
        </div>

        <div className="mt-4">
        {cartItem ? (
          <div className="flex items-center justify-between bg-stone-50 rounded-lg p-1">
            <button
              onClick={() => {
                if (cartItem.quantity <= 1) {
                  removeItem(id);
                } else {
                  updateQuantity(id, cartItem.quantity - 1);
                }
              }}
              className="w-9 h-9 flex items-center justify-center rounded-md bg-white border border-stone-200 text-stone-600 hover:bg-stone-100 font-bold transition-colors"
            >
              -
            </button>
            <span className="font-semibold text-stone-900">{cartItem.quantity}</span>
            <button
              onClick={() => updateQuantity(id, cartItem.quantity + 1)}
              className="w-9 h-9 flex items-center justify-center rounded-md bg-amber-500 text-white hover:bg-amber-600 font-bold transition-colors"
            >
              +
            </button>
          </div>
        ) : (
          <button
            onClick={() => addItem({ menuItemId: id, name, priceCents, category })}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors"
          >
            Add to Cart
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
