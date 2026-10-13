import { useQuery } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "../firebase/app";
import { firebaseConfig } from "../firebase/config";
import { isSl } from "../i18n";
import type { Ingredient, Meal } from "./shopping";

/**
 * This week's deals at Hofer, Lidl, Spar and Tuš. A GitHub Actions job
 * (.github/workflows/deals.yml, deals/fetch.py) reads the shops' deals pages
 * twice a day and writes them to deals/current; the Shopping page matches
 * them to your meals and usual items.
 */
export interface Deal {
  /** Shop: "Hofer", "Lidl", "Spar" or "Tuš". */
  s: string;
  /** Product name as the shop writes it (Slovenian). */
  n: string;
  /** Price in euros. */
  p: number;
  /** Price before the deal, when the shop says. */
  o?: number;
  /** Percent off, when known. */
  d?: number;
  /** Package size ("500 g"). */
  q?: string;
  /** Valid from / until, "YYYY-MM-DD". */
  f?: string;
  t?: string;
  /** Link to the product. */
  u?: string;
}

export interface DealsData {
  updated: string;
  deals: Deal[];
}

export const DEAL_SHOPS = ["Hofer", "Lidl", "Spar", "Tuš"];

async function load(): Promise<DealsData | null> {
  if (!firebaseConfig) return null;
  const snap = await getDoc(doc(firestore(), "deals", "current"));
  if (!snap.exists()) return null;
  const data = snap.data() as { json?: string; updated?: string };
  try {
    return { updated: data.updated ?? "", deals: JSON.parse(data.json ?? "[]") as Deal[] };
  } catch {
    return null;
  }
}

const today = () => new Date().toLocaleDateString("sv-SE");

/** This week's deals that haven't ended (and start within three days). */
export function useDeals(enabled = true): { data: DealsData | null; error: string | null; loading: boolean } {
  const q = useQuery({
    queryKey: ["deals"],
    queryFn: load,
    enabled,
    staleTime: 60 * 60 * 1000,
    retry: 1,
    // A failed read (rules not published yet, offline) is tried again on return.
    refetchOnWindowFocus: (query) => query.state.status === "error",
  });
  const error = q.error ? ((q.error as { code?: string }).code ?? String(q.error)) : null;
  if (!q.data) return { data: null, error, loading: q.isLoading };
  const now = today();
  const soon = new Date(Date.now() + 3 * 86400000).toLocaleDateString("sv-SE");
  return {
    data: { ...q.data, deals: q.data.deals.filter((d) => (!d.t || d.t >= now) && (!d.f || d.f <= soon)) },
    error,
    loading: false,
  };
}

/** Not yet on: "from Thu". */
export function startsLater(d: Deal): boolean {
  return Boolean(d.f && d.f > today());
}

// ---- Matching a deal to what you buy ----

function norm(s: string): string {
  return s
    .toLocaleLowerCase("sl")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Built-in meals' English ingredients, in the shops' Slovenian. */
const EN_SL: Record<string, string> = {
  "bay leaves": "lovorjev list",
  "bell pepper": "paprika",
  bread: "kruh",
  butter: "maslo",
  "caesar dressing": "cezarjev preliv",
  cheese: "sir",
  "chicken breast": "piscancji file",
  "chicken thighs": "piscancja bedra",
  eggs: "jajca",
  flour: "moka",
  garlic: "cesen",
  "grated cheese": "nariban sir",
  ham: "sunka",
  jam: "marmelada",
  lettuce: "solata",
  milk: "mleko",
  "minced meat": "mleto meso",
  mushrooms: "sampinjoni",
  oil: "olje",
  "olive oil": "olivno olje",
  onion: "cebula",
  "paprika powder": "mleta paprika",
  parmesan: "parmezan",
  passata: "pasirani paradiznik",
  potatoes: "krompir",
  "risotto rice": "riz",
  "romaine lettuce": "rimska solata",
  rosemary: "rozmarin",
  "sour cream": "kisla smetana",
  spaghetti: "spageti",
  "stewing beef": "govedina",
  "stock cube": "jusna kocka",
  "toast bread": "toast",
  "tomato paste": "paradiznikova mezga",
  tortillas: "tortilje",
  pasta: "testenine",
  rice: "riz",
  tomatoes: "paradiznik",
  carrots: "korenje",
  apples: "jabolka",
  bananas: "banane",
  yoghurt: "jogurt",
  yogurt: "jogurt",
  coffee: "kava",
  sugar: "sladkor",
  beer: "pivo",
  wine: "vino",
  water: "voda",
  chicken: "piscanec",
  pork: "svinjina",
  beef: "govedina",
  salmon: "losos",
  tuna: "tuna",
  cream: "smetana",
};

/** Seasoning and the like: on sale or not, not worth suggesting. */
const SKIP = new Set(["sol", "salt", "poper", "pepper", "voda", "water", "led", "ice"]);

/** The words to look for: each word's stem (ingredients come in any case ending). */
function terms(name: string): string[] | null {
  const n = norm(name);
  if (!n || SKIP.has(n)) return null;
  const words = norm(EN_SL[n] ?? n)
    .split(" ")
    .filter((w) => w.length > 1 && !/^\d/.test(w));
  return words.length ? words : null;
}

function wordMatches(term: string, word: string): boolean {
  const stem = term.length <= 4 ? term : term.slice(0, Math.max(4, term.length - 2));
  if (!word.startsWith(stem)) return false;
  // "sir" / "sira" yes, "sirup" no; "moka" yes, "mokasini" no.
  return word.length <= term.length + (term.length <= 3 ? 1 : 3);
}

const wordsOf = new WeakMap<Deal, string[]>();

/** Whether a deal is for this thing (every word of it is in the product's name). */
export function dealFits(name: string, deal: Deal): boolean {
  const t = terms(name);
  if (!t) return false;
  let words = wordsOf.get(deal);
  if (!words) wordsOf.set(deal, (words = norm(deal.n).split(" ")));
  return t.every((term) => words.some((w) => wordMatches(term, w)));
}

/** The best deal for a thing: the biggest discount, then the cheapest. */
export function bestDeal(name: string, deals: Deal[]): Deal | undefined {
  let best: Deal | undefined;
  for (const d of deals) {
    if (!dealFits(name, d)) continue;
    if (!best || (d.d ?? 0) > (best.d ?? 0) || ((d.d ?? 0) === (best.d ?? 0) && d.p < best.p)) best = d;
  }
  return best;
}

export interface MealDeal {
  meal: Meal;
  /** The meal's ingredients that are on sale, with their deal. */
  onSale: { ing: Ingredient; deal: Deal }[];
}

/** Meals with at least one ingredient on sale; the most on sale first. */
export function mealsOnSale(meals: Meal[], deals: Deal[]): MealDeal[] {
  const out: MealDeal[] = [];
  for (const meal of meals) {
    if (meal.hidden) continue;
    const onSale: MealDeal["onSale"] = [];
    for (const ing of meal.ingredients) {
      const deal = bestDeal(ing.name, deals);
      if (deal) onSale.push({ ing, deal });
    }
    if (onSale.length) out.push({ meal, onSale });
  }
  const score = (m: MealDeal) => m.onSale.reduce((sum, x) => sum + (x.deal.d ?? 10), 0);
  return out.sort((a, b) => score(b) - score(a));
}

export function euro(n: number): string {
  return isSl ? `${n.toFixed(2).replace(".", ",")} €` : `€${n.toFixed(2)}`;
}
