import { useEffect, useState } from "react";
import { Keyboard } from "@capacitor/keyboard";
import { isNativeApp } from "../dropbox/auth";

/**
 * How much of the bottom of the page the on-screen keyboard covers (CSS px),
 * so something can sit right on top of it. In the Android app the keyboard
 * plugin reports its height; whatever the page itself shrank by (if Android
 * resized it) is taken off, so nothing is lifted twice. In a browser, the
 * visual viewport says the same.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (isNativeApp) {
      const fullHeight = window.innerHeight;
      const show = Keyboard.addListener("keyboardWillShow", ({ keyboardHeight }) => {
        // Measured once the page has had a chance to resize.
        requestAnimationFrame(() => setInset(Math.max(0, keyboardHeight - (fullHeight - window.innerHeight))));
      });
      const hide = Keyboard.addListener("keyboardWillHide", () => setInset(0));
      return () => {
        void show.then((l) => l.remove());
        void hide.then((l) => l.remove());
      };
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
