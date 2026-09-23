import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import "@fontsource/schibsted-grotesk/400.css";
import "@fontsource/schibsted-grotesk/500.css";
import "@fontsource/schibsted-grotesk/600.css";
import "@fontsource/schibsted-grotesk/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles/global.css";
import "./styles/soca.css";
import App from "./App";
import { initTheme } from "./utils/theme";
import { initLook } from "./utils/look";
import { bindQueryClient, installSyncGuards } from "./data/store";
import { initFirebaseAuth } from "./firebase/auth";
import { isNativeApp } from "./dropbox/auth";
import { installBackButton } from "./native/android";

initTheme();
initLook();
installSyncGuards();
installBackButton();

// Lets the website open with no connection (production builds only, so the
// dev server's hot reload isn't fighting a cache). The Android app ships its
// files inside the app, so it doesn't need one.
if ("serviceWorker" in navigator && import.meta.env.PROD && !isNativeApp) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

bindQueryClient(queryClient);

// A saved Google sign-in is restored before the first render, so the app
// knows straight away which storage to use.
void initFirebaseAuth().finally(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </StrictMode>
  )
);
