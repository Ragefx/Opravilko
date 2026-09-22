import { App as NativeApp } from "@capacitor/app";
import { isNativeApp } from "../dropbox/auth";

/** Overlays that close when their backdrop is tapped, topmost last in the DOM. */
const DISMISSIBLE = ".dropdown-backdrop, .modal-backdrop, .overlay, .sidebar-scrim";

/**
 * Android's back button: close whatever is open on top (menu, dialog, task
 * detail, drawer) first; otherwise go back in the app's history; and only
 * leave the app from its first screen.
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
    if (canGoBack && window.history.length > 1) window.history.back();
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
