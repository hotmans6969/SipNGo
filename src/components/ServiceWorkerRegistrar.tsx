"use client";

import { useEffect } from "react";

/**
 * Registers the service worker from a client component instead of an inline
 * dangerouslySetInnerHTML script, so it needs no script-src exception and
 * failures are visible rather than silent.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed:", error);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
