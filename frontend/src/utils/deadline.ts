import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import { format, tr } from "../i18n";

/**
 * A task's deadline for showing: "Fri 3 Oct", "Tomorrow", "Today", with how
 * close it is ("past", "soon" within two days, else "later").
 */
export function deadlineInfo(deadline: string | undefined): { label: string; kind: "past" | "soon" | "later"; days: number } | null {
  if (!deadline) return null;
  const day = parseISO(deadline);
  if (Number.isNaN(day.getTime())) return null;
  const days = differenceInCalendarDays(day, startOfDay(new Date()));
  const label =
    days === 0
      ? tr("Today", "Danes")
      : days === 1
        ? tr("Tomorrow", "Jutri")
        : days === -1
          ? tr("Yesterday", "Včeraj")
          : format(day, days > -300 && days < 300 ? tr("EEE d MMM", "EEE, d. MMM") : tr("d MMM yyyy", "d. MMM yyyy"));
  return { label, kind: days < 0 ? "past" : days <= 2 ? "soon" : "later", days };
}
