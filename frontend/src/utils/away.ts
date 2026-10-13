import { differenceInCalendarDays, parseISO } from "date-fns";
import { format, tr, trn } from "../i18n";
import type { AwayPeriod, Project, TripDates } from "../api/types";

/** A trip's icon: 🚗 by car, 🏖️ off work, ✈️ otherwise. */
export function tripIcon(a?: { by?: AwayPeriod["by"] }): string {
  return a?.by === "car" ? "🚗" : a?.by === "off" ? "🏖️" : "✈️";
}

/** Days off work rather than a trip. */
export function isOff(a?: { by?: AwayPeriod["by"] }): boolean {
  return a?.by === "off";
}

/**
 * How a trip looks: "off" (sand, days off work), "partner" (rose, just
 * your partner's) or "mine" (your colour: yours, or the two of you together).
 */
export function tripLook(t: Trip): "off" | "partner" | "mine" {
  if (isOff(t.period)) return "off";
  return t.mine || t.period.together ? "mine" : "partner";
}

/** The away period covering this day ("yyyy-MM-dd"), if any. */
export function awayOn(away: AwayPeriod[] | undefined, day: string): AwayPeriod | undefined {
  return away?.find((a) => a.start <= day && day <= a.end);
}

/** "Thu 2 – Sat 4 Oct", with times when set: "Thu 2 07:15 – Sat 4 Oct 22:40". */
export function awayRange(a: TripDates): string {
  const s = parseISO(a.start);
  const e = parseISO(a.end);
  const st = a.startTime ? ` ${a.startTime}` : "";
  const et = a.endTime ? ` ${a.endTime}` : "";
  if (a.start === a.end) return `${format(s, tr("EEE d MMM", "EEE, d. MMM"))}${st}${a.endTime ? `–${a.endTime}` : ""}`;
  const sameMonth = format(s, "yyyy-MM") === format(e, "yyyy-MM") && !st;
  return `${format(s, sameMonth ? tr("EEE d", "EEE, d.") : tr("EEE d MMM", "EEE, d. MMM"))}${st} – ${format(e, tr("EEE d MMM", "EEE, d. MMM"))}${et}`;
}

/** The time that goes with this day of a trip: leaving on the first, back on the last. */
export function awayTimeOn(a: TripDates, day: string): string | null {
  if (day === a.start && a.startTime) return a.start === a.end && a.endTime ? `${a.startTime}–${a.endTime}` : a.startTime;
  if (day === a.end && a.endTime) return `back ${a.endTime}`;
  return null;
}

/** A trip on the calendar: yours (to change), your partner's (theirs), or a project's. */
export interface Trip {
  period: AwayPeriod;
  mine: boolean;
  /** "Maruša" for a partner's trip. */
  who?: string;
  /** A project that is a trip: its id (the period's title is the project's name). */
  projectId?: string;
}

type TripSource = {
  away?: AwayPeriod[];
  partnerAway?: AwayPeriod[];
  partner?: { name: string } | null;
  projects?: Project[];
};

/** Every trip to show: yours, projects' (everyone on the project sees them), your partner's. */
export function tripsOf(data: TripSource | undefined): Trip[] {
  const who = data?.partner?.name.split(" ")[0] || tr("Partner", "Partner");
  return [
    ...(data?.away ?? []).map((period) => ({ period, mine: true })),
    ...(data?.projects ?? [])
      .filter((p) => p.trip)
      .map((p) => ({ period: { ...p.trip!, id: `project:${p.id}`, title: p.name }, mine: true, projectId: p.id })),
    ...(data?.partnerAway ?? []).map((period) => ({ period, mine: false, who })),
  ];
}

/** Where a project lives in the app. */
export function projectRoute(projectId: string): string {
  return projectId === "inbox" ? "/app/inbox" : `/app/project/${encodeURIComponent(projectId)}`;
}

/** What tripWhen says for a trip under way ("now"). */
export const TRIP_NOW = tr("now", "zdaj");

/** "in 12 days", "tomorrow", "today", "now" (under way), or null once it's over. */
export function tripWhen(a: TripDates, today: string): string | null {
  if (a.end < today) return null;
  if (a.start <= today) return TRIP_NOW;
  const days = differenceInCalendarDays(parseISO(a.start), parseISO(today));
  return days === 1 ? tr("tomorrow", "jutri") : trn(days, ["in # day", "in # days"], ["čez # dan", "čez # dneva", "čez # dni", "čez # dni"]);
}

/** The trips covering this day: yours (and the two of you's) first. */
export function tripsOn(trips: Trip[], day: string): Trip[] {
  return trips
    .filter((t) => t.period.start <= day && day <= t.period.end)
    .sort((a, b) => Number(tripLook(a) === "partner") - Number(tripLook(b) === "partner"));
}

/** "Athens", "Maruša · Rome" for just your partner's, "Rome · together" for the two of you. */
export function tripName(t: Trip): string {
  if (t.period.together) return `${t.period.title} · ${tr("together", "skupaj")}`;
  return t.mine ? t.period.title : `${t.who} · ${t.period.title}`;
}
