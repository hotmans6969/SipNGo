"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * In-app replacements for window.confirm and window.alert.
 *
 * The browser's own dialogs are jarring in an installed app — they carry the
 * site's URL, cannot be styled, and block the whole page. They are also
 * suppressible: a customer who ticks "prevent this page creating more
 * dialogs" silently loses every confirmation afterwards, which for a delete
 * or a cancel is dangerous.
 *
 * The API mirrors what it replaces, so call sites read the same way:
 *
 *   if (await confirm({ title, message })) { ... }
 *   await notify({ title, message });
 */

type Tone = "default" | "danger" | "success";

interface DialogRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
}

interface OpenDialog extends DialogRequest {
  kind: "confirm" | "notify";
  resolve: (value: boolean) => void;
}

interface DialogApi {
  confirm: (request: DialogRequest) => Promise<boolean>;
  notify: (request: DialogRequest) => Promise<boolean>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useDialog must be used within a DialogProvider");
  return context;
}

const TONES: Record<Tone, { accent: string; icon: string }> = {
  default: { accent: "bg-amber-500 hover:bg-amber-600", icon: "❓" },
  danger: { accent: "bg-red-600 hover:bg-red-700", icon: "⚠️" },
  success: { accent: "bg-amber-500 hover:bg-amber-600", icon: "✅" },
};

export default function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [mounted, setMounted] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const open = useCallback(
    (kind: OpenDialog["kind"], request: DialogRequest) =>
      new Promise<boolean>((resolve) => {
        setDialog({ ...request, kind, resolve });
      }),
    []
  );

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (request) => open("confirm", request),
      notify: (request) => open("notify", request),
    }),
    [open]
  );

  const close = useCallback(
    (result: boolean) => {
      dialog?.resolve(result);
      setDialog(null);
    },
    [dialog]
  );

  // Escape cancels, matching what the native dialog did. A pending promise
  // must always settle, or the caller waits for ever.
  useEffect(() => {
    if (!dialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
      if (event.key === "Enter") close(true);
    };
    document.addEventListener("keydown", onKey);
    confirmRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [dialog, close]);

  const tone = TONES[dialog?.tone ?? "default"];

  return (
    <DialogContext.Provider value={api}>
      {children}
      {mounted &&
        dialog &&
        createPortal(
          <div className="app-overlay z-[200] flex items-center justify-center p-4">
            <div
              className="app-overlay bg-black/60 animate-fade-in"
              onClick={() => close(false)}
            />
            <div
              role="alertdialog"
              aria-modal="true"
              aria-label={dialog.title}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative z-10 overflow-hidden animate-scale-in"
            >
              <div className="p-6 text-center">
                <div className="text-4xl mb-3" aria-hidden="true">
                  {tone.icon}
                </div>
                <h2 className="text-lg font-bold text-stone-900">{dialog.title}</h2>
                {dialog.message && (
                  <p className="text-sm text-stone-500 mt-2">{dialog.message}</p>
                )}
              </div>

              <div className="p-4 pt-0 flex flex-col-reverse gap-2">
                {dialog.kind === "confirm" && (
                  <button
                    onClick={() => close(false)}
                    className="flex-1 py-3.5 rounded-xl font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all active:scale-[0.98]"
                  >
                    {dialog.cancelLabel ?? "Cancel"}
                  </button>
                )}
                <button
                  ref={confirmRef}
                  onClick={() => close(true)}
                  className={`flex-1 py-3.5 rounded-xl font-semibold text-white transition-all active:scale-[0.98] ${tone.accent}`}
                >
                  {dialog.confirmLabel ?? (dialog.kind === "confirm" ? "Confirm" : "OK")}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </DialogContext.Provider>
  );
}
