"use client";

import { useEffect, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScanSuccess, onClose }: QRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Initialize the scanner
    scannerRef.current = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scannerRef.current.render(
      (decodedText) => {
        // Stop scanning after a successful scan to prevent multiple triggers
        if (scannerRef.current) {
          scannerRef.current.clear();
        }
        onScanSuccess(decodedText);
      },
      (error) => {
        // ignore scan errors, they happen continuously until a code is found
      }
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-stone-100 bg-stone-50">
          <h3 className="font-bold text-stone-900">Scan Customer QR Code</h3>
          <button 
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-200 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          <div id="qr-reader" className="w-full rounded-xl overflow-hidden shadow-sm border border-stone-200"></div>
          <p className="text-center text-sm text-stone-500 mt-4">
            Position the order QR code inside the camera frame.
          </p>
        </div>
      </div>
    </div>
  );
}
