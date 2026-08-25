import type { CapacitorConfig } from "@capacitor/cli";

/**
 * CAPACITOR_SERVER_URL points the Android wrapper at a running Next server
 * (e.g. http://192.168.1.20:3000 during development). Leave it unset for a
 * production build so the app loads the bundled web assets over https.
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.sipngo.app",
  appName: "SipNGo",
  webDir: "public",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          // Cleartext is only acceptable for a plain-http LAN dev server.
          cleartext: serverUrl.startsWith("http://"),
        },
      }
    : {}),
};

export default config;
