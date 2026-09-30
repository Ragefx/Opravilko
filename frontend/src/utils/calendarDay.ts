/**
 * The day picked on the calendar while it's on screen ("yyyy-MM-dd"), so the
 * add button (+) adds on that day. Null elsewhere.
 */
let pickedDay: string | null = null;

export function setCalendarDay(day: string | null): void {
  pickedDay = day;
}

export function calendarDay(): string | null {
  return pickedDay;
}
