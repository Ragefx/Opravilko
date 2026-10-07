import { format as dfFormat, formatDistanceToNow as dfDistance } from "date-fns";
import { enGB, sl as slLocale } from "date-fns/locale";

/**
 * The app's language: English or Slovenian, chosen per device in Settings
 * (kept in localStorage; changing it reloads the page). Every bit of text
 * is written as tr("English", "Slovensko") right where it's shown.
 */
export type Lang = "en" | "sl";

const KEY = "opravilko.lang";

function read(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "sl") return v;
  } catch {
    /* ignore */
  }
  return "en";
}

export const lang: Lang = read();
export const isSl = lang === "sl";

/** The text in the chosen language. */
export function tr(en: string, sl: string): string {
  return isSl ? sl : en;
}

/**
 * A count with its word: tr's plural forms. English: [one, other];
 * Slovenian: [1, 2, 3–4, 5+] (ena naloga, dve nalogi, tri naloge, pet nalog).
 * "#" in the word is replaced by the number.
 */
export function trn(n: number, en: [string, string], sl: [string, string, string, string]): string {
  let word: string;
  if (isSl) {
    const m = Math.abs(n) % 100;
    word = m === 1 ? sl[0] : m === 2 ? sl[1] : m === 3 || m === 4 ? sl[2] : sl[3];
  } else {
    word = n === 1 ? en[0] : en[1];
  }
  return word.replace("#", String(n));
}

/** Switches the language (this device) and reloads so everything redraws in it. */
export function setLang(next: Lang): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

/** date-fns's locale for the chosen language. */
export const dateLocale = isSl ? slLocale : enGB;

/** date-fns's format, with month and day names in the chosen language. */
export function format(date: Date | number | string, pattern: string): string {
  return dfFormat(date, pattern, { locale: dateLocale });
}

export function formatDistanceToNow(date: Date | number | string, opts?: { addSuffix?: boolean }): string {
  return dfDistance(date, { ...opts, locale: dateLocale });
}

/** For toLocaleString and friends. */
export const localeTag = isSl ? "sl-SI" : "en-GB";

/** "sreda, 7. okt." → "Sreda, 7. okt.": Slovenian day and month names are lowercase, headings aren't. */
export function cap(s: string): string {
  return s.charAt(0).toLocaleUpperCase(localeTag) + s.slice(1);
}
