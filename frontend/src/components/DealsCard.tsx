import { useMemo, useState } from "react";
import { cap, format, tr, trn } from "../i18n";
import { bestDeal, DEAL_SHOPS, euro, mealsOnSale, startsLater, useDeals, type Deal, type MealDeal } from "../utils/deals";
import type { Meal } from "../utils/shopping";
import { ChevronIcon, XIcon } from "./icons";

const OPEN_KEY = "opravilko.dealsOpen";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

/** "−30 %", or "from Thu" for a deal that hasn't started. */
function DealNote({ deal }: { deal: Deal }) {
  return (
    <>
      <b>{euro(deal.p)}</b>
      {deal.d ? <span className="deals-pct">−{deal.d} %</span> : null}
      {startsLater(deal) && deal.f && (
        <span className="deals-from">{tr("from", "od")} {format(new Date(deal.f + "T12:00"), tr("EEE", "EEE"))}</span>
      )}
      <span className="deals-shop">{deal.s}</span>
    </>
  );
}

/**
 * The Shopping page's "On sale" card: this week's deals at Hofer, Lidl, Spar
 * and Tuš that fit your meals and what you usually buy, plus all deals to search.
 */
export default function DealsCard({
  meals,
  usual,
  onList,
  onAddMeal,
  onAddItem,
}: {
  meals: Meal[];
  /** Things you usually buy that aren't on the list. */
  usual: string[];
  /** What's on the list now. */
  onList: string[];
  onAddMeal: (m: MealDeal) => void;
  onAddItem: (name: string, shop: string) => void;
}) {
  const { data, error, loading } = useDeals();
  const [open, setOpen] = useState(readOpen);
  const [all, setAll] = useState(false);
  const [moreMeals, setMoreMeals] = useState(false);

  const deals = useMemo(() => data?.deals ?? [], [data]);
  const forMeals = useMemo(() => mealsOnSale(meals, deals), [meals, deals]);
  const forItems = useMemo(
    () =>
      [...onList.map((name) => ({ name, listed: true })), ...usual.map((name) => ({ name, listed: false }))]
        .map((x) => ({ ...x, deal: bestDeal(x.name, deals) }))
        .filter((x): x is { name: string; listed: boolean; deal: Deal } => Boolean(x.deal)),
    [onList, usual, deals]
  );

  if (loading) return null;
  if (!data || deals.length === 0) {
    // Say why, rather than leaving no trace of the card.
    const why = error
      ? error === "permission-denied"
        ? tr("the database rules don't allow it yet (paste the new rules and publish them)", "pravila baze tega še ne dovolijo (prilepi nova pravila in jih objavi)")
        : error
      : !data
        ? tr("no deals have been saved yet", "akcije še niso shranjene")
        : tr("none are on this week", "ta teden ni nobene")
    return (
      <p className="deals-missing">
        🏷️ {tr("Shop deals can't be shown: ", "Akcij trgovin ni mogoče prikazati: ")}
        {why}
      </p>
    );
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  const found = forMeals.length + forItems.length;
  const shown = moreMeals ? forMeals : forMeals.slice(0, 3);
  const shops = DEAL_SHOPS.filter((s) => deals.some((d) => d.s === s));

  return (
    <section className={`deals-card ${open ? "is-open" : ""}`} aria-label={tr("On sale", "V akciji")}>
      <button className="deals-head" onClick={toggle} aria-expanded={open}>
        <span className="deals-head-icon" aria-hidden="true">
          🏷️
        </span>
        <span className="deals-head-text">
          <b>{tr("On sale", "V akciji")}</b>
          <span className="deals-sub">
            {found
              ? trn(found, ["# fits what you buy", "# fit what you buy"], ["# ustreza tvojim nakupom", "# ustrezata tvojim nakupom", "# ustrezajo tvojim nakupom", "# ustreza tvojim nakupom"])
              : tr("Nothing for your meals this week", "Ta teden nič za tvoje obroke")}
          </span>
        </span>
        <span className="deals-chevron" aria-hidden="true">
          <ChevronIcon width={16} height={16} />
        </span>
      </button>

      {open && (
        <div className="deals-body">
          {shown.map((m) => (
            <div key={m.meal.id} className="deals-meal">
              <div className="deals-meal-main">
                <span className="deals-meal-name">
                  {m.meal.emoji} {m.meal.name}
                </span>
                <span className="deals-meal-items">
                  {m.onSale.map(({ ing, deal }) => (
                    <span key={ing.name} className="deals-tag" title={deal.n}>
                      {ing.name} <DealNote deal={deal} />
                    </span>
                  ))}
                </span>
              </div>
              <button className="btn btn-secondary deals-add" onClick={() => onAddMeal(m)}>
                + {tr("Add", "Dodaj")}
              </button>
            </div>
          ))}
          {forMeals.length > 3 && (
            <button className="deals-more" onClick={() => setMoreMeals(!moreMeals)}>
              {moreMeals
                ? tr("Fewer meals", "Manj obrokov")
                : trn(forMeals.length - 3, ["# more meal", "# more meals"], ["še # obrok", "še # obroka", "še # obroki", "še # obrokov"])}
            </button>
          )}

          {forItems.length > 0 && (
            <div className="deals-items">
              {forItems.map(({ name, listed, deal }) =>
                listed ? (
                  <span key={name} className="deals-item is-listed" title={deal.n}>
                    ✓ {name} <DealNote deal={deal} />
                  </span>
                ) : (
                  <button key={name} className="deals-item" title={deal.n} onClick={() => onAddItem(name, deal.s)}>
                    + {name} <DealNote deal={deal} />
                  </button>
                )
              )}
            </div>
          )}

          <div className="deals-foot">
            <button className="deals-all-btn" onClick={() => setAll(true)}>
              {tr(`All deals (${deals.length})`, `Vse akcije (${deals.length})`)}
            </button>
            <span className="deals-updated">
              {shops.join(", ")}
              {data.updated && ` · ${cap(format(new Date(data.updated), tr("EEE HH:mm", "EEE HH:mm")))}`}
            </span>
          </div>
        </div>
      )}

      {all && <AllDeals deals={deals} onClose={() => setAll(false)} onAdd={onAddItem} />}
    </section>
  );
}

/** Every deal, searchable; + puts it on the list for its shop. */
function AllDeals({ deals, onClose, onAdd }: { deals: Deal[]; onClose: () => void; onAdd: (name: string, shop: string) => void }) {
  const [q, setQ] = useState("");
  const [shop, setShop] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const needle = q.trim().toLocaleLowerCase("sl");
  const list = deals
    .filter((d) => (!shop || d.s === shop) && (!needle || d.n.toLocaleLowerCase("sl").includes(needle)))
    .sort((a, b) => (b.d ?? 0) - (a.d ?? 0))
    .slice(0, 200);
  const shops = DEAL_SHOPS.filter((s) => deals.some((d) => d.s === s));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal deals-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tr("All deals", "Vse akcije")}>
        <div className="settings-head">
          <h3>{tr("All deals", "Vse akcije")}</h3>
          <button className="sidebar-icon-btn" onClick={onClose} aria-label={tr("Close", "Zapri")}>
            <XIcon width={18} height={18} />
          </button>
        </div>
        <input
          className="deals-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("Search: milk, chicken, coffee…", "Išči: mleko, piščanec, kava …")}
          aria-label={tr("Search deals", "Išči akcije")}
          autoCapitalize="off"
        />
        <div className="shopping-shops deals-shops">
          <button className={`shopping-shop-chip ${shop === "" ? "is-current" : ""}`} onClick={() => setShop("")}>
            {tr("All", "Vse")}
          </button>
          {shops.map((s) => (
            <button key={s} className={`shopping-shop-chip ${shop === s ? "is-current" : ""}`} onClick={() => setShop(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="deals-list">
          {list.length === 0 && <p className="shopping-empty">{tr("No deals found.", "Ni najdenih akcij.")}</p>}
          {list.map((d) => {
            const key = d.s + d.n;
            return (
              <div key={key} className="deals-row">
                <div className="deals-row-text">
                  {d.u ? (
                    <a href={d.u} target="_blank" rel="noreferrer">
                      {d.n}
                    </a>
                  ) : (
                    d.n
                  )}
                  {d.q && <span className="deals-size"> · {d.q}</span>}
                  <div className="deals-row-price">
                    <DealNote deal={d} />
                    {d.o ? <s className="deals-old">{euro(d.o)}</s> : null}
                  </div>
                </div>
                <button
                  className="deals-row-add"
                  disabled={added.has(key)}
                  onClick={() => {
                    onAdd(d.n, d.s);
                    setAdded(new Set(added).add(key));
                  }}
                  aria-label={tr(`Add ${d.n} to the list`, `Dodaj ${d.n} na seznam`)}
                >
                  {added.has(key) ? "✓" : "+"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
