"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `callback` on an interval, but only while the tab is visible.
 *
 * A backgrounded dashboard used to keep hitting the orders endpoint every two
 * seconds forever. Pausing on hidden cuts that to nothing, and refreshing
 * immediately on return means the operator still sees current data.
 */
export function usePolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean = true
): void {
  // Kept in a ref so a caller can pass an inline arrow without restarting the
  // interval on every render. Assigned in an effect, never during render.
  const savedCallback = useRef(callback);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    const start = () => {
      stop();
      timer = setInterval(() => void savedCallback.current(), intervalMs);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        void savedCallback.current();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [intervalMs, enabled]);
}
