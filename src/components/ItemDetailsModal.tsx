"use client";

import { useState } from "react";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/format";
import MenuItemImage from "./MenuItemImage";
import {
  TOPPINGS,
  TOPPING_PRICE_CENTS,
  DEFAULT_ICED_SURCHARGE_CENTS,
  normaliseToppings,
  toppingsPriceCents,
} from "@/lib/toppings";

interface ItemDetailsModalProps {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  category: string;
  imageUrl?: string;
  /**
   * What the shop charges for ice, from the server. Falls back to the default
   * only when the menu has not loaded — guessing it here is what let the cart
   * quote a different total from the one actually charged.
   */
  icedSurchargeCents?: number;
  onClose: () => void;
}

export default function ItemDetailsModal({
  id,
  name,
  description,
  priceCents,
  category,
  imageUrl,
  icedSurchargeCents = DEFAULT_ICED_SURCHARGE_CENTS,
  onClose,
}: ItemDetailsModalProps) {
  const { addItem } = useCart();
  const [temperature, setTemperature] = useState<"hot" | "iced">("hot");
  const [sugarLevel, setSugarLevel] = useState<"normal" | "less" | "none">("normal");
  const [remark, setRemark] = useState("");
  const [toppings, setToppings] = useState<string[]>([]);
  const [isClosing, setIsClosing] = useState(false);

  const toggleTopping = (toppingId: string) => {
    setToppings((current) =>
      // Normalised on every change so the stored order matches the menu, which
      // is what makes two identically-topped drinks merge into one cart line.
      normaliseToppings(
        current.includes(toppingId)
          ? current.filter((t) => t !== toppingId)
          : [...current, toppingId]
      )
    );
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 200); // Wait for exit animation
  };

  const handleAddToCart = () => {
    addItem({
      menuItemId: id,
      name,
      // The price the customer will actually be charged for this line. The
      // base price was sent before, so the cart total quietly disagreed with
      // the server whenever a surcharge applied.
      priceCents: calculatedPrice,
      category,
      sugarLevel,
      temperature,
      remark,
      toppings,
    });
    handleClose();
  };

  const calculatedPrice =
    priceCents +
    (temperature === "iced" ? icedSurchargeCents : 0) +
    toppingsPriceCents(toppings);

  return (
    <div className="app-overlay z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`app-overlay bg-black/60 transition-opacity duration-200 ${
          isClosing ? "opacity-0" : "animate-fade-in opacity-100"
        }`}
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={name}
        className={`bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10 flex flex-col max-h-[90vh] ${
          isClosing
            ? "scale-95 opacity-0 transition-all duration-200"
            : "animate-scale-in"
        }`}
      >
        <div className="w-full h-48 overflow-hidden bg-stone-100">
          <MenuItemImage src={imageUrl} alt={name} category={category} />
        </div>
        
        <div className="p-5 flex-1 overflow-y-auto">
          <div className="flex justify-between items-start gap-4 mb-2">
            <h2 className="text-2xl font-bold text-stone-900">{name}</h2>
            <button 
              onClick={handleClose}
              className="text-stone-400 hover:text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
            >
              &times;
            </button>
          </div>
          
          <p className="text-stone-500 text-sm mb-6 pb-4 border-b border-stone-100">{description}</p>
          
          <div className="space-y-6">
            {/* Temperature */}
            <div>
              <h3 className="font-semibold text-stone-900 mb-3 flex justify-between">
                <span>Temperature</span>
                {temperature === "iced" && <span className="text-amber-600 font-medium">+RM 1.00</span>}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTemperature("hot")}
                  className={`py-3 px-4 rounded-xl border font-medium transition-all ${
                    temperature === "hot" 
                      ? "border-amber-500 bg-amber-50 text-amber-700 ring-1 ring-amber-500" 
                      : "border-stone-200 text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  {'\u2615'} Hot
                </button>
                <button
                  onClick={() => setTemperature("iced")}
                  className={`py-3 px-4 rounded-xl border font-medium transition-all ${
                    temperature === "iced" 
                      ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500" 
                      : "border-stone-200 text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  {'\u2744\uFE0F'} Iced
                </button>
              </div>
            </div>
            
            {/* Sugar Level */}
            <div>
              <h3 className="font-semibold text-stone-900 mb-3">Sugar Level</h3>
              <div className="grid grid-cols-3 gap-2">
                {(["normal", "less", "none"] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setSugarLevel(level)}
                    className={`py-2 px-2  rounded-xl border text-sm font-medium transition-all ${
                      sugarLevel === level 
                        ? "border-amber-500 bg-amber-50 text-amber-700 ring-1 ring-amber-500" 
                        : "border-stone-200 text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Toppings */}
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-semibold text-stone-900">Toppings</h3>
                <span className="text-xs text-stone-400">
                  +{formatPrice(TOPPING_PRICE_CENTS)} each
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {TOPPINGS.map((topping) => {
                  const selected = toppings.includes(topping.id);
                  return (
                    <button
                      key={topping.id}
                      onClick={() => toggleTopping(topping.id)}
                      aria-pressed={selected}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all active:scale-95 flex items-center gap-2 ${
                        selected
                          ? "border-amber-500 bg-amber-50 text-amber-700 ring-1 ring-amber-500"
                          : "border-stone-200 text-stone-600 hover:bg-stone-50"
                      }`}
                    >
                      <span aria-hidden="true">{topping.emoji}</span>
                      <span className="truncate">{topping.label}</span>
                    </button>
                  );
                })}
              </div>
              {toppings.length > 0 && (
                <p className="text-xs text-stone-500 mt-2 animate-fade-in">
                  {toppings.length} topping{toppings.length === 1 ? "" : "s"} ·
                  +{formatPrice(toppingsPriceCents(toppings))}
                </p>
              )}
            </div>

            {/* Remarks */}
            <div>
              <h3 className="font-semibold text-stone-900 mb-3">Remarks</h3>
              <textarea 
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Any special requests?"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all resize-none"
                rows={2}
              />
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t border-stone-100 bg-white sticky bottom-0">
          <button 
            onClick={handleAddToCart}
            className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white font-semibold rounded-xl flex items-center justify-between px-6 transition-all shadow-md hover:shadow-lg"
          >
            <span>Add to Cart</span>
            <span>{formatPrice(calculatedPrice)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}