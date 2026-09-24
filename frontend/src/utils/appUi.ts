import { isNativeApp } from "../dropbox/auth";

/**
 * The Android app's own layouts (Add task card, task details). On the dev
 * server, opening any page with ?app once previews them in a browser tab.
 */
function devPreview(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    if (new URLSearchParams(window.location.search).has("app")) sessionStorage.setItem("opravilko.appUi", "1");
    return sessionStorage.getItem("opravilko.appUi") === "1";
  } catch {
    return false;
  }
}

export const appUi = isNativeApp || devPreview();
