import { tr } from "../i18n";
import { useSyncExternalStore } from "react";
import type { CalendarEvent } from "../api/types";

/**
 * Slovenian public holidays, built in (no calendar to import): the work-free
 * days, and the holidays that aren't work-free, in Slovenian. Easter and
 * Pentecost are worked out for each year. Shown on the calendars when the
 * switch in Settings > Appearance is on (per device, on unless switched off).
 */
export const HOLIDAYS_FEED_ID = "holidays-si";

const KEY = "opravilko.holidays";
export const HOLIDAYS_CHANGED = "opravilko:holidays";

export function holidaysOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHolidaysOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(HOLIDAYS_CHANGED));
}

export function useHolidays(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(HOLIDAYS_CHANGED, cb);
      return () => window.removeEventListener(HOLIDAYS_CHANGED, cb);
    },
    holidaysOn,
    holidaysOn
  );
}

/** [month, day, name, work-free] */
const FIXED: [number, number, string, boolean][] = [
  [1, 1, tr("New Year's Day", "Novo leto"), true],
  [1, 2, tr("New Year's Day", "Novo leto"), true],
  [2, 8, tr("Prešeren Day, Slovenian Cultural Holiday", "Prešernov dan, slovenski kulturni praznik"), true],
  [4, 27, tr("Day of Uprising Against Occupation", "Dan upora proti okupatorju"), true],
  [5, 1, tr("Labour Day", "Praznik dela"), true],
  [5, 2, tr("Labour Day", "Praznik dela"), true],
  [6, 8, tr("Primož Trubar Day", "Dan Primoža Trubarja"), false],
  [6, 25, tr("Statehood Day", "Dan državnosti"), true],
  [8, 15, tr("Assumption Day", "Marijino vnebovzetje"), true],
  [8, 17, tr("Unification of Prekmurje Slovenes with the Mother Nation", "Združitev prekmurskih Slovencev z matičnim narodom"), false],
  [9, 15, tr("Return of Primorska to the Motherland", "Vrnitev Primorske k matični domovini"), false],
  [9, 23, tr("Slovenian Sports Day", "Dan slovenskega športa"), false],
  [10, 25, tr("Sovereignty Day", "Dan suverenosti"), false],
  [10, 31, tr("Reformation Day", "Dan reformacije"), true],
  [11, 1, tr("Remembrance Day", "Dan spomina na mrtve"), true],
  [11, 23, tr("Rudolf Maister Day", "Dan Rudolfa Maistra"), false],
  [12, 25, tr("Christmas Day", "Božič"), true],
  [12, 26, tr("Independence and Unity Day", "Dan samostojnosti in enotnosti"), true],
];

/** Easter Sunday (Gregorian), as [month, day]. */
export function easter(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const pad = (n: number) => String(n).padStart(2, "0");

export interface Holiday {
  date: string;
  name: string;
  /** A dela prost dan (a day off). */
  free: boolean;
}

export function holidaysOf(year: number): Holiday[] {
  const out: Holiday[] = FIXED.map(([m, d, name, free]) => ({ date: `${year}-${pad(m)}-${pad(d)}`, name, free }));
  const [em, ed] = easter(year);
  const base = new Date(year, em - 1, ed);
  const plus = (days: number) => {
    const x = new Date(base);
    x.setDate(x.getDate() + days);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  };
  out.push({ date: plus(0), name: tr("Easter Sunday", "Velika noč"), free: true });
  out.push({ date: plus(1), name: tr("Easter Monday", "Velikonočni ponedeljek"), free: true });
  out.push({ date: plus(49), name: tr("Whit Sunday", "Binkošti"), free: true });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** The holidays as calendar events, last year to two years ahead (work-free ones in red). */
let cached: { year: number; events: CalendarEvent[] } | null = null;

export function holidayEvents(now = new Date()): CalendarEvent[] {
  if (cached?.year === now.getFullYear()) return cached.events;
  const events: CalendarEvent[] = [];
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 2; y++) {
    for (const h of holidaysOf(y)) {
      events.push({
        id: `${HOLIDAYS_FEED_ID}:${h.date}:${h.name}`,
        feedId: HOLIDAYS_FEED_ID,
        color: h.free ? "#d93a2e" : "#8a8f98",
        uid: `${HOLIDAYS_FEED_ID}:${h.date}:${h.name}`,
        title: h.name,
        date: h.date,
        start: null,
        end: null,
        allDay: true,
      });
    }
  }
  cached = { year: now.getFullYear(), events };
  return events;
}
