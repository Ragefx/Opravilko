import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.opravilko.app",
  appName: "Opravilko",
  // The same Vite build as the website, built with base "/" (npm run build:android).
  webDir: "dist",
  plugins: {
    // Edge to edge: the page pads itself using the injected
    // --safe-area-inset-* variables (see .app-shell in global.css).
    SystemBars: {
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
    },
    // Google sign-in through Android's own account picker; the web Firebase
    // SDK then signs in with the returned token (see src/firebase/auth.ts).
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ["google.com"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_opravilko",
      iconColor: "#3e63dd",
    },
  },
};

export default config;
