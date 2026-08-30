import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import Navbar from "@/components/Navbar";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import PageTransition from "@/components/PageTransition";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import CartBar from "@/components/CartBar";
import DialogProvider from "@/components/DialogProvider";
import { StaffAlertProvider } from "@/context/StaffAlertContext";
import { ActiveOrderProvider } from "@/context/ActiveOrderContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Poppins is the Foodienator typeface. It is loaded as a variable rather than
// swapped in as the app-wide sans, so only the screens rebuilt from that
// design (menu grid, item sheet, cart bar) opt into it with `font-poppins`.
const poppins = Poppins({
  variable: "--font-poppins-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} h-full antialiased`}
    >
      {/*
        One layout at every size. `app-shell` pins the whole app to a phone's
        width and centres it, so a desktop browser shows the same screen a
        customer holds rather than a stretched version of it — the counter and
        the queue are then looking at the same thing.

        The width lives in CSS as --app-width rather than a Tailwind class
        because the fixed navigation and cart bar have to line up with this
        column exactly, and one variable keeps them from drifting apart.
      */}
      <body className="min-h-full bg-stone-200 text-stone-900">
        <div className="app-shell min-h-screen flex flex-col bg-stone-50">
        <ServiceWorkerRegistrar />
        <AuthProvider>
          <StaffAlertProvider>
          <CartProvider>
            <ActiveOrderProvider>
            <DialogProvider>
            <Navbar />
            <main className="flex-1 pb-20">
              <PageTransition>{children}</PageTransition>
            </main>
            <PushNotificationPrompt />
            <footer className="bg-stone-900 text-stone-400 text-center py-6 text-sm mb-16">
              SipNGo &copy; {new Date().getFullYear()}. All rights reserved.
            </footer>
            <CartBar />
            </DialogProvider>
            </ActiveOrderProvider>
          </CartProvider>
          </StaffAlertProvider>
        </AuthProvider>
        </div>
      </body>
    </html>
  );
}
