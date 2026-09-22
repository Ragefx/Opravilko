import { addDays, addMonths, addYears, format } from "date-fns";
import { nanoid } from "nanoid";
import type { CalendarEvent } from "../api/types";

interface RawEvent {
  uid: string;
  summary: string;
  dtstart: string;
  dtend: string | null;
  rrule: string | null;
  exdates: Set<string>;
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
  if (colonIdx === -1) return { name: line, params: {}, value: "" };
  const head = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const [k, v] = p.split("=");
    if (k && v) params[k.toUpperCase()] = v;
  }
  return { name: name.toUpperCase(), params, value };
}

/** Parses an ICS DATE ("20261001") or DATE-TIME ("20261001T150000Z") into a local Date. */
function parseIcsDate(value: string): { date: Date; allDay: boolean } {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return { date: new Date(value), allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) {
    return { date: new Date(Number(y), Number(mo) - 1, Number(d)), allDay: true };
  }
  // A trailing "Z" is UTC; otherwise (even with a TZID param, which we don't resolve
  // against a timezone database) treat the wall-clock numbers as local time.
  const date = z
    ? new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)))
    : new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  return { date, allDay: false };
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

/**
 * Parses an ICS feed's text into flat CalendarEvent instances, expanding
 * simple RRULEs (DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY)
 * within [windowStart, windowEnd]. Complex recurrence (BYSETPOS, RDATE,
 * timezone-aware EXDATE matching, etc.) isn't attempted -- good enough for
 * the common cases (yearly birthdays, weekly show listings).
 */
export function parseIcs(
  text: string,
  feedId: string,
  color: string,
  windowStart: Date,
  windowEnd: Date
): CalendarEvent[] {
  const lines = unfold(text);
  const rawEvents: RawEvent[] = [];
  let cur: Partial<RawEvent> | null = null;

  for (const line of lines) {
    const { name, value } = parseLine(line);
    if (name === "BEGIN" && value === "VEVENT") {
      cur = { exdates: new Set() };
    } else if (name === "END" && value === "VEVENT") {
      if (cur?.uid && cur.dtstart) rawEvents.push(cur as RawEvent);
      cur = null;
    } else if (cur) {
      if (name === "UID") cur.uid = value;
      else if (name === "SUMMARY") cur.summary = value.replace(/\\,/g, ",").replace(/\\n/gi, " ");
      else if (name === "DTSTART") cur.dtstart = value;
      else if (name === "DTEND") cur.dtend = value;
      else if (name === "RRULE") cur.rrule = value;
      else if (name === "EXDATE") cur.exdates!.add(value.split(",")[0]);
    }
  }

  const events: CalendarEvent[] = [];
  for (const raw of rawEvents) {
    const { date: startDate, allDay } = parseIcsDate(raw.dtstart);
    const endDate = raw.dtend ? parseIcsDate(raw.dtend).date : null;
    const durationMs = endDate ? endDate.getTime() - startDate.getTime() : 0;

    const occurrences: Date[] = [];
    if (raw.rrule) {
      const rule = parseRRule(raw.rrule);
      const freq = rule.FREQ;
      const interval = Math.max(1, parseInt(rule.INTERVAL || "1", 10));
      const count = rule.COUNT ? parseInt(rule.COUNT, 10) : Infinity;
      const until = rule.UNTIL ? parseIcsDate(rule.UNTIL).date : null;
      const byDay = rule.BYDAY ? rule.BYDAY.split(",") : null;

      let d = startDate;
      let n = 0;
      let iterations = 0;
      while (d <= windowEnd && n < count && iterations < 2000) {
        iterations++;
        const inRange = d >= windowStart;
        const matchesDay = !byDay || byDay.includes(WEEKDAY_CODES[d.getDay()]);
        if (until && d > until) break;
        if (inRange && matchesDay) {
          occurrences.push(d);
          n++;
        }
        if (freq === "DAILY") d = addDays(d, interval);
        else if (freq === "WEEKLY") d = addDays(d, byDay ? 1 : 7 * interval);
        else if (freq === "MONTHLY") d = addMonths(d, interval);
        else if (freq === "YEARLY") d = addYears(d, interval);
        else break; // unsupported frequency -- treat as a one-off below
      }
      if (occurrences.length === 0 && !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
        if (startDate >= windowStart && startDate <= windowEnd) occurrences.push(startDate);
      }
    } else if (startDate >= windowStart && startDate <= windowEnd) {
      occurrences.push(startDate);
    }

    for (const occStart of occurrences) {
      const key = format(occStart, "yyyyMMdd'T'HHmmss");
      if (raw.exdates.has(key) || raw.exdates.has(format(occStart, "yyyyMMdd"))) continue;
      const occEnd = durationMs ? new Date(occStart.getTime() + durationMs) : null;
      events.push({
        id: nanoid(),
        feedId,
        color,
        uid: `${raw.uid}:${format(occStart, "yyyyMMdd")}`,
        title: raw.summary || "(untitled)",
        date: format(occStart, "yyyy-MM-dd"),
        start: allDay ? null : occStart.toISOString(),
        end: allDay ? null : occEnd?.toISOString() ?? null,
        allDay,
      });
    }
  }

  return events;
}
