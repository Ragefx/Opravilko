const STORAGE_KEY = "opravilko.theme";

export type ThemeChoice = "light" | "dark";

export function getStoredTheme(): ThemeChoice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: ThemeChoice | null) {
  if (theme) {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

/** Call once at startup to apply any saved preference before first paint. */
export function initTheme() {
  applyTheme(getStoredTheme());
}

export function setTheme(theme: ThemeChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

/** Back to following the device's light/dark setting. */
export function clearTheme() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  applyTheme(null);
}

export function currentEffectiveTheme(): ThemeChoice {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
