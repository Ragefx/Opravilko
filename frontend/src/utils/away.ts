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
