import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TaskLocation } from "../api/types";
import { placeAt, searchPlaces } from "../utils/places";
import { MapPinIcon, SearchIcon, XIcon } from "./icons";

const LAST_CENTER_KEY = "opravilko.mapCenter";
const LJUBLJANA = { lat: 46.0569, lng: 14.5058 };

function lastCenter(): { lat: number; lng: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_CENTER_KEY) || "null");
    if (saved && typeof saved.lat === "number" && typeof saved.lng === "number") return saved;
  } catch {
    /* ignore */
  }
  return LJUBLJANA;
}

// A plain SVG pin, so Leaflet doesn't need its marker images.
const pinIcon = L.divIcon({
  className: "location-pin",
  html: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M12 22s-7-6.4-7-12a7 7 0 0 1 14 0c0 5.6-7 12-7 12z" fill="currentColor" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="10" r="2.6" fill="#fff"/></svg>',
  iconSize: [34, 34],
  iconAnchor: [17, 32],
});

/**
 * Pick where a task happens: search for a place or address, or click the map
 * to drop a pin. Uses OpenStreetMap -- no account or key.
 */
export default function LocationPicker({
  initial,
  onSave,
  onClose,
}: {
  initial?: TaskLocation;
  onSave: (loc: TaskLocation | null) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<TaskLocation | null>(initial ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TaskLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const mapDiv = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);

  function showPin(loc: TaskLocation, zoomTo?: number) {
    if (!map.current) return;
    if (!marker.current) marker.current = L.marker([loc.lat, loc.lng], { icon: pinIcon }).addTo(map.current);
    else marker.current.setLatLng([loc.lat, loc.lng]);
    if (zoomTo) map.current.setView([loc.lat, loc.lng], Math.max(map.current.getZoom(), zoomTo));
  }

  useEffect(() => {
    if (!mapDiv.current) return;
    const start = initial ?? lastCenter();
    const m = L.map(mapDiv.current, { zoomControl: true, attributionControl: true }).setView(
      [start.lat, start.lng],
      initial ? 16 : 13
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    map.current = m;
    if (initial) showPin(initial);
    m.on("click", async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const rough = { name: "Dropped pin", lat, lng };
      setPicked(rough);
      showPin(rough);
      setLocating(true);
      const place = await placeAt(lat, lng);
      setLocating(false);
      setPicked((cur) => (cur && cur.lat === lat && cur.lng === lng ? place : cur));
    });
    // The modal animates in; let Leaflet measure its final size.
    const t = window.setTimeout(() => m.invalidateSize(), 150);
    return () => {
      window.clearTimeout(t);
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc closes just this window (not the task behind it), wherever focus is.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Search as you type (after a short pause).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const c = map.current?.getCenter();
        setResults(await searchPlaces(q, c ? { lat: c.lat, lng: c.lng } : undefined, ctrl.signal));
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Couldn't search right now. You can still click the map.");
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  function choose(loc: TaskLocation) {
    setPicked(loc);
    setResults([]);
    setQuery("");
    showPin(loc, 16);
  }

  function save() {
    if (!picked) return;
    try {
      localStorage.setItem(LAST_CENTER_KEY, JSON.stringify({ lat: picked.lat, lng: picked.lng }));
    } catch {
      /* ignore */
    }
    onSave(picked);
  }

  // On top of the task panel (a portal), and clicks here don't reach it.
  return createPortal(
    <div
      className="modal-backdrop location-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="modal location-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Location"
      >
        <div className="settings-head">
          <h3>Location</h3>
          <button className="sidebar-icon-btn" onClick={onClose} aria-label="Close">
            <XIcon width={18} height={18} />
          </button>
        </div>

        <div className="location-search">
          <SearchIcon width={16} height={16} />
          <input
            autoFocus
            placeholder="Search a place or address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) choose(results[0]);
            }}
          />
          {searching && <span className="location-searching">…</span>}
          {results.length > 0 && (
            <ul className="location-results" role="listbox">
              {results.map((r, i) => (
                <li key={`${r.lat},${r.lng},${i}`}>
                  <button onClick={() => choose(r)}>
                    <MapPinIcon width={15} height={15} />
                    <span>
                      <b>{r.name}</b>
                      {r.address && <span>{r.address}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <div className="location-error">{error}</div>}

        <div className="location-map" ref={mapDiv} />
        <p className="location-hint">Search above, or click the map to drop a pin.</p>

        <div className="location-picked">
          {picked ? (
            <>
              <MapPinIcon width={16} height={16} />
              <span>
                <b>{locating ? "Finding the address…" : picked.name}</b>
                {!locating && picked.address && <span>{picked.address}</span>}
              </span>
            </>
          ) : (
            <span className="location-none">No place picked yet</span>
          )}
        </div>

        <div className="modal-actions">
          {initial && (
            <button className="btn btn-text location-remove" onClick={() => onSave(null)}>
              Remove location
            </button>
          )}
          <button className="btn btn-text" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!picked || locating}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
