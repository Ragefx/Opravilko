import { nanoid } from "nanoid";

/**
 * Where your shops are (your SPAR, your Hofer...), kept on this phone. The
 * app watches them like arrival reminders: arriving at one shows what's on
 * the shopping list for that shop.
 */
export interface ShopPlace {
  id: string;
  /** The shop's name as on the list ("SPAR"). */
  shop: string;
  /** The place picked ("SPAR Ljubljana Rudnik"), or the name you gave it. */
  name: string;
  /** Its street address, to tell same-named shops apart. */
  address?: string;
  lat: number;
  lng: number;
}

const KEY = "opravilko.shopPlaces";
/** Fired on window when the places change. */
export const SHOP_PLACES_CHANGED = "opravilko:shop-places";

export function shopPlaces(): ShopPlace[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ShopPlace[]) : [];
  } catch {
    return [];
  }
}

function save(places: ShopPlace[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(places));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(SHOP_PLACES_CHANGED));
}

export function addShopPlace(place: Omit<ShopPlace, "id">): void {
  save([...shopPlaces(), { ...place, id: nanoid(8) }]);
}

export function removeShopPlace(id: string): void {
  save(shopPlaces().filter((p) => p.id !== id));
}

export function updateShopPlace(id: string, changes: Partial<Omit<ShopPlace, "id" | "shop">>): void {
  save(shopPlaces().map((p) => (p.id === id ? { ...p, ...changes } : p)));
}
