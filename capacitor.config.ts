import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sipngo.app',
  appName: 'SipNGo',
  webDir: 'public',
  server: {
    // Points the native app wrapper to your locally running Next.js server!
    url: 'http://192.168.100.26:3000',
    cleartext: true
  }
};

export default config;
