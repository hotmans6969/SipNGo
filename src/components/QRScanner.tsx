"use client";

import { useEffect, useRef, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [cameraError, setCameraError] = useState("");

  // The scanner is started once and must stay running. Holding the callback in
  // a ref keeps it out of the effect's dependencies: the dashboard recreates
  // its handler on every render and re-renders every few seconds while
  // polling, which previously tore the camera down and rebuilt it each time.
  const onScanSuccessRef = useRef(onScanSuccess);
  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 200);
  };

  useEffect(() => {
    let cancelled = false;

    // Check for camera access up front so a refusal explains itself, rather
    // than leaving an empty frame with no indication of what went wrong.
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "This browser cannot open the camera. Try Chrome, and make sure the page is on https."
        );
        return;
      }

      try {
        // Released immediately; html5-qrcode opens its own stream. This exists
        // only to surface the permission result as a readable message.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        stream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (name === "NotAllowedError") {
          setCameraError(
            "Camera access was denied. Allow the camera for this site in your browser settings, then reopen the scanner."
          );
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setCameraError("No camera was found on this device.");
        } else {
          setCameraError(
            "The camera could not be started. It may be in use by another app."
          );
        }
        return;
      }

      if (cancelled) return;

      scannerRef.current = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );

      scannerRef.current.render(
        (decodedText) => {
          // Stop scanning after a hit so one code cannot fire repeatedly.
          scannerRef.current?.clear().catch(() => {});
          onScanSuccessRef.current(decodedText);
        },
        () => {
          // Scan errors fire continuously until a code is in frame.
        }
      );
    };

    void start();

    return () => {
      cancelled = true;
      scannerRef.current?.clear().catch(() => {});
      scannerRef.current = null;
    };
    // Intentionally runs once: the camera must not restart while the dialog
    // is open.
  }, []);

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
            {"✕"}
          </button>
        </div>
        <div className="p-4">
          {cameraError ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-3" aria-hidden="true">
                📷
              </div>
              <p className="text-stone-700 font-semibold mb-1">Camera unavailable</p>
              <p className="text-sm text-stone-500">{cameraError}</p>
            </div>
          ) : (
            <>
              <div
                id="qr-reader"
                className="w-full rounded-xl overflow-hidden shadow-sm border border-stone-200"
              />
              <p className="text-center text-sm text-stone-500 mt-4">
                Position the order QR code inside the camera frame.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
