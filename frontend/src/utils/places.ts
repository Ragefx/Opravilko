import type { TaskLocation } from "../api/types";

/**
 * Place search on OpenStreetMap data through Photon (photon.komoot.io): free,
 * no key, made for search-as-you-type. Results near the map's centre rank
 * first.
 */
const PHOTON = "https://photon.komoot.io";

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

function toLocation(f: PhotonFeature): TaskLocation {
  const p = f.properties;
  const street = [p.street, p.housenumber].filter(Boolean).join(" ");
  const name = p.name || street || p.city || p.county || "Dropped pin";
  const rest = [
    p.name && street ? street : null,
    [p.postcode, p.city || p.district].filter(Boolean).join(" ") || null,
    p.country,
  ].filter((x): x is string => Boolean(x) && x !== name);
  const [lng, lat] = f.geometry.coordinates;
  return { name, ...(rest.length ? { address: rest.join(", ") } : {}), lat, lng };
}

export async function searchPlaces(
  query: string,
  near?: { lat: number; lng: number },
  signal?: AbortSignal
): Promise<TaskLocation[]> {
  const params = new URLSearchParams({ q: query, limit: "6" });
  if (near) {
    params.set("lat", near.lat.toFixed(4));
    params.set("lon", near.lng.toFixed(4));
  }
  const res = await fetch(`${PHOTON}/api/?${params}`, { signal });
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  return json.features.map(toLocation);
}

/** The address at a point (for a pin dropped on the map). */
export async function placeAt(lat: number, lng: number): Promise<TaskLocation> {
  const fallback = { name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng };
  try {
    const res = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lng}&limit=1`);
    if (!res.ok) return fallback;
    const json = (await res.json()) as { features: PhotonFeature[] };
    // Keep the exact point that was clicked, just borrow the address.
    return json.features[0] ? { ...toLocation(json.features[0]), lat, lng } : fallback;
  } catch {
    return fallback;
  }
}

/** Opens the place in Google Maps (the app on phones that have it). */
export function mapsUrl(loc: TaskLocation): string {
  return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
}
