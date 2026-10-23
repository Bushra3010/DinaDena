import type { CapacitorConfig } from '@capacitor/cli';

// The Android app wraps the hosted web app. Set CAP_SERVER_URL to the deployed URL
// (e.g. https://dinadena.vercel.app) before `npx cap sync android`.
// capacitor/www is only the fallback page shown when no URL is set.
const url = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'in.dinadena.app',
  appName: 'DiNaDeNa',
  webDir: 'capacitor/www',
  server: url ? { url, cleartext: url.startsWith('http://') } : undefined,
};

export default config;
