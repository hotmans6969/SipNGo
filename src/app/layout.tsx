import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import Navbar from "@/components/Navbar";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import PageTransition from "@/components/PageTransition";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#f59e0b",
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom is left enabled: disabling it fails WCAG 1.4.4 and blocks
  // anyone who needs to magnify the menu.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "SipNGo - Order Drinks & Food",
  description: "Order your favorite drinks and food, pay in-app, and pick up with your QR code.",
  // Next serves app/manifest.ts at /manifest.webmanifest, not /manifest.json.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SipNGo",
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">
        <ServiceWorkerRegistrar />
        <AuthProvider>
          <CartProvider>
            <Navbar />
            <main className="flex-1 pb-20">
              <PageTransition>{children}</PageTransition>
            </main>
            <PushNotificationPrompt />
            <footer className="bg-stone-900 text-stone-400 text-center py-6 text-sm mb-16">
              SipNGo &copy; {new Date().getFullYear()}. All rights reserved.
            </footer>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
