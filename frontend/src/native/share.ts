import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "../dropbox/auth";

/** Something shared to the app from another app (android/.../share/SharePlugin.java). */
export interface SharedContent {
  text?: string;
  subject?: string;
  images?: { name: string; type: string; dataUrl: string }[];
}

interface OpravilkoSharePlugin {
  take(): Promise<SharedContent>;
  addListener(event: "shared", cb: () => void): Promise<{ remove: () => void }>;
}
const OpravilkoShare = registerPlugin<OpravilkoSharePlugin>("OpravilkoShare");

const TEST_EVENT = "opravilko:test-share";

function hasContent(s: SharedContent): boolean {
  return Boolean(s.text?.trim() || s.subject?.trim() || s.images?.length);
}

/**
 * Calls `onShare` with each share: the one the app was opened with, then any
 * that arrive while it runs. (In development a test page can fire one too.)
 */
export function listenForShares(onShare: (s: SharedContent) => void): () => void {
  if (!isNativeApp) {
    if (!import.meta.env.DEV) return () => {};
    const test = (e: Event) => onShare((e as CustomEvent<SharedContent>).detail);
    window.addEventListener(TEST_EVENT, test);
    return () => window.removeEventListener(TEST_EVENT, test);
  }
  const take = () =>
    void OpravilkoShare.take()
      .then((s) => hasContent(s) && onShare(s))
      .catch(() => {});
  take();
  const listener = OpravilkoShare.addListener("shared", take);
  return () => void listener.then((l) => l.remove());
}

/** A shared photo as a File, ready for uploadAttachment. */
export async function sharedImageFile(image: { name: string; type: string; dataUrl: string }): Promise<File> {
  const blob = await (await fetch(image.dataUrl)).blob();
  return new File([blob], image.name, { type: image.type });
}
