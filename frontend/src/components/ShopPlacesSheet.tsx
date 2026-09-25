import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { addShopPlace, removeShopPlace, SHOP_PLACES_CHANGED, shopPlaces, type ShopPlace } from "../utils/shopPlaces";
import { openLocationSettings, requestArrivalAccess, resyncArrivalPlaces } from "../native/places";
import LocationPicker from "./LocationPicker";
import { useToast } from "./ToastProvider";
import { MapPinIcon, PlusIcon, XIcon } from "./icons";

/**
 * Android app: where your shops are. Arriving at one shows what's on the
 * list for it (and what can be bought anywhere) as a notification.
 */
export default function ShopPlacesSheet({ stores, onClose }: { stores: string[]; onClose: () => void }) {
  const showToast = useToast();
  const [places, setPlaces] = useState<ShopPlace[]>(shopPlaces);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setPlaces(shopPlaces());
      resyncArrivalPlaces();
    };
    window.addEventListener(SHOP_PLACES_CHANGED, update);
    return () => window.removeEventListener(SHOP_PLACES_CHANGED, update);
  }, []);

  async function askAccess() {
    const access = await requestArrivalAccess().catch(() => ({ location: false, background: false }));
    if (!access.location) {
      showToast({ message: "Shop reminders need location access for Opravilko." });
    } else if (!access.background) {
      showToast({
        message: "To notice you arriving with the app closed, set Opravilko's location to “Allow all the time”.",
        actionLabel: "Settings",
        onAction: openLocationSettings,
      });
    }
  }

  // Picking a place: just the map search (the sheet sits above other windows,
  // so it would cover it), then back to the sheet.
  if (adding) {
    return (
      <LocationPicker
        onClose={() => setAdding(null)}
        onSave={(loc) => {
          if (loc) {
            addShopPlace({ shop: adding, name: loc.name, lat: loc.lat, lng: loc.lng });
            void askAccess();
          }
          setAdding(null);
        }}
      />
    );
  }

  return createPortal(
    <div
      className="modal-backdrop shop-picker-backdrop over-modal"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="shop-picker shop-places" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Shops on the map">
        <div className="shop-picker-handle" aria-hidden="true" />
        <h3>Remind me at the shop</h3>
        <p>Pin your shops (as many of each as you like). When you arrive at one, your phone shows what to buy there, even with the app closed.</p>
        <div className="shop-picker-list">
          {stores.map((store) => {
            const mine = places.filter((p) => p.shop === store);
            return (
              <div key={store} className="shop-places-store">
                <div className="shop-places-name">{store}</div>
                {mine.map((p) => (
                  <div key={p.id} className="shop-picker-row shop-places-place">
                    <span className="shop-picker-icon" aria-hidden="true">
                      <MapPinIcon width={18} height={18} />
                    </span>
                    <span className="shop-picker-name">{p.name}</span>
                    <button
                      type="button"
                      className="rem-remove"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => removeShopPlace(p.id)}
                    >
                      <XIcon width={16} height={16} />
                    </button>
                  </div>
                ))}
                <button type="button" className="shop-picker-row is-add" onClick={() => setAdding(store)}>
                  <span className="shop-picker-icon" aria-hidden="true">
                    <PlusIcon width={18} height={18} />
                  </span>
                  <span className="shop-picker-name">{mine.length ? `Add another ${store}` : `Pin your ${store}`}</span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="rem-foot">
          <button type="button" className="btn btn-text" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
