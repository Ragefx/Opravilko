import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  differenceInCalendarYears,
  format,
  getDaysInMonth,
  startOfWeek,
} from "date-fns";
import type { CalendarEvent } from "../api/types";

interface IcsDate {
  date: Date;
  allDay: boolean;
}

interface RawEvent {
  uid: string;
  summary: string;
  start: IcsDate | null;
  end: IcsDate | null;
  rrule: string | null;
  /** Excluded occurrences, as epoch ms (timed) and "yyyyMMdd" (all-day). */
  exTimes: Set<number>;
  exDays: Set<string>;
  recurrenceId: IcsDate | null;
  cancelled: boolean;
}

/** RFC5545 line folding: a line starting with a space/tab continues the previous one. */
function unfold(text: string): string[] {
  const raw = text.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.trim()) {
      lines.push(line);
    }
  }
  return lines;
}

/** Splits "NAME;PARAM=X:value" into { name, params, value }. */
function parseLine(line: string): { name: string; params: Record<string, string>; value: string } {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return { name: line.toUpperCase(), params: {}, value: "" };
  const head = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? " " : c));
}

const tzFormatters = new Map<string, Intl.DateTimeFormat>();

/** Milliseconds a zone is ahead of UTC at a given instant. */
function tzOffsetMs(timeZone: string, utcMs: number): number {
  let dtf = tzFormatters.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    tzFormatters.set(timeZone, dtf);
  }
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
}

/** Wall-clock time in a named zone ("Europe/Ljubljana") to an absolute Date. */
function zonedTimeToDate(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const asUtc = Date.UTC(y, mo, d, h, mi, s);
  try {
    const first = tzOffsetMs(tz, asUtc);
    let utc = asUtc - first;
    const second = tzOffsetMs(tz, utc);
    if (second !== first) utc = asUtc - second;
    return new Date(utc);
  } catch {
    // Unknown zone name (e.g. a Windows-style TZID) -- fall back to local time.
    return new Date(y, mo, d, h, mi, s);
  }
}

/** Parses a DATE ("20261001") or DATE-TIME ("20261001T150000Z", optionally with a TZID). */
function parseIcsDate(value: string, tzid?: string): IcsDate | null {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return { date: new Date(+y, +mo - 1, +d), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
  if (tzid) return { date: zonedTimeToDate(+y, +mo - 1, +d, +h, +mi, +s, tzid), allDay: false };
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
}

function parseRRule(rrule: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of rrule.split(";")) {
    const [k, v] = part.split("=");
    if (k && v) out[k.toUpperCase()] = v;
  }
  return out;
}

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** "2SU" -> { n: 2, day: 0 }, "-1FR" -> { n: -1, day: 5 }, "MO" -> { n: 0, day: 1 }. */
function parseByDay(code: string): { n: number; day: number } | null {
  const m = code.trim().match(/^([+-]?\d+)?([A-Z]{2})$/);
  if (!m) return null;
  const day = WEEKDAY_CODES.indexOf(m[2]);
  return day === -1 ? null : { n: m[1] ? parseInt(m[1], 10) : 0, day };
}

/** Candidate days in one month for BYDAY/BYMONTHDAY, keeping the start's time of day. */
function daysInMonthFor(
  year: number,
  month: number,
  timeFrom: Date,
  byDay: { n: number; day: number }[] | null,
  byMonthDay: number[] | null,
  fallbackDay: number
): Date[] {
  const dim = getDaysInMonth(new Date(year, month, 1));
  const at = (day: number) =>
    new Date(year, month, day, timeFrom.getHours(), timeFrom.getMinutes(), timeFrom.getSeconds());
  const days = new Set<number>();
  if (byMonthDay) {
    for (const md of byMonthDay) {
      const day = md > 0 ? md : dim + md + 1;
      if (day >= 1 && day <= dim) days.add(day);
    }
  } else if (byDay) {
    for (const { n, day } of byDay) {
      const matches: number[] = [];
      for (let dd = 1; dd <= dim; dd++) if (new Date(year, month, dd).getDay() === day) matches.push(dd);
      if (n === 0) matches.forEach((dd) => days.add(dd));
      else {
        const pick = n > 0 ? matches[n - 1] : matches[matches.length + n];
        if (pick) days.add(pick);
      }
    }
  } else if (fallbackDay <= dim) {
    days.add(fallbackDay);
  }
  return [...days].sort((a, b) => a - b).map(at);
}

/**
 * Expands an RRULE (DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL,
 * BYDAY incl. "2SU"-style ordinals, BYMONTHDAY, BYMONTH) into the occurrence
 * starts that fall inside the window. Each period is computed from the
 * series start rather than stepped from the previous one, so "the 31st"
 * doesn't drift to the 28th after February.
 */
function expandRRule(start: Date, rrule: string, windowStart: Date, windowEnd: Date): Date[] {
  const rule = parseRRule(rrule);
  const freq = rule.FREQ;
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
    return start >= windowStart && start <= windowEnd ? [start] : [];
  }
  const interval = Math.max(1, parseInt(rule.INTERVAL || "1", 10));
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : Infinity;
  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL)?.date ?? null : null;
  const byDay = rule.BYDAY ? rule.BYDAY.split(",").map(parseByDay).filter((x) => x !== null) : null;
  const byMonthDay = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(",").map(Number).filter(Boolean) : null;
  const byMonth = rule.BYMONTH ? rule.BYMONTH.split(",").map((m) => Number(m) - 1) : null;

  const periodStart = (i: number): Date => {
    const k = i * interval;
    if (freq === "DAILY") return addDays(start, k);
    if (freq === "WEEKLY") return addWeeks(start, k);
    if (freq === "MONTHLY") return addMonths(new Date(start.getFullYear(), start.getMonth(), 1), k);
    return addYears(new Date(start.getFullYear(), 0, 1), k);
  };

  const candidates = (i: number): Date[] => {
    const p = periodStart(i);
    // e.g. FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR -- a weekday-only daily event.
    if (freq === "DAILY") return !byDay?.length || byDay.some((b) => b.day === p.getDay()) ? [p] : [];
    if (freq === "WEEKLY") {
      if (!byDay?.length) return [p];
      const monday = startOfWeek(p, { weekStartsOn: 1 });
      return [0, 1, 2, 3, 4, 5, 6]
        .map((off) => addDays(monday, off))
        .filter((d) => byDay.some((b) => b.day === d.getDay()))
        .map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), start.getHours(), start.getMinutes(), start.getSeconds()));
    }
    if (freq === "MONTHLY") {
      return daysInMonthFor(p.getFullYear(), p.getMonth(), start, byDay, byMonthDay, start.getDate());
    }
    const months = byMonth ?? [start.getMonth()];
    return months.flatMap((mo) =>
      daysInMonthFor(p.getFullYear(), mo, start, byDay ?? null, byMonthDay, byDay || byMonthDay ? 0 : start.getDate())
    );
  };

  // Without a COUNT, jump straight to the window instead of walking from a
  // series start that may be years back.
  let first = 0;
  if (count === Infinity && windowStart > start) {
    const diff =
      freq === "DAILY"
        ? differenceInCalendarDays(windowStart, start)
        : freq === "WEEKLY"
          ? differenceInCalendarWeeks(windowStart, start, { weekStartsOn: 1 })
          : freq === "MONTHLY"
            ? differenceInCalendarMonths(windowStart, start)
            : differenceInCalendarYears(windowStart, start);
    first = Math.max(0, Math.floor(diff / interval) - 1);
  }

  const out: Date[] = [];
  let emitted = 0;
  for (let i = first; i < first + 5000; i++) {
    if (periodStart(i) > windowEnd && freq !== "WEEKLY") break;
    let done = false;
    for (const c of candidates(i)) {
      if (c < start) continue;
      if ((until && c > until) || emitted >= count || c > windowEnd) {
        done = true;
        break;
      }
      emitted++;
      if (c >= windowStart) out.push(c);
    }
    if (done) break;
  }
  return out;
}

function occurrenceKey(d: Date): number {
  return d.getTime();
}

/**
 * Parses an ICS feed's text into flat CalendarEvent instances within
 * [windowStart, windowEnd], expanding recurrence, honoring EXDATE and
 * per-occurrence overrides (RECURRENCE-ID), dropping cancelled events, and
 * spreading multi-day all-day events across each day they cover. Ids are
 * deterministic, so re-syncing an unchanged feed produces identical output.
 */
export function parseIcs(
  text: string,
  feedId: string,
  color: string,
  windowStart: Date,
  windowEnd: Date
): CalendarEvent[] {
  const rawEvents: RawEvent[] = [];
  let cur: RawEvent | null = null;

  for (const line of unfold(text)) {
    const { name, params, value } = parseLine(line);
    if (name === "BEGIN" && value === "VEVENT") {
      cur = {
        uid: "",
        summary: "",
        start: null,
        end: null,
        rrule: null,
        exTimes: new Set(),
        exDays: new Set(),
        recurrenceId: null,
        cancelled: false,
      };
    } else if (name === "END" && value === "VEVENT") {
      if (cur?.uid && cur.start) rawEvents.push(cur);
      cur = null;
    } else if (cur) {
      if (name === "UID") cur.uid = value;
      else if (name === "SUMMARY") cur.summary = unescapeText(value);
      else if (name === "DTSTART") cur.start = parseIcsDate(value, params.TZID);
      else if (name === "DTEND") cur.end = parseIcsDate(value, params.TZID);
      else if (name === "RRULE") cur.rrule = value;
      else if (name === "RECURRENCE-ID") cur.recurrenceId = parseIcsDate(value, params.TZID);
      else if (name === "STATUS") cur.cancelled = value.trim().toUpperCase() === "CANCELLED";
      else if (name === "EXDATE") {
        for (const v of value.split(",")) {
          const ex = parseIcsDate(v, params.TZID);
          if (!ex) continue;
          cur.exTimes.add(occurrenceKey(ex.date));
          cur.exDays.add(format(ex.date, "yyyyMMdd"));
        }
      }
    }
  }

  // Single occurrences that were edited or cancelled in the source calendar
  // replace the matching occurrence of their recurring master.
  const overridden = new Map<string, Set<number>>();
  for (const raw of rawEvents) {
    if (!raw.recurrenceId) continue;
    if (!overridden.has(raw.uid)) overridden.set(raw.uid, new Set());
    overridden.get(raw.uid)!.add(occurrenceKey(raw.recurrenceId.date));
  }

  const events: CalendarEvent[] = [];
  for (const raw of rawEvents) {
    if (raw.cancelled) continue;
    const { date: startDate, allDay } = raw.start!;
    const durationMs = raw.end ? raw.end.date.getTime() - startDate.getTime() : 0;

    let occurrences: Date[];
    if (raw.rrule && !raw.recurrenceId) {
      const skip = overridden.get(raw.uid);
      occurrences = expandRRule(startDate, raw.rrule, windowStart, windowEnd).filter(
        (d) =>
          !raw.exTimes.has(occurrenceKey(d)) &&
          !(allDay && raw.exDays.has(format(d, "yyyyMMdd"))) &&
          !skip?.has(occurrenceKey(d))
      );
    } else {
      const inWindow = startDate <= windowEnd && new Date(startDate.getTime() + durationMs) >= windowStart;
      occurrences = inWindow ? [startDate] : [];
    }

    for (const occStart of occurrences) {
      const occEnd = durationMs ? new Date(occStart.getTime() + durationMs) : null;
      // All-day DTEND is exclusive: a one-day event ends the next midnight.
      const dayCount = allDay && occEnd ? Math.max(1, differenceInCalendarDays(occEnd, occStart)) : 1;
      for (let dayIdx = 0; dayIdx < dayCount; dayIdx++) {
        const day = addDays(occStart, dayIdx);
        if (day < windowStart || day > windowEnd) continue;
        events.push({
          id: `${feedId}:${raw.uid}:${occStart.getTime()}:${dayIdx}`,
          feedId,
          color,
          uid: `${raw.uid}:${format(day, "yyyyMMdd")}`,
          title: raw.summary || "(untitled)",
          date: format(day, "yyyy-MM-dd"),
          start: allDay ? null : occStart.toISOString(),
          end: allDay ? null : (occEnd?.toISOString() ?? null),
          allDay,
        });
      }
    }
  }

  return events;
}
