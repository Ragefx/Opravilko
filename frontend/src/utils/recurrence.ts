import { addDays, addMonths, addYears, endOfMonth, format, getDay, getDaysInMonth, parseISO, startOfDay } from "date-fns";
import type { Due } from "../api/types";
import { WEEKDAY_PATTERN } from "./date";

export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly" | "weekdays" | "every_n_days";

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** every_n_days: the N. weekly/monthly/yearly: every N weeks/months/years (default 1). */
  interval?: number;
  byDay?: number[]; // 0=Sun..6=Sat, used by weekly to pin to specific day(s)
  /** monthly: always on this day of the month (clamped to short months); -1 = the last day. */
  byMonthDay?: number;
  /** The next date counts from when it's done, not from its date ("every 3 months after done"). */
  afterDone?: boolean;
}

const WEEKDAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function serializeRecurrence(rule: RecurrenceRule): string {
  return JSON.stringify(rule);
}

export function parseRecurrenceString(str: string | undefined): RecurrenceRule | null {
  if (!str) return null;
  try {
    return JSON.parse(str) as RecurrenceRule;
  } catch {
    return null;
  }
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${s}`;
}

export function describeRecurrence(rule: RecurrenceRule | null): string {
  if (!rule) return "";
  if (rule.afterDone) {
    // Pinned days don't apply when counting from the day it's done.
    const base = describeRecurrence({ freq: rule.freq, interval: rule.interval });
    return base ? `${base} after done` : "";
  }
  const n = Math.max(1, rule.interval || 1);
  switch (rule.freq) {
    case "daily":
      return "Every day";
    case "weekdays":
      return "Every weekday";
    case "weekly": {
      const every = n === 1 ? "Every week" : `Every ${n} weeks`;
      if (rule.byDay && rule.byDay.length === 1) {
        const day = format(new Date(2026, 0, 4 + rule.byDay[0]), "EEEE");
        return n === 1 ? `Every ${day}` : `${every} on ${day}`;
      }
      return every;
    }
    case "monthly": {
      const every = n === 1 ? "Every month" : `Every ${n} months`;
      if (rule.byMonthDay === -1) return `${every} on the last day`;
      if (rule.byMonthDay) return `${every} on the ${ordinal(rule.byMonthDay)}`;
      return every;
    }
    case "yearly":
      return n === 1 ? "Every year" : `Every ${n} years`;
    case "every_n_days":
      return `Every ${n} days`;
    default:
      return "";
  }
}

/** The given month's version of a byMonthDay rule (-1 = last day, 31 -> 30 in short months). */
function onMonthDay(d: Date, byMonthDay: number): Date {
  const days = getDaysInMonth(d);
  const day = byMonthDay === -1 ? days : Math.min(byMonthDay, days);
  return new Date(d.getFullYear(), d.getMonth(), day);
}

/** Advances a "yyyy-MM-dd" date string forward according to the rule. */
export function advanceDate(dateStr: string, rule: RecurrenceRule): string {
  let d = parseISO(dateStr);
  const n = Math.max(1, rule.interval || 1);
  switch (rule.freq) {
    case "daily":
      d = addDays(d, 1);
      break;
    case "every_n_days":
      d = addDays(d, n);
      break;
    case "monthly": {
      // Step from the 1st so "the 31st" doesn't drift to the 28th after February.
      const next = addMonths(new Date(d.getFullYear(), d.getMonth(), 1), n);
      d = rule.byMonthDay ? onMonthDay(next, rule.byMonthDay) : addMonths(d, n);
      break;
    }
    case "yearly":
      d = addYears(d, n);
      break;
    case "weekdays": {
      d = addDays(d, 1);
      while (getDay(d) === 0 || getDay(d) === 6) d = addDays(d, 1);
      break;
    }
    case "weekly":
    default: {
      d = addDays(d, 7 * n);
      break;
    }
  }
  return format(d, "yyyy-MM-dd");
}

/**
 * The next date for a repeating task done on `doneOn`: counted from its own
 * date (skipping missed ones), or with afterDone from the day it was done.
 */
export function nextOccurrence(dateStr: string, rule: RecurrenceRule, doneOn: string): string {
  if (rule.afterDone) return advanceDate(doneOn, { freq: rule.freq, interval: rule.interval });
  let next = advanceDate(dateStr, rule);
  while (next < doneOn) next = advanceDate(next, rule);
  return next;
}

/** Picks the first date (today or later) that satisfies the rule, as "yyyy-MM-dd". */
export function initialDueForRecurrence(rule: RecurrenceRule): string {
  let d = startOfDay(new Date());
  if (rule.freq === "weekdays") {
    while (getDay(d) === 0 || getDay(d) === 6) d = addDays(d, 1);
  } else if (rule.freq === "weekly" && rule.byDay && rule.byDay.length === 1) {
    const target = rule.byDay[0];
    while (getDay(d) !== target) d = addDays(d, 1);
  } else if (rule.freq === "monthly" && rule.byMonthDay) {
    const thisMonth = onMonthDay(d, rule.byMonthDay);
    d = thisMonth >= d ? thisMonth : onMonthDay(addMonths(new Date(d.getFullYear(), d.getMonth(), 1), 1), rule.byMonthDay);
  }
  return format(d, "yyyy-MM-dd");
}

/**
 * The repeat choices offered in the pickers. Each builds its rule from the
 * task's date, so "every month" keeps that day of the month, and "last day"
 * moves the date to the end of its month.
 */
export const REPEAT_PRESETS = [
  { key: "daily", label: "Every day" },
  { key: "weekdays", label: "Every weekday" },
  { key: "weekly", label: "Every week" },
  { key: "biweekly", label: "Every 2 weeks" },
  { key: "monthly", label: "Every month" },
  { key: "monthly_last", label: "Every month, last day" },
  { key: "yearly", label: "Every year" },
] as const;
export type RepeatPreset = (typeof REPEAT_PRESETS)[number]["key"];

export function ruleForPreset(preset: RepeatPreset, dateStr: string): RecurrenceRule {
  const d = parseISO(dateStr);
  switch (preset) {
    case "biweekly":
      return { freq: "weekly", interval: 2, byDay: [getDay(d)] };
    case "weekly":
      return { freq: "weekly", byDay: [getDay(d)] };
    case "monthly":
      return { freq: "monthly", byMonthDay: d.getDate() };
    case "monthly_last":
      return { freq: "monthly", byMonthDay: -1 };
    default:
      return { freq: preset };
  }
}

/** Which picker choice a stored rule is, or null for one typed in some other way ("every 3 days"). */
export function presetForRule(rule: RecurrenceRule | null): RepeatPreset | null {
  if (!rule) return null;
  const n = Math.max(1, rule.interval || 1);
  if (rule.freq === "weekly") return n === 1 ? "weekly" : n === 2 ? "biweekly" : null;
  if (rule.freq === "monthly" && n === 1) return rule.byMonthDay === -1 ? "monthly_last" : "monthly";
  if ((rule.freq === "daily" || rule.freq === "weekdays" || rule.freq === "yearly") && n === 1) return rule.freq;
  return null;
}

/** A due date made to repeat with a picker choice, starting from its own date (or today). */
export function dueWithPreset(due: Due | null, preset: RepeatPreset, afterDone = false): Due {
  const rule: RecurrenceRule = { ...ruleForPreset(preset, due?.date ?? format(new Date(), "yyyy-MM-dd")), ...(afterDone ? { afterDone } : {}) };
  let date = due?.date ?? initialDueForRecurrence(rule);
  if (rule.freq === "monthly" && rule.byMonthDay === -1) date = format(endOfMonth(parseISO(date)), "yyyy-MM-dd");
  if (rule.freq === "weekdays" && !due) date = initialDueForRecurrence(rule);
  return {
    date,
    datetime: due?.datetime,
    string: describeRecurrence(rule),
    isRecurring: true,
    rrule: serializeRecurrence(rule),
  };
}

/**
 * Layers a picked repeat choice onto a due date built from quick-add text.
 * If the text already set its own recurrence (typed "every monday"), that
 * wins.
 */
export function applyRecurrence(due: Due | null, preset: RepeatPreset | "none"): Due | null {
  if (preset === "none" || due?.isRecurring) return due;
  return dueWithPreset(due, preset);
}

// ---------- typed recurrence ("every 2 weeks", "vsako leto") ----------

const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}.])";
const SL_WEEKDAYS = [
  "nedelj[oe]?|nedelja",
  "ponedeljek|ponedeljka",
  "torek|torka",
  "sred[oa]",
  "[čc]etrtek|[čc]etrtka",
  "petek|petka",
  "sobot[oa]",
];
/** "ob petkih" (on Fridays), Sunday first. */
const SL_WEEKDAYS_PLURAL = ["nedeljah", "ponedeljkih", "torkih", "sredah", "[čc]etrtkih", "petkih", "sobotah"];

/** Detects phrases like "every day", "every 2 weeks", "vsak petek", "vsako leto", "every 15th" in quick-add text. */
export function parseNaturalRecurrence(text: string): { rule: RecurrenceRule; matchedText: string } | null {
  const tries: { re: string; rule: (m: RegExpMatchArray) => RecurrenceRule }[] = [
    { re: "every (\\d+) days?|vsak(?:ih|e)? (\\d+) dni|na (\\d+) dni", rule: (m) => ({ freq: "every_n_days", interval: +(m[1] ?? m[2] ?? m[3]) }) },
    { re: "every (\\d+) weeks?|vsak(?:ih|[aie])? (\\d+) tedn(?:ov|[ae])|na (\\d+) tedn(?:ov|[ae])", rule: (m) => ({ freq: "weekly", interval: +(m[1] ?? m[2] ?? m[3]) }) },
    { re: "every other week|biweekly|vsak drugi teden", rule: () => ({ freq: "weekly", interval: 2 }) },
    { re: "every (\\d+) months?|vsak(?:ih|[aie])? (\\d+) mesec(?:ev|[ae])?|na (\\d+) mesec(?:ev|[ae])?", rule: (m) => ({ freq: "monthly", interval: +(m[1] ?? m[2] ?? m[3]) }) },
    { re: "every (\\d+) years?|vsak(?:ih|[aie])? (\\d+) let[ai]?|na (\\d+) let[ai]?", rule: (m) => ({ freq: "yearly", interval: +(m[1] ?? m[2] ?? m[3]) }) },
    { re: "every weekday|every workday|vsak delavnik|ob delavnikih|med tednom", rule: () => ({ freq: "weekdays" }) },
    { re: "every day|daily|vsak dan|vsaki dan|dnevno", rule: () => ({ freq: "daily" }) },
    {
      re: "(?:on the |every )?last day of (?:the |every )?month|every last day|(?:vsak )?zadnji dan v mesecu|vsak zadnji dan",
      rule: () => ({ freq: "monthly", byMonthDay: -1 }),
    },
    {
      re: "every (\\d{1,2})(?:st|nd|rd|th)(?: of the month)?|every month on the (\\d{1,2})(?:st|nd|rd|th)?|vsak(?:ega)? (\\d{1,2})\\.(?: v mesecu)?",
      rule: (m) => ({ freq: "monthly", byMonthDay: +(m[1] ?? m[2] ?? m[3]) }),
    },
    { re: "every month|monthly|vsak mesec|mese[čc]no", rule: () => ({ freq: "monthly" }) },
    { re: "every year|yearly|annually|vsako leto|letno", rule: () => ({ freq: "yearly" }) },
  ];
  for (const t of tries) {
    const m = text.match(new RegExp(`${B}(?:${t.re})${E}`, "iu"));
    if (m) {
      const rule = t.rule(m);
      if (rule.byMonthDay && rule.byMonthDay !== -1 && (rule.byMonthDay < 1 || rule.byMonthDay > 31)) continue;
      return { rule, matchedText: m[0] };
    }
  }

  // Weekdays: "every monday", "vsak petek", "vsako sredo", "ob petkih"
  for (let i = 0; i < 7; i++) {
    const en = i === 0 ? "sun(?:day)?" : i === 6 ? "sat(?:urday)?" : WEEKDAY_PATTERN;
    const re = new RegExp(`${B}(?:every (${en})|vsak[oa]? (?:${SL_WEEKDAYS[i]})|ob (?:${SL_WEEKDAYS_PLURAL[i]}))${E}`, "iu");
    const m = text.match(re);
    if (!m) continue;
    // WEEKDAY_PATTERN matches any weekday; check it's this one.
    if (m[1] && WEEKDAY_NAMES.indexOf(m[1].slice(0, 3).toLowerCase()) !== i) continue;
    return { rule: { freq: "weekly", byDay: [i] }, matchedText: m[0] };
  }

  const week = text.match(new RegExp(`${B}(?:every week|weekly|vsak teden|tedensko)${E}`, "iu"));
  if (week) return { rule: { freq: "weekly" }, matchedText: week[0] };

  return null;
}
