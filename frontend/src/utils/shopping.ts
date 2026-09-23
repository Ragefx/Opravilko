import type { Project } from "../api/types";

/**
 * Shopping list items and meals.
 *
 * An item is an ordinary task in the list's project, its title written as
 * "Name amount unit" ("Moka 120 g", "Jajca 4×"), so it syncs and shares like
 * any task. Amounts are kept in base units (g, ml, pieces...) for adding up
 * and printed in the friendliest one (0,5 l, 1,2 kg).
 */

export type Unit = "g" | "ml" | "kos" | "strok" | "glava" | "pločevinka" | "žlica" | "žlička" | "kocka" | "paket";

export interface Item {
  name: string;
  amount?: number;
  unit?: Unit;
}

const UNIT_RE =
  "kg|dag|g|ml|dl|l|kos(?:ov|a)?|x|×|strok(?:a|ov)?|glav(?:a|e|i)?|ploč(?:evink[aei]?)?|žlic(?:a|e|o)?|žličk(?:a|e|i|o)?|kock(?:a|e|i)?|paket(?:a|ov|i)?";

/** "mleko 1,5 l", "2x jajca", "500 g moke", "jajca 3", "kruh" */
export function parseItem(text: string): Item {
  const raw = text.trim().replace(/\s+/g, " ");
  // A number with an optional unit; "1,5 %" (milk fat) is part of the name.
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}.,])(\\d+(?:[.,]\\d+)?)(?![.,]?\\d)\\s*(${UNIT_RE})?(?![\\p{L}\\p{N}])(?!\\s*%)|(?<![\\p{L}\\p{N}])(x|×)\\s*(\\d+)(?![\\p{L}\\p{N}])`,
    "iu"
  );
  const m = raw.match(re);
  if (!m) return { name: capitalize(raw) };
  const value = parseFloat((m[1] ?? m[4]).replace(",", "."));
  const unitWord = (m[2] ?? (m[3] ? "x" : "")).toLowerCase();
  const name = capitalize(plainName(raw.replace(m[0], " ").replace(/\s+/g, " ").trim()));
  if (!name) return { name: capitalize(raw) };
  const [amount, unit] = toBase(value, unitWord);
  return { name, amount, unit };
}

function toBase(value: number, unitWord: string): [number, Unit] {
  if (unitWord === "kg") return [value * 1000, "g"];
  if (unitWord === "dag") return [value * 10, "g"];
  if (unitWord === "g") return [value, "g"];
  if (unitWord === "l") return [value * 1000, "ml"];
  if (unitWord === "dl") return [value * 100, "ml"];
  if (unitWord === "ml") return [value, "ml"];
  if (unitWord.startsWith("strok")) return [value, "strok"];
  if (unitWord.startsWith("glav")) return [value, "glava"];
  if (unitWord.startsWith("ploč")) return [value, "pločevinka"];
  if (unitWord.startsWith("žličk")) return [value, "žlička"];
  if (unitWord.startsWith("žlic")) return [value, "žlica"];
  if (unitWord.startsWith("kock")) return [value, "kocka"];
  if (unitWord.startsWith("paket")) return [value, "paket"];
  return [value, "kos"];
}

/**
 * After an amount Slovenian uses the genitive ("500 g moke", "2 l mleka");
 * the common groceries go back to their plain name so they add up with the
 * same thing from a recipe.
 */
const PLAIN_NAME: Record<string, string> = {
  moke: "moka", mleka: "mleko", krompirja: "krompir", smetane: "smetana", sladkorja: "sladkor", masla: "maslo",
  sira: "sir", riža: "riž", čebule: "čebula", čebuli: "čebula", kumari: "kumare", kumar: "kumare", paradižnika: "paradižnik", mesa: "meso", kruha: "kruh",
  jajc: "jajca", jajci: "jajca", jajce: "jajca", jogurta: "jogurt", piščanca: "piščanec", testenin: "testenine",
  špagetov: "špageti", banan: "banane", jabolk: "jabolka", limon: "limone", limoni: "limone", paprik: "paprike",
  korenja: "korenje", solate: "solata", vode: "voda", piva: "pivo", vina: "vino", olja: "olje", kisa: "kis",
  soli: "sol", popra: "poper", česna: "česen", šunke: "šunka", salame: "salama", skute: "skuta", kave: "kava",
  čaja: "čaj", medu: "med", orehov: "orehi", gob: "gobe", fižola: "fižol", tune: "tuna", tortilj: "tortilje",
  kvasa: "kvas", pršuta: "pršut", mesnega: "mesni",
};

function plainName(name: string): string {
  return name.replace(/^\p{L}+/u, (w) => PLAIN_NAME[w.toLocaleLowerCase("sl")] ?? w);
}

function capitalize(s: string): string {
  return s ? s[0].toLocaleUpperCase("sl") + s.slice(1) : s;
}

function num(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r).replace(".", ",");
}

/** The amount as printed: "4×", "120 g", "1,2 kg", "250 ml", "0,5 l", "2 stroka". */
export function formatAmount(amount: number | undefined, unit: Unit | undefined): string {
  if (amount === undefined || !unit) return "";
  switch (unit) {
    case "kos":
      return `${num(amount)}×`;
    case "g":
      return amount >= 1000 ? `${num(amount / 1000)} kg` : `${num(amount)} g`;
    case "ml":
      return amount >= 500 ? `${num(amount / 1000)} l` : `${num(amount)} ml`;
    case "strok":
      return `${num(amount)} ${amount === 1 ? "strok" : amount === 2 ? "stroka" : "strokov"}`;
    default:
      return `${num(amount)} ${unit}`;
  }
}

/** The task title for an item: "Moka 120 g". */
export function itemTitle(item: Item): string {
  const a = formatAmount(item.amount, item.unit);
  return a ? `${item.name} ${a}` : item.name;
}

/** Same thing on the list, so amounts add up instead of making a second line. */
export function sameItem(a: Item, b: Item): boolean {
  return a.name.toLocaleLowerCase("sl") === b.name.toLocaleLowerCase("sl") && (a.unit ?? null) === (b.unit ?? null);
}

/** Splits "mleko 1,5 l, kruh, 2x jajca" into items (the comma in "1,5" stays). */
export function splitItems(text: string): string[] {
  return text
    .split(/,(?!\d)|\n|;/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- meals ----------

export interface Ingredient {
  name: string;
  /** Per serving; absent for "to taste" things like salt. */
  amount?: number;
  unit?: Unit;
}

export interface Meal {
  id: string;
  name: string;
  emoji: string;
  ingredients: Ingredient[];
  custom?: boolean;
}

const i = (name: string, amount?: number, unit?: Unit): Ingredient => ({ name, amount, unit });

/** A starter set; amounts are per serving. */
export const BUILTIN_MEALS: Meal[] = [
  {
    id: "palacinke",
    name: "Palačinke",
    emoji: "🥞",
    ingredients: [i("Moka", 60, "g"), i("Mleko", 125, "ml"), i("Jajca", 1, "kos"), i("Sol"), i("Olje"), i("Marmelada")],
  },
  {
    id: "bolognese",
    name: "Špageti bolognese",
    emoji: "🍝",
    ingredients: [
      i("Špageti", 100, "g"),
      i("Mleto meso", 125, "g"),
      i("Pasirani paradižnik", 150, "g"),
      i("Čebula", 0.5, "kos"),
      i("Česen", 1, "strok"),
      i("Parmezan", 20, "g"),
      i("Olivno olje"),
    ],
  },
  {
    id: "omleta",
    name: "Omleta",
    emoji: "🍳",
    ingredients: [i("Jajca", 3, "kos"), i("Mleko", 30, "ml"), i("Sir", 30, "g"), i("Šunka", 30, "g"), i("Sol")],
  },
  {
    id: "golaz",
    name: "Golaž",
    emoji: "🍲",
    ingredients: [
      i("Govedina za golaž", 200, "g"),
      i("Čebula", 1, "kos"),
      i("Česen", 1, "strok"),
      i("Paradižnikova mezga", 1, "žlica"),
      i("Mleta paprika"),
      i("Lovorjev list"),
      i("Kruh", 1, "kos"),
    ],
  },
  {
    id: "piscanec-krompir",
    name: "Piščanec s krompirjem",
    emoji: "🍗",
    ingredients: [i("Piščančja bedra", 250, "g"), i("Krompir", 250, "g"), i("Česen", 1, "strok"), i("Olivno olje"), i("Rožmarin")],
  },
  {
    id: "cezar",
    name: "Cezarjeva solata",
    emoji: "🥗",
    ingredients: [
      i("Piščančji file", 120, "g"),
      i("Rimska solata", 0.5, "glava"),
      i("Parmezan", 20, "g"),
      i("Toast kruh", 1, "kos"),
      i("Cezarjev preliv", 30, "ml"),
    ],
  },
  {
    id: "tortilje",
    name: "Tortilje s piščancem",
    emoji: "🌯",
    ingredients: [
      i("Tortilje", 2, "kos"),
      i("Piščančji file", 120, "g"),
      i("Paprika", 0.5, "kos"),
      i("Nariban sir", 40, "g"),
      i("Kisla smetana", 50, "g"),
      i("Zelena solata"),
    ],
  },
  {
    id: "rizota",
    name: "Gobova rižota",
    emoji: "🍄",
    ingredients: [
      i("Riž za rižoto", 80, "g"),
      i("Šampinjoni", 100, "g"),
      i("Čebula", 0.5, "kos"),
      i("Parmezan", 20, "g"),
      i("Maslo", 10, "g"),
      i("Jušna kocka", 0.5, "kocka"),
    ],
  },
];

/** Scales a per-serving amount and rounds it to what you'd actually buy. */
export function scaled(ing: Ingredient, servings: number): Item {
  if (ing.amount === undefined || !ing.unit) return { name: ing.name };
  const x = ing.amount * servings;
  let amount: number;
  if (ing.unit === "g") amount = x < 50 ? Math.max(5, Math.round(x / 5) * 5) : Math.round(x / 10) * 10;
  else if (ing.unit === "ml") amount = x < 100 ? Math.max(10, Math.round(x / 10) * 10) : Math.round(x / 50) * 50;
  else amount = Math.ceil(x - 1e-9);
  return { name: ing.name, amount, unit: ing.unit };
}

// Your own meals are kept on this device for now (prototype).
const CUSTOM_KEY = "opravilko.meals";

export function customMeals(): Meal[] {
  try {
    const list = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveCustomMeals(meals: Meal[]): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(meals));
  } catch {
    /* ignore */
  }
}

/** A meal from a pasted recipe ("250 g moke", "3 jajca", "sol") for `servings` people. */
export function mealFromText(
  name: string,
  text: string,
  servings: number,
  keep?: { id: string; emoji: string }
): Meal {
  const ingredients = text
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const it = parseItem(line);
      return it.amount !== undefined ? { ...it, amount: it.amount / Math.max(1, servings) } : { name: it.name };
    });
  return {
    id: keep?.id ?? `custom-${Date.now().toString(36)}`,
    name: name.trim() || "Moj obrok",
    emoji: keep?.emoji ?? "🍽️",
    ingredients,
    custom: true,
  };
}

/** A meal's ingredients for `servings` people, one per line, as the edit box shows them. */
export function mealToText(meal: Meal, servings: number): string {
  return meal.ingredients
    .map((ing) => itemTitle({ name: ing.name, amount: ing.amount !== undefined ? ing.amount * servings : undefined, unit: ing.unit }))
    .join("\n");
}

// ---------- categories ----------

export interface Category {
  id: string;
  emoji: string;
  name: string;
}

export const CATEGORIES: Category[] = [
  { id: "veg", emoji: "🥦", name: "Sadje in zelenjava" },
  { id: "bread", emoji: "🥖", name: "Kruh in pecivo" },
  { id: "dairy", emoji: "🥛", name: "Mlečni izdelki in jajca" },
  { id: "meat", emoji: "🥩", name: "Meso in ribe" },
  { id: "pantry", emoji: "🍝", name: "Shramba" },
  { id: "spices", emoji: "🧂", name: "Začimbe, olja, omake" },
  { id: "frozen", emoji: "🧊", name: "Zamrznjeno" },
  { id: "sweets", emoji: "🍫", name: "Sladkarije in prigrizki" },
  { id: "drinks", emoji: "🥤", name: "Pijače" },
  { id: "household", emoji: "🧽", name: "Gospodinjstvo" },
  { id: "care", emoji: "🧴", name: "Drogerija" },
  { id: "pets", emoji: "🐾", name: "Živali" },
  { id: "other", emoji: "🛒", name: "Drugo" },
];

export function categoryById(id: string | undefined): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

/** Two-word names that the single words would get wrong ("mleta paprika" is a spice). */
const PHRASES: [string, string][] = [
  ["mleta paprika", "spices"], ["kislo mleko", "dairy"], ["kisla smetana", "dairy"], ["toaletni papir", "care"],
  ["zobna pasta", "care"], ["arašidovo maslo", "pantry"], ["ledeni čaj", "drinks"], ["paradižnikova mezga", "pantry"],
  ["pasirani paradižnik", "pantry"], ["jušna kocka", "pantry"], ["sojina omaka", "spices"], ["hrana za", "pets"],
  ["vreče za smeti", "household"], ["vrečke za smeti", "household"], ["papirnate brisače", "household"],
  ["cezarjev preliv", "spices"], ["riž za rižoto", "pantry"], ["toast kruh", "bread"], ["olivno olje", "spices"],
  ["pomivalni stroj", "household"], ["mleto meso", "meat"], ["zamrznjen", "frozen"],
];

/** Word beginnings per category, checked word by word; short ones must be (nearly) the whole word. */
const STEMS: Record<string, string[]> = {
  care: ["šampon", "balzam", "gel", "milo", "zobn", "ščetk", "dezodorant", "krem", "vložk", "tampon", "plenic", "britvic", "robčk", "losjon", "parfum", "vatir", "higiensk", "toaletn"],
  household: ["detergent", "praln", "mehčal", "čistil", "jar", "pomival", "vrečk", "folij", "papir", "brisač", "prtičk", "gobic", "krp", "vžigalic", "sveč", "baterij", "žarnic"],
  pets: ["mačk", "pasj", "brikete", "pesek", "granul"],
  frozen: ["sladoled", "zamrzn", "led"],
  veg: ["jabolk", "hrušk", "banan", "pomaranč", "mandarin", "limon", "grozd", "jagod", "malin", "borovnic", "češnj", "breskv", "marelic", "sliv", "kivi", "ananas", "mang", "avokad", "lubenic", "melon", "granatn", "grenivk", "nektarin", "fig", "paradižnik", "kumar", "paprik", "solat", "zelj", "ohrovt", "brokol", "cvetač", "koren", "krompir", "čebul", "česen", "por", "zelen", "bučk", "jajčev", "gob", "šampinjon", "špinač", "blitv", "rukol", "radič", "redkv", "pesa", "pese", "koleraba", "peteršilj", "bazilik", "drobnjak", "koper", "ingver", "sadje", "zelenjav", "rožmarin"],
  bread: ["kruh", "žemlj", "baget", "rogljič", "štručk", "toast", "kajzeric", "pecivo", "burek", "krof", "tortilj", "pita", "pite", "bombet"],
  dairy: ["mlek", "jogurt", "sir", "skut", "smetan", "masl", "kefir", "jajc", "jajca", "mozzarel", "parmez", "mascarpon", "maskarpon", "feta", "gavd", "gaud", "ementaler", "edamer", "pinjenec", "margarin", "puding"],
  meat: ["meso", "mesa", "mleto", "piščan", "puran", "svinj", "govej", "govedin", "teleti", "zrezk", "file", "bedr", "perutnin", "klobas", "hrenovk", "salam", "šunk", "pršut", "slanin", "pancet", "čevapčič", "pleskavic", "riba", "ribe", "tuna", "tune", "losos", "sardel", "škamp", "kozic", "lignj", "oslič", "postrv", "orad", "brancin", "jetr", "kotlet", "rebrc"],
  pantry: ["mok", "testenin", "špaget", "makaron", "penne", "fusil", "lazanj", "njok", "riž", "kuskus", "kus-kus", "bulgur", "kvinoj", "ovsen", "kosmič", "musli", "žit", "sladkor", "kvas", "pecilni", "fižol", "čičerik", "leč", "konzerv", "pločevink", "pasiran", "mezg", "omak", "jušn", "drobtin", "oreh", "mandelj", "lešnik", "arašid", "med", "marmelad", "nutell", "namaz", "pašteta", "paštet", "polent", "zdrob", "kakav"],
  spices: ["sol", "poper", "olje", "olj", "olivn", "kis", "ketchup", "kečap", "majonez", "gorčic", "senf", "začimb", "origano", "timijan", "cimet", "vanilij", "lovor", "curry", "kari", "balzamič", "čili", "muškat", "klinček", "preliv", "vegeta"],
  sweets: ["čokolad", "bonbon", "piškot", "čips", "smoki", "kreker", "grisin", "napolitank", "žvečil", "keks", "tort", "gumi", "bombon", "ploščic"],
  drinks: ["voda", "vode", "sok", "sokov", "pivo", "piv", "vino", "vin", "kava", "kav", "čaj", "mineral", "radensk", "cola", "kola", "sirup", "energijsk", "žgan", "radler", "tonik"],
};
const STEM_ORDER = ["care", "household", "pets", "frozen", "veg", "bread", "dairy", "meat", "pantry", "spices", "sweets", "drinks"];

function stemMatches(word: string, stem: string): boolean {
  if (stem.length <= 3) return word === stem || (word.startsWith(stem) && word.length === stem.length + 1);
  return word.startsWith(stem);
}

// What you've picked for an item before, so it's remembered next time.
const LEARNED_KEY = "opravilko.shopCategories";

function learned(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LEARNED_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function rememberCategory(name: string, id: string): void {
  try {
    const map = learned();
    map[name.toLocaleLowerCase("sl")] = id;
    localStorage.setItem(LEARNED_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** The category for an item's name: your earlier pick, a known phrase, then word by word. */
export function guessCategory(name: string): string {
  const lower = name.toLocaleLowerCase("sl").trim();
  const mine = learned()[lower];
  if (mine) return mine;
  for (const [phrase, id] of PHRASES) if (lower.includes(phrase)) return id;
  const words = lower.split(/[^\p{L}-]+/u).filter(Boolean);
  for (const w of words) {
    for (const id of STEM_ORDER) if (STEMS[id].some((s) => stemMatches(w, s))) return id;
  }
  return "other";
}

// ---------- spoken lists ----------

const NUMBER_WORDS: Record<string, string> = {
  en: "1", ena: "1", eno: "1", enega: "1", eden: "1", dva: "2", dve: "2", tri: "3", štiri: "4", stiri: "4",
  pet: "5", šest: "6", sest: "6", sedem: "7", osem: "8", devet: "9", deset: "10", enajst: "11", dvanajst: "12",
  trije: "3", štirje: "4", stirje: "4", pol: "0,5",
  // Spoken units, as they're written.
  kila: "kg", kile: "kg", kilo: "kg", kilogram: "kg", kilograma: "kg", kilogramov: "kg",
  liter: "l", litra: "l", litre: "l", litrov: "l", deci: "dl", decilitra: "dl", deka: "dag", dekagramov: "dag",
  gramov: "g", grama: "g", gram: "g",
};

/**
 * What voice recognition hears ("mleko in kruh in dva jajca", "mleko kruh
 * jajca") as separate list lines: "in" / "pa" / "ter" / commas split,
 * number words become numbers, and a run of plain grocery words is split
 * into one item each.
 */
export function splitSpokenItems(spoken: string): string[] {
  const text = spoken
    .toLocaleLowerCase("sl")
    .replace(/[.!?]/g, " ")
    .split(/\s+/)
    .map((w) => NUMBER_WORDS[w] ?? w)
    .join(" ");
  // (A comma inside "0,5" isn't a separator.)
  const parts = text.split(/,(?!\d)|\s(?:in|pa|ter|and)\s/).map((s) => s.trim()).filter(Boolean);
  return parts.flatMap((part) => {
    const words = part.split(" ");
    // "mleko kruh jajca": every word a known grocery and no amounts -> one
    // each ("toaletni papir" and other known pairs stay together).
    const knownPair = PHRASES.some(([phrase]) => part.includes(phrase));
    if (words.length > 1 && !knownPair && words.every((w) => !/\d/.test(w) && guessCategory(w) !== "other")) {
      return words;
    }
    return [part];
  });
}

// ---------- things to add from elsewhere (a share from another app) ----------

let queued: { projectId: string; text: string } | null = null;
export const SHOPPING_ADD_EVENT = "opravilko:shopping-add";

/** Hands text to a shopping list's own adding (so amounts count up as usual). */
export function queueShoppingAdd(projectId: string, text: string): void {
  queued = { projectId, text };
  window.dispatchEvent(new Event(SHOPPING_ADD_EVENT));
}

/** The text waiting for this list, once. */
export function takeShoppingAdd(projectId: string): string | null {
  if (!queued || queued.projectId !== projectId) return null;
  const { text } = queued;
  queued = null;
  return text;
}

// ---------- the shopping list ----------

/**
 * The shopping list: a project shown as a list of things to buy, reached from
 * its own "Shopping" entry instead of the project list. One shared with
 * someone wins, so both of you land on the same list.
 */
export function shoppingListOf(projects: Project[]): Project | undefined {
  return projects
    .filter((p) => p.viewStyle === "shopping" && !p.isInboxProject)
    .sort((a, b) => {
      const shared = (p: Project) => (p.members?.length ?? 0) > 1;
      if (shared(a) !== shared(b)) return shared(a) ? -1 : 1;
      // Two shared lists (you both made one): both phones must pick the same.
      if (shared(a)) return a.id < b.id ? -1 : 1;
      return a.order - b.order;
    })[0];
}
