"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns true for a moment each time `value` changes.
 *
 * Used to replay an animation on an element that stays mounted, such as the
 * cart badge: re-keying it would work too, but that throws away the DOM node
 * and any focus on it. Falling edges (a count dropping to zero) are ignored by
 * callers that pass a guard, since removing the last item is already obvious.
 */
export function useBumpOnChange(value: number, durationMs: number = 350): boolean {
  const [bumping, setBumping] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    if (value === previous.current) return;
    const increased = value > previous.current;
    previous.current = value;
    if (!increased) return;

    setBumping(true);
    const timer = setTimeout(() => setBumping(false), durationMs);
    return () => clearTimeout(timer);
  }, [value, durationMs]);

  return bumping;
}
