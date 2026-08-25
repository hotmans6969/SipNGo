import type { CapacitorConfig } from "@capacitor/cli";

/**
 * SipNGo Android wrapper.
 *
 * The app is a native shell around the deployed site rather than a bundled
 * copy of it. That is deliberate: the menu, orders, and accounts all live on
 * the server, so a bundled build could not work offline anyway — and this way
 * a push to Railway updates what every installed phone shows, with no new APK
 * and nothing for anyone to reinstall.
 *
 * Point it somewhere else for development:
 *   CAPACITOR_SERVER_URL=http://192.168.1.20:3000 npx cap sync android
 */
const PRODUCTION_URL = "https://sipngo-production.up.railway.app";

const serverUrl = process.env.CAPACITOR_SERVER_URL || PRODUCTION_URL;

const config: CapacitorConfig = {
  appId: "com.sipngo.app",
  appName: "SipNGo",
  // Unused while `server.url` is set, but Capacitor requires the directory to
  // exist. public/ is the natural choice since it already holds the icons.
  webDir: "public",
  backgroundColor: "#fafaf9",
  android: {
    // Match the web build so nothing renders behind a mismatched background colour
    // during the first paint.
    backgroundColor: "#fafaf9",
    allowMixedContent: false,
  },
  server: {
    url: serverUrl,
    // Only a plain-http LAN dev server needs cleartext. Production is https.
    cleartext: serverUrl.startsWith("http://"),
    androidScheme: "https",
  },
};

export default config;
