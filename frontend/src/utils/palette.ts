import { useSyncExternalStore } from "react";

/**
 * The colours, on top of the look (Settings > Appearance > Colours). Kept per
 * device like the look; "soca" is the look's own palette. Each palette has a
 * light and a dark side, except Midnight, which is always dark.
 */
export type Palette = "soca" | "triglav" | "paper" | "pokljuka" | "dusk" | "midnight";

export const PALETTES: { id: Palette; name: string; blurb: string; swatch: [string, string, string] }[] = [
  { id: "soca", name: "Soča", blurb: "Limestone grey and river turquoise.", swatch: ["#f3f4f2", "#16191b", "#0e8c7f"] },
  { id: "triglav", name: "Triglav", blurb: "Snow white and glacier blue.", swatch: ["#f2f5f9", "#121a24", "#2563c9"] },
  { id: "paper", name: "Paper", blurb: "Warm cream, terracotta and serif headings.", swatch: ["#f6f1e7", "#231d16", "#b8532e"] },
  { id: "pokljuka", name: "Pokljuka", blurb: "Soft sage and moss green.", swatch: ["#eff2ec", "#172016", "#3f7d3a"] },
  { id: "dusk", name: "Dusk", blurb: "Lavender and deep violet.", swatch: ["#f4f2f8", "#1c1726", "#7a4fd1"] },
  { id: "midnight", name: "Midnight", blurb: "Always dark: near-black with amber.", swatch: ["#000000", "#f1efe9", "#f4b23e"] },
];

const STORAGE_KEY = "opravilko.palette";
const listeners = new Set<() => void>();

export function getPalette(): Palette {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return PALETTES.some((p) => p.id === v) ? (v as Palette) : "soca";
  } catch {
    return "soca";
  }
}

function applyPalette(palette: Palette) {
  if (palette === "soca") document.documentElement.removeAttribute("data-palette");
  else document.documentElement.setAttribute("data-palette", palette);
}

/** Call once at startup, before first paint. */
export function initPalette() {
  applyPalette(getPalette());
}

export function setPalette(palette: Palette) {
  try {
    localStorage.setItem(STORAGE_KEY, palette);
  } catch {
    /* ignore */
  }
  applyPalette(palette);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePalette(): Palette {
  return useSyncExternalStore(subscribe, getPalette, getPalette);
}
