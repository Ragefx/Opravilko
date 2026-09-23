import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameWeek,
  isBefore,
  isToday,
  isTomorrow,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { Due } from "../api/types";

/**
 * Only real weekday names/abbreviations ("mon", "monday", "tues", "thurs"), so
 * words that merely start with one ("Monitor", "Wedding", "Satellite") aren't
 * read as a date. "sun"/"sat" must be spelled out since they're ordinary words.
 * The weekday is the matched text's first three letters.
 */
export const WEEKDAY_PATTERN =
  "(?:sunday|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs?|rsday)?|fri(?:day)?|saturday)";

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function makeDue(date: Date, text: string): Due {
  return {
    date: format(date, "yyyy-MM-dd"),
    string: text,
    isRecurring: false,
  };
}

/**
 * Builds a Due from a "yyyy-MM-dd" date string and an optional "HH:mm" time string,
 * e.g. from native <input type="date"> / <input type="time"> values.
 */
export function makeDueFromDateString(dateStr: string, timeStr?: string): Due {
  const d = parseISO(dateStr);
  if (timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const withTime = new Date(d);
    withTime.setHours(h, m, 0, 0);
    return {
      date: dateStr,
      datetime: withTime.toISOString(),
      string: format(withTime, "MMM d, yyyy 'at' HH:mm"),
      isRecurring: false,
    };
  }
  return {
    date: dateStr,
    string: format(d, "MMM d, yyyy"),
    isRecurring: false,
  };
}

export function isOverdue(due: Due | null): boolean {
  if (!due) return false;
  return isBefore(parseISO(due.date), startOfDay(new Date())) && !isToday(parseISO(due.date));
}

export function isDueToday(due: Due | null): boolean {
  if (!due) return false;
  return isToday(parseISO(due.date));
}

export function isDueTomorrow(due: Due | null): boolean {
  if (!due) return false;
  return isTomorrow(parseISO(due.date));
}

/** One of the four buckets a due date's color follows: overdue (red), today
 * (green), tomorrow (yellow), or later (purple). */
export function dueDateClass(due: Due | null): string {
  if (isOverdue(due)) return "overdue";
  if (isDueToday(due)) return "today";
  if (isDueTomorrow(due)) return "tomorrow";
  return "later";
}

export function isDueWithinDays(due: Due | null, days: number): boolean {
  if (!due) return false;
  const d = startOfDay(parseISO(due.date));
  const today = startOfDay(new Date());
  const limit = addDays(today, days);
  return d >= today && d <= limit;
}

export function formatDueLabel(due: Due | null): string {
  if (!due) return "";
  const d = parseISO(due.date);
  const dayLabel = isToday(d) ? "Today" : isTomorrow(d) ? "Tomorrow" : format(d, "MMM d");
  if (due.datetime) {
    return `${dayLabel} ${format(new Date(due.datetime), "HH:mm")}`;
  }
  return dayLabel;
}

// ---------- natural-language dates (English and Slovenian) ----------

// Word edges that also work for č, š, ž (JavaScript's \b doesn't).
const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";
function word(src: string): RegExp {
  return new RegExp(`${B}(?:${src})${E}`, "iu");
}

const MONTHS: RegExp[] = [
  /^jan(uar(y|ja|ju)?)?$/i,
  /^feb(ruar(y|ja|ju)?)?$/i,
  /^mar(ch|ec|ca|cu)?$/i,
  /^apr(il(a|u)?)?$/i,
  /^(may|maj(a|u)?)$/i,
  /^jun(e|ij(a|u)?)?$/i,
  /^jul(y|ij(a|u)?)?$/i,
  /^(aug(ust)?|avg(ust(a|u)?)?)$/i,
  /^sep(t(ember)?|tembr(a|u))?$/i,
  /^(oct(ober)?|okt(ober|obra|obru)?)$/i,
  /^nov(ember|embra|embru)?$/i,
  /^dec(ember|embra|embru)?$/i,
];
const MONTH_WORD =
  "jan(?:uar(?:y|ja|ju)?)?|feb(?:ruar(?:y|ja|ju)?)?|mar(?:ch|ec|ca|cu)?|apr(?:il(?:a|u)?)?|may|maj(?:a|u)?|jun(?:e|ij(?:a|u)?)?|jul(?:y|ij(?:a|u)?)?|aug(?:ust)?|avg(?:ust(?:a|u)?)?|sep(?:t(?:ember)?|tembr(?:a|u))?|oct(?:ober)?|okt(?:ober|obra|obru)?|nov(?:ember|embra|embru)?|dec(?:ember|embra|embru)?";

function monthIndex(w: string): number {
  return MONTHS.findIndex((re) => re.test(w.replace(/\.$/, "")));
}

/** Slovenian weekday names in the forms people type ("v petek", "v sredo"), Sunday first. */
const SL_WEEKDAYS = [
  "nedelj(?:a|o|e)",
  "ponedelj(?:ek|ka|ku)",
  "tor(?:ek|ka|ku)",
  "sred(?:a|o|e)",
  "[čc]etrt(?:ek|ka|ku)",
  "pet(?:ek|ka|ku)",
  "sobot(?:a|o|e)",
];
/** Short forms only with a dot ("pet."), since "pet" also means five. */
const SL_WEEKDAY_SHORT = ["ned\\.", "pon\\.", "tor\\.", "sre\\.", "[čc]et\\.", "pet\\.", "sob\\."];
const EN_WEEKDAYS = ["sun(?:day)?", "mon(?:day)?", "tue(?:s|sday)?", "wed(?:nesday)?", "thu(?:rs?|rsday)?", "fri(?:day)?", "sat(?:urday)?"];

/** A date in the coming year if no year was typed and it's already passed. */
function dateFrom(year: number | null, month: number, day: number): Date | null {
  const now = startOfDay(new Date());
  const y = year ?? now.getFullYear();
  const d = new Date(y, month, day);
  if (d.getMonth() !== month || d.getDate() !== day) return null; // e.g. 31.2.
  if (year === null && d < now) return new Date(y + 1, month, day);
  return d;
}

function fullYear(y: string | undefined): number | null {
  if (!y) return null;
  const n = parseInt(y, 10);
  return n < 100 ? 2000 + n : n;
}

/** The date part of quick-add text ("jutri", "v petek", "30.9.", "sep 30", "next week"). */
export function parseDateToken(text: string): { date: Date; matched: string } | null {
  const now = startOfDay(new Date());
  const tries: { re: RegExp; toDate: (m: RegExpMatchArray) => Date | null }[] = [
    // 2026-09-30
    { re: word("(\\d{4})-(\\d{1,2})-(\\d{1,2})"), toDate: (m) => dateFrom(+m[1], +m[2] - 1, +m[3]) },
    // 30.9. / 30. 9. / 30.9.2026 (the second dot keeps "1.5 kg" from being a date)
    {
      re: new RegExp(`${B}(\\d{1,2})\\.\\s?(\\d{1,2})\\.(?:\\s?(\\d{4}|\\d{2})${E})?`, "iu"),
      toDate: (m) => dateFrom(fullYear(m[3]), +m[2] - 1, +m[1]),
    },
    // 30 sep / 30. septembra 2026
    {
      re: word(`(\\d{1,2})\\.?\\s*(${MONTH_WORD})\\.?(?:\\s+(\\d{4}))?`),
      toDate: (m) => dateFrom(fullYear(m[3]), monthIndex(m[2]), +m[1]),
    },
    // sep 30 / September 30th, 2026
    {
      re: word(`(${MONTH_WORD})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th|\\.)?(?:,?\\s+(\\d{4}))?`),
      toDate: (m) => dateFrom(fullYear(m[3]), monthIndex(m[1]), +m[2]),
    },
    { re: word("day after tomorrow|pojutri[šs]njem|pojutri"), toDate: () => addDays(now, 2) },
    { re: word("today|danes|dan[eu]s"), toDate: () => now },
    { re: word("tomorrow|tmrw?|jutri"), toDate: () => addDays(now, 1) },
    { re: word("in (\\d+) days?|[čc]ez (\\d+) (?:dni|dan[ia]?)"), toDate: (m) => addDays(now, +(m[1] ?? m[2])) },
    { re: word("in a week|[čc]ez (?:en )?teden"), toDate: () => addDays(now, 7) },
    { re: word("in (\\d+) weeks?|[čc]ez (\\d+) (?:tedn(?:ov|a|e)|teden)"), toDate: (m) => addDays(now, 7 * +(m[1] ?? m[2])) },
    { re: word("in (\\d+) months?|[čc]ez (\\d+) (?:mesec(?:ev|a|e)?)"), toDate: (m) => addMonths(now, +(m[1] ?? m[2])) },
    { re: word("in a month|[čc]ez (?:en )?mesec"), toDate: () => addMonths(now, 1) },
    {
      re: word("next week|naslednji teden|prihodnji teden|drugi teden|drug teden"),
      toDate: () => addDays(startOfWeek(now, { weekStartsOn: 1 }), 7),
    },
    {
      re: word("next month|naslednji mesec|prihodnji mesec"),
      toDate: () => startOfMonth(addMonths(now, 1)),
    },
    { re: word("end of (?:the )?month|konec meseca"), toDate: () => endOfMonth(now) },
    {
      re: word("(?:this |on the |ta |ob |čez |cez )?(?:weekend|vikend|vikendu)"),
      toDate: () => (now.getDay() === 0 ? now : addDays(now, (6 - now.getDay() + 7) % 7)),
    },
  ];
  for (const t of tries) {
    const m = text.match(t.re);
    if (!m) continue;
    const date = t.toDate(m);
    if (date) return { date: startOfDay(date), matched: m[0] };
  }

  // Weekdays: "fri", "next friday", "v petek", "naslednjo sredo", "pet."
  const prefix = "(?:(next|naslednj[io]|prihodnj[io])\\s+|(?:this|on|v|ta|to)\\s+)?";
  for (let i = 0; i < 7; i++) {
    const names = [EN_WEEKDAYS[i], SL_WEEKDAYS[i]].join("|");
    const m =
      text.match(word(`${prefix}(?:${names})`)) ??
      text.match(new RegExp(`${B}${prefix}${SL_WEEKDAY_SHORT[i]}`, "iu"));
    if (!m) continue;
    // "sun"/"sat" alone are ordinary English words; they need "on"/"next" etc.
    if (/^(sun|sat)$/i.test(m[0].trim())) continue;
    let diff = (i - now.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    let date = addDays(now, diff);
    // "next friday" is the one in next week, not the coming one this week.
    if (m[1] && isSameWeek(date, now, { weekStartsOn: 1 })) date = addDays(date, 7);
    return { date, matched: m[0] };
  }
  return null;
}

/** A time in quick-add text: "18:30", "ob 18", "ob 9.30", "at 5pm", "5:30pm". */
export function parseTimeToken(text: string): { hours: number; minutes: number; matched: string } | null {
  const tries: RegExp[] = [
    new RegExp(`${B}(?:at |ob )?(\\d{1,2}):(\\d{2})\\s*(am|pm)?${E}`, "iu"),
    new RegExp(`${B}(?:at|ob) (\\d{1,2})[.](\\d{2})${E}`, "iu"),
    new RegExp(`${B}(?:at |ob )?(\\d{1,2})()\\s*(am|pm)${E}`, "iu"),
    new RegExp(`${B}(?:at|ob) (\\d{1,2})()(?:\\s*(?:h|uri?))?${E}`, "iu"),
  ];
  for (const re of tries) {
    const m = text.match(re);
    if (!m) continue;
    let hours = +m[1];
    const minutes = m[2] ? +m[2] : 0;
    const ampm = m[3]?.toLowerCase();
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59) continue;
    return { hours, minutes, matched: m[0] };
  }
  return null;
}

function removeToken(text: string, matched: string): string {
  return text.replace(matched, " ").replace(/\s+/g, " ").trim();
}

/** Pulls a date and/or time out of quick-add text; a time alone means today. */
export function parseNaturalDate(text: string): { due: Due | null; remaining: string } {
  let remaining = text;
  const time = parseTimeToken(remaining);
  if (time) remaining = removeToken(remaining, time.matched);
  const date = parseDateToken(remaining);
  if (date) remaining = removeToken(remaining, date.matched);
  if (!date && !time) return { due: null, remaining: text };

  const day = date?.date ?? startOfDay(new Date());
  const label = [date?.matched, time?.matched].filter(Boolean).join(" ");
  if (!time) return { due: makeDue(day, label), remaining };
  const withTime = new Date(day);
  withTime.setHours(time.hours, time.minutes, 0, 0);
  return {
    due: { date: format(day, "yyyy-MM-dd"), datetime: withTime.toISOString(), string: label, isRecurring: false },
    remaining,
  };
}
