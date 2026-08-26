"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const DISMISSED_KEY = "sipngo_push_prompt_dismissed";

/** VAPID keys travel as base64url but PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Asks for notification permission, then registers the device for push.
 *
 * Deliberately not fired on page load. Browsers reject — and increasingly
 * auto-block — a permission request that arrives without a user gesture, and
 * a prompt with no explanation is usually denied outright. A denial is close
 * to permanent, so the card explains the benefit first and the actual request
 * happens on the tap.
 */
export default function PushNotificationPrompt() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || !pushSupported()) return;
    if (Notification.permission !== "default") return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // Private browsing can throw on access; treat as not dismissed.
    }
    if (dismissed) return;

    // A short delay keeps the card from competing with the page arriving.
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, [user]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do; the prompt simply reappears next visit.
    }
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(
          permission === "denied"
            ? "Notifications are blocked. You can re-enable them in your browser settings."
            : "Notifications were not enabled."
        );
        setBusy(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setError("Push is not configured on this deployment.");
        setBusy(false);
        return;
      }

      // An existing subscription is reused; re-subscribing returns the same
      // endpoint anyway, and the server upserts on it.
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        }));

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Could not register this device.");
      }

      setVisible(false);
      try {
        localStorage.setItem(DISMISSED_KEY, "1");
      } catch {
        // Not important enough to fail on.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-[90] animate-slide-up">
      <div className="bg-white border border-stone-200 rounded-2xl shadow-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="text-2xl" aria-hidden="true">
            🔔
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-stone-900">Get notified about your order</h3>
            <p className="text-sm text-stone-500 mt-1">
              We&apos;ll let you know the moment your drink is ready — even with the app closed.
            </p>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button
                onClick={enable}
                disabled={busy}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-50"
              >
                {busy ? "Enabling…" : "Turn on"}
              </button>
              <button
                onClick={dismiss}
                className="px-4 py-2.5 text-stone-500 hover:text-stone-700 font-medium rounded-lg transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
