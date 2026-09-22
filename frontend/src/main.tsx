import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import "./styles/global.css";
import App from "./App";
import { initTheme } from "./utils/theme";
import { installSyncGuards } from "./dropbox/store";
import { isNativeApp } from "./dropbox/auth";
import { installBackButton } from "./native/android";

initTheme();
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>
);
