import { tr } from "../i18n";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  addShopPlace,
  removeShopPlace,
  SHOP_PLACES_CHANGED,
  shopPlaces,
  updateShopPlace,
  type ShopPlace,
} from "../utils/shopPlaces";
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
  const [editing, setEditing] = useState<ShopPlace | null>(null);

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
      showToast({ message: tr("Shop reminders need location access for Opravilko.", "Opomniki v trgovini potrebujejo dostop do lokacije za Opravilko.") });
    } else if (!access.background) {
      showToast({
        message: tr(
          "To notice you arriving with the app closed, set Opravilko's location to “Allow all the time”.",
          "Da opazi tvoj prihod tudi z zaprto aplikacijo, Opravilku za lokacijo nastavi »Vedno dovoli«."
        ),
        actionLabel: tr("Settings", "Nastavitve"),
        onAction: openLocationSettings,
      });
    }
  }

  // Picking a place: just the map search (the sheet sits above other windows,
  // so it would cover it), then back to the sheet.
  if (adding) {
    return (
      <LocationPicker
        nameable
        onClose={() => setAdding(null)}
        onSave={(loc) => {
          if (loc) {
            addShopPlace({ shop: adding, name: loc.name, address: loc.address, lat: loc.lat, lng: loc.lng });
            void askAccess();
          }
          setAdding(null);
        }}
      />
    );
  }
  // A pinned shop, tapped: the map opens on it, to move the pin or rename it.
  if (editing) {
    return (
      <LocationPicker
        nameable
        removeLabel={tr("Remove this shop", "Odstrani to trgovino")}
        initial={{ name: editing.name, address: editing.address, lat: editing.lat, lng: editing.lng }}
        onClose={() => setEditing(null)}
        onSave={(loc) => {
          if (loc) updateShopPlace(editing.id, { name: loc.name, address: loc.address, lat: loc.lat, lng: loc.lng });
          else removeShopPlace(editing.id);
          setEditing(null);
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
      <div className="shop-picker shop-places" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr("Shops on the map", "Trgovine na zemljevidu")}>
        <div className="shop-picker-handle" aria-hidden="true" />
        <h3>{tr("Remind me at the shop", "Opomni me v trgovini")}</h3>
        <p>
          {tr(
            "Pin your shops (as many of each as you like). When you arrive at one, your phone shows what to buy there, even with the app closed. Tap a pinned shop to move it or give it a name of its own.",
            "Označi svoje trgovine (vsake kolikor želiš). Ko prideš v eno, ti telefon pokaže, kaj tam kupiti, tudi z zaprto aplikacijo. Tapni označeno trgovino, da jo premakneš ali ji daš svoje ime."
          )}
        </p>
        <div className="shop-picker-list">
          {stores.map((store) => {
            const mine = places.filter((p) => p.shop === store);
            return (
              <div key={store} className="shop-places-store">
                <div className="shop-places-name">{store}</div>
                {mine.map((p) => (
                  <div key={p.id} className="shop-picker-row shop-places-place">
                    <button
                      type="button"
                      className="shop-places-edit"
                      onClick={() => setEditing(p)}
                      aria-label={tr(`Change ${p.name}: move it or rename it`, `Spremeni ${p.name}: premakni ali preimenuj`)}
                    >
                      <span className="shop-picker-icon" aria-hidden="true">
                        <MapPinIcon width={18} height={18} />
                      </span>
                      <span className="shop-places-text">
                        <span className="shop-picker-name">{p.name}</span>
                        {p.address && <span className="shop-places-address">{p.address}</span>}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="rem-remove"
                      aria-label={tr(`Remove ${p.name}`, `Odstrani ${p.name}`)}
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
                  <span className="shop-picker-name">{mine.length ? tr(`Add another ${store}`, `Dodaj še eno: ${store}`) : tr(`Pin your ${store}`, `Označi svojo trgovino ${store}`)}</span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="rem-foot">
          <button type="button" className="btn btn-text" onClick={onClose}>
            {tr("Done", "Končano")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
