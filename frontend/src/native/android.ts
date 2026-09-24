import { App as NativeApp } from "@capacitor/app";
import { isNativeApp } from "../dropbox/auth";

/** Overlays that close when their backdrop is tapped, topmost last in the DOM. */
const DISMISSIBLE = ".dropdown-backdrop, .modal-backdrop, .overlay, .sidebar-scrim, .qas-scrim";

/** Asks the app (Layout) to go to Now; `detail.handled` is set when it did. */
export const BACK_HOME = "opravilko:back-home";

/**
 * Android's back button: close whatever is open on top (menu, dialog, Add
 * task card, task detail, drawer) first; otherwise go straight to Now, not
 * back through every page visited; and leave the app from Now.
 */
export function installBackButton(): void {
  if (!isNativeApp) return;
  void NativeApp.addListener("backButton", ({ canGoBack }) => {
    const layers = document.querySelectorAll<HTMLElement>(DISMISSIBLE);
    const top = layers[layers.length - 1];
    if (top) {
      top.click();
      return;
    }
    const ask = new CustomEvent<{ handled: boolean }>(BACK_HOME, { detail: { handled: false } });
    window.dispatchEvent(ask);
    if (ask.detail.handled) return;
    // Outside the app's pages (sign-in, setup): as before.
    if (canGoBack && window.history.length > 1 && !window.location.hash.startsWith("#/app")) window.history.back();
    else void NativeApp.exitApp();
  });
}

/** Calls `onResume` whenever the app comes back to the foreground. */
export function onAppResume(onResume: () => void): () => void {
  if (!isNativeApp) return () => {};
  const listener = NativeApp.addListener("resume", onResume);
  return () => {
    void listener.then((l) => l.remove());
  };
}
