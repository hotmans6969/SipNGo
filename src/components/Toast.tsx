"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface ToastMessage {
  title: string;
  message: string;
}

/**
 * An in-app notification banner.
 *
 * Rendered into `document.body` through a portal rather than in place. A high
 * z-index alone is not enough: any ancestor that creates a stacking context —
 * and an element animating `opacity`, like the page-transition wrapper, does
 * exactly that — confines its descendants' z-index to that context. The toast
 * then sits at the top of a layer that the sticky header paints over, which is
 * why it appeared behind the SipNGo bar. Portalling to the body puts it back
 * in the root stacking context where its z-index means what it says.
 */
export default function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastMessage | null;
  onDismiss: () => void;
}) {
  // Portals need a DOM to target, which does not exist during the server
  // render, so nothing is emitted until after mount.
  const [mounted, setMounted] = useState(false);
  // Detecting that we are past the server render is the entire purpose here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted || !toast) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 bg-stone-900 text-white p-5 rounded-2xl shadow-2xl z-[100] animate-bounce-short border border-stone-700"
    >
      <div className="flex justify-between items-start gap-4">
        <div>
          <h4 className="font-bold text-lg text-amber-400 mb-1">{toast.title}</h4>
          <p className="text-sm opacity-90">{toast.message}</p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="text-stone-400 hover:text-white transition-all hover:scale-110 active:scale-90"
        >
          ✕
        </button>
      </div>
    </div>,
    document.body
  );
}
