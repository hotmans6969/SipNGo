"use client";

import { useState } from "react";
import ItemDetailsModal from "./ItemDetailsModal";
import MenuItemImage from "./MenuItemImage";
import { formatPrice } from "@/lib/format";

interface MenuItemCardProps {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  category: string;
  imageUrl?: string;
  /** One of the best sellers, called out at the top of the menu. */
  popular?: boolean;
}

export default function MenuItemCard({ id, name, description, priceCents, category, imageUrl, popular }: MenuItemCardProps) {
  const [showModal, setShowModal] = useState(false);


  const categoryStyles: Record<string, string> = {
    coffee: "bg-amber-100 text-amber-800",
    tea: "bg-green-100 text-green-800",
    smoothies: "bg-purple-100 text-purple-800",
    juices: "bg-orange-100 text-orange-800",
    pastries: "bg-pink-100 text-pink-800",
    food: "bg-blue-100 text-blue-800",
  };

  return (
    <>
      <div 
        className="bg-white rounded-xl border border-stone-200 flex flex-col justify-between hover:shadow-lg hover:border-amber-200 transition-all duration-200 transform hover:-translate-y-1 active:translate-y-0 active:scale-[0.98] cursor-pointer overflow-hidden group"
        onClick={() => setShowModal(true)}
      >
        <div className="relative w-full h-48 overflow-hidden bg-stone-100 flex items-center justify-center">
          <MenuItemImage
            src={imageUrl}
            alt={name}
            category={category}
            className="transition-transform duration-500 group-hover:scale-110"
          />
          {popular && (
            <span className="absolute top-3 left-3 bg-amber-500 text-white text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
              <span aria-hidden="true">🔥</span> Popular
            </span>
          )}
        </div>
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowModal(true);
              }}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-semibold rounded-lg transition-all"
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>
      
      {showModal && (
        <ItemDetailsModal
          id={id}
          name={name}
          description={description}
          priceCents={priceCents}
          category={category}
          imageUrl={imageUrl}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
