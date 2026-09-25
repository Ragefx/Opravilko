import { format, parseISO } from "date-fns";
import type { AwayPeriod } from "../api/types";

/** The away period covering this day ("yyyy-MM-dd"), if any. */
export function awayOn(away: AwayPeriod[] | undefined, day: string): AwayPeriod | undefined {
  return away?.find((a) => a.start <= day && day <= a.end);
}

/** "Thu 2 – Sat 4 Oct", or "Thu 2 Oct" for one day. */
export function awayRange(a: AwayPeriod): string {
  const s = parseISO(a.start);
  const e = parseISO(a.end);
  if (a.start === a.end) return format(s, "EEE d MMM");
  const sameMonth = format(s, "yyyy-MM") === format(e, "yyyy-MM");
  return `${format(s, sameMonth ? "EEE d" : "EEE d MMM")} – ${format(e, "EEE d MMM")}`;
}

/** A trip on the calendar: yours (to change), or your partner's (theirs). */
export interface Trip {
  period: AwayPeriod;
  mine: boolean;
  /** "Maruša" for a partner's trip. */
  who?: string;
}

export function tripsOf(data: { away?: AwayPeriod[]; partnerAway?: AwayPeriod[]; partner?: { name: string } | null } | undefined): Trip[] {
  const who = data?.partner?.name.split(" ")[0] || "Partner";
  return [
    ...(data?.away ?? []).map((period) => ({ period, mine: true })),
    ...(data?.partnerAway ?? []).map((period) => ({ period, mine: false, who })),
  ];
}

/** The trips covering this day: yours first. */
export function tripsOn(trips: Trip[], day: string): Trip[] {
  return trips.filter((t) => t.period.start <= day && day <= t.period.end);
}

/** "Athens", or "Maruša · Rome" for a partner's. */
export function tripName(t: Trip): string {
  return t.mine ? t.period.title : `${t.who} · ${t.period.title}`;
}
