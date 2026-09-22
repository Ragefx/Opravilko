import { getDay } from "date-fns";

/** Days from today to the next Saturday (today itself if today is already Saturday). */
export function weekendOffsetDays(): number {
  const day = getDay(new Date()); // 0 Sun .. 6 Sat
  if (day === 6) return 0;
  if (day === 0) return 6;
  return 6 - day;
}
