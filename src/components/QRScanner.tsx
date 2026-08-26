"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

type Phase = "idle" | "starting" | "scanning" | "error";

export default function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [cameraError, setCameraError] = useState("");
  const [isClosing, setIsClosing] = useState(false);

  // Held in a ref so the scanner is never restarted by the dashboard
  // re-rendering, which it does every few seconds while polling.
  const onScanSuccessRef = useRef(onScanSuccess);
  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      // stop() throws if it was never started; either way the instance goes.
      await scanner.stop();
    } catch {
      // Nothing useful to do — the camera is being released regardless.
    }
    try {
      scanner.clear();
    } catch {
      // As above.
    }
  }, []);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    void stopCamera();
    setTimeout(onClose, 200);
  }, [onClose, stopCamera]);

  /**
   * Starts the camera. Deliberately triggered by a tap rather than on mount:
   * opening a camera the moment a dialog appears is startling, fires the
   * permission prompt before the operator knows why it is being asked, and on
   * several browsers a capture started without a user gesture is refused
   * outright.
   */
  const startCamera = useCallback(async () => {
    setCameraError("");
    setPhase("starting");

    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        // `exact` pins this to the rear camera. Without it a phone opens the
        // selfie camera, which cannot be aimed at a customer's screen.
        { facingMode: { exact: "environment" } },
        {
          fps: 10,
          // Sized from the actual viewfinder rather than a fixed 250px, which
          // overflows the video on a narrow phone.
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const smallest = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.max(160, Math.floor(smallest * 0.7));
            return { width: size, height: size };
          },
        },
        (decodedText) => {
          // Release the camera before handing over, so one code cannot fire
          // repeatedly while the request is in flight.
          void stopCamera();
          onScanSuccessRef.current(decodedText);
        },
        () => {
          // Fires continuously until a code is in frame; not an error.
        }
      );

      setPhase("scanning");
    } catch (error) {
      scannerRef.current = null;
      const name = error instanceof Error ? error.name : "";
      const text = error instanceof Error ? error.message : String(error);

      if (name === "NotAllowedError" || /permission/i.test(text)) {
        setCameraError(
          "Camera access was denied. Allow the camera for this site in your browser settings, then try again."
        );
      } else if (name === "OverconstrainedError" || /facingMode|constraint/i.test(text)) {
        setCameraError("No rear camera was found on this device.");
      } else if (name === "NotFoundError") {
        setCameraError("No camera was found on this device.");
      } else if (name === "NotReadableError") {
        setCameraError("The camera is already in use by another app.");
      } else {
        setCameraError("The camera could not be started. Please try again.");
      }
      setPhase("error");
    }
  }, [stopCamera]);

  // Release the camera if the dialog goes away by any other route.
  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className={`fixed inset-0 bg-black/70 transition-opacity duration-200 ${
          isClosing ? "opacity-0" : "opacity-100"
        }`}
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Scan customer QR code"
        className={`bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-xl relative z-10 transition-all duration-200 transform ${
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100 translate-y-0"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-stone-100 bg-stone-50">
          <h3 className="font-bold text-stone-900">Scan Customer QR Code</h3>
          <button
            onClick={handleClose}
            aria-label="Close scanner"
            className="text-stone-400 hover:text-stone-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-200 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {/* Must stay in the layout, not just mounted. html5-qrcode measures
              this element when start() is called to size the video, and a
              display:none container measures zero — which is why the frame
              came up empty. Left empty it collapses to no height anyway, so
              it costs nothing while idle. */}
          <div
            id="qr-reader"
            className={
              phase === "scanning"
                ? "w-full min-h-[260px] rounded-xl overflow-hidden shadow-sm border border-stone-200 bg-stone-900"
                : "w-full"
            }
          />

          {phase === "scanning" ? (
            <>
              <p className="text-center text-sm text-stone-500 mt-4">
                Hold the customer&apos;s QR code inside the frame.
              </p>
              <button
                onClick={() => {
                  void stopCamera();
                  setPhase("idle");
                }}
                className="w-full mt-3 py-2.5 text-sm text-stone-500 hover:text-stone-700 font-medium transition-colors"
              >
                Stop camera
              </button>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="text-5xl mb-4" aria-hidden="true">
                {phase === "error" ? "📷" : "🔳"}
              </div>

              {phase === "error" && (
                <p className="text-sm text-red-600 mb-4 px-2">{cameraError}</p>
              )}

              {phase === "idle" && (
                <p className="text-sm text-stone-500 mb-5 px-2">
                  The rear camera opens only when you tap below.
                </p>
              )}

              <button
                onClick={startCamera}
                disabled={phase === "starting"}
                className="w-full py-5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-lg rounded-2xl transition-all active:scale-[0.97] disabled:opacity-60 flex items-center justify-center gap-3"
              >
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10V3h7m11 7V3h-7m-11 11v7h7m11-7v7h-7"
                  />
                </svg>
                {phase === "starting"
                  ? "Opening camera…"
                  : phase === "error"
                    ? "Try again"
                    : "Scan QR code"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
