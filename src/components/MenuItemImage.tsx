"use client";

import { useState } from "react";

/**
 * A menu photograph, with something to show when there isn't one.
 *
 * Two of the seeded Unsplash photos were withdrawn upstream and started
 * answering 404, and an item added from the admin screen need not carry a
 * photograph at all. Both cases used to leave a hole in the grid — a broken
 * image icon, or a card visibly shorter than the ones beside it. Falling back
 * to a category-tinted tile keeps the row even and still says what the drink
 * is, and the failure is recoverable: a working URL always wins.
 */
const CATEGORY_ART: Record<string, { glyph: string; tint: string }> = {
  coffee: { glyph: "☕", tint: "from-amber-100 to-amber-200" },
  tea: { glyph: "🍵", tint: "from-green-100 to-green-200" },
  smoothies: { glyph: "🥤", tint: "from-purple-100 to-purple-200" },
  juices: { glyph: "🍊", tint: "from-orange-100 to-orange-200" },
};

const DEFAULT_ART = { glyph: "🥤", tint: "from-stone-100 to-stone-200" };

export default function MenuItemImage({
  src,
  alt,
  category,
  className = "",
}: {
  src?: string;
  alt: string;
  category: string;
  className?: string;
}) {
  // Remembering which URL failed rather than a bare boolean means a changed
  // `src` gets a fresh attempt without an effect to reset the flag.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const broken = !src || failedSrc === src;

  if (broken) {
    const art = CATEGORY_ART[category] ?? DEFAULT_ART;
    return (
      <div
        role="img"
        aria-label={`${alt} — no photograph`}
        className={`w-full h-full bg-gradient-to-br ${art.tint} flex items-center justify-center ${className}`}
      >
        <span className="text-5xl opacity-60 select-none" aria-hidden="true">
          {art.glyph}
        </span>
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      onError={() => setFailedSrc(src)}
      className={`w-full h-full object-cover ${className}`}
    />
  );
}
