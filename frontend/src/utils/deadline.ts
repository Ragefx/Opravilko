import { differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";

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
      ? "Today"
      : days === 1
        ? "Tomorrow"
        : days === -1
          ? "Yesterday"
          : format(day, days > -300 && days < 300 ? "EEE d MMM" : "d MMM yyyy");
  return { label, kind: days < 0 ? "past" : days <= 2 ? "soon" : "later", days };
}
