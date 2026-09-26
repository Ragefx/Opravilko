import type { Due, Priority } from "../api/types";
import { format } from "date-fns";
import { parseDateToken, parseNaturalDate, parseTimeToken } from "./date";
import {
  describeRecurrence,
  initialDueForRecurrence,
  parseNaturalRecurrence,
  serializeRecurrence,
} from "./recurrence";

const PRIORITY_FLAG_RE = /\bp([1-3])\b/i;
// Unicode-aware (so "@služba" isn't cut to "@slu") and anchored to a word
// start, so an email address like "ana@example.com" isn't read as a label.
const LABEL_RE = /(?<=^|\s)@([\p{L}\p{N}_-]+)/gu;
const PROJECT_RE = /(?<=^|\s)#([\p{L}\p{N}_-]+)/gu;
const SHARED_RE = /(?<=^|\s)\+(midva|shared)(?=\s|$)/giu;

export interface ParsedQuickAdd {
  content: string;
  priority: Priority;
  labels: string[];
  due: Due | null;
  /** Project name typed as #Name, if any -- callers resolve it to an id. */
  projectName: string | null;
  /** "+midva" or "+shared" typed: share it with your partner. */
  shared: boolean;
}

/**
 * Pulls Todoist-style tokens out of a quick-add string:
 *   "Draft proposal every monday p1 @work #Marketing"
 * Anything left over becomes the task title.
 */
export function parseQuickAddInput(raw: string, defaultDue?: { date: string; string: string } | null): ParsedQuickAdd {
  let content = raw.trim();

  let priority: Priority = 1;
  const pm = content.match(PRIORITY_FLAG_RE);
  if (pm) {
    const typed = parseInt(pm[1], 10); // p1 (urgent) .. p3, as the user types it
    priority = (5 - typed) as Priority; // stored inverted: p1 -> 4 .. p3 -> 2
    content = content.replace(PRIORITY_FLAG_RE, "").trim();
  }

  const labels = [...content.matchAll(LABEL_RE)].map((m) => m[1]);
  content = content.replace(LABEL_RE, "").trim();

  const shared = content.search(SHARED_RE) !== -1;
  content = content.replace(SHARED_RE, "").trim();

  const projectMatches = [...content.matchAll(PROJECT_RE)].map((m) => m[1]);
  const projectName = projectMatches[0] ?? null;
  content = content.replace(PROJECT_RE, "").trim();

  // A date typed into the text wins over the view's default (e.g. typing
  // "tomorrow" into Today's quick add), matching Todoist.
  let due: Due | null = null;
  const recurrence = parseNaturalRecurrence(content);
  if (recurrence) {
    content = content.replace(recurrence.matchedText, "").trim();
    // A date or time typed alongside sets where it starts:
    // "E-vinjeta 30.11. vsako leto", "Trening every friday ob 18".
    const time = parseTimeToken(content);
    if (time) content = content.replace(time.matched, "").trim();
    const start = parseDateToken(content);
    if (start) content = content.replace(start.matched, "").trim();
    const date = start ? format(start.date, "yyyy-MM-dd") : initialDueForRecurrence(recurrence.rule);
    let datetime: string | undefined;
    if (time) {
      const d = new Date(`${date}T00:00:00`);
      d.setHours(time.hours, time.minutes, 0, 0);
      datetime = d.toISOString();
    }
    due = {
      date,
      ...(datetime ? { datetime } : {}),
      string: describeRecurrence(recurrence.rule),
      isRecurring: true,
      rrule: serializeRecurrence(recurrence.rule),
    };
  } else {
    const parsed = parseNaturalDate(content);
    due = parsed.due;
    content = parsed.remaining;
  }
  if (!due && defaultDue) due = { ...defaultDue, isRecurring: false };

  return {
    content: content.replace(/\s+/g, " ").trim(),
    priority,
    labels,
    due,
    projectName,
    shared,
  };
}

/**
 * The typed text in pieces, each marked when Add task read it as something
 * (a date, time, repeat, p1, @label, #project, +midva) rather than the name:
 * the words missing from the parsed `content`, in order.
 */
export function highlightParts(raw: string, content: string): { text: string; hit: boolean }[] {
  const kept = content.split(/\s+/).filter(Boolean);
  // Each word (with the spaces after it), marked when it isn't part of the name.
  const words: { word: string; space: string; hit: boolean }[] = [];
  const lead = raw.match(/^\s*/)![0];
  let k = 0;
  for (const m of raw.slice(lead.length).matchAll(/(\S+)(\s*)/g)) {
    const hit = !(k < kept.length && kept[k] === m[1]);
    if (!hit) k++;
    words.push({ word: m[1], space: m[2], hit });
  }
  // #project, @label, +midva and p1..p3 are each their own highlight; the words
  // of a date or a repeat ("ob 9h", "every friday") read as one.
  const ownPiece = (w: string) => /^[#@+]/.test(w) || /^p[1-4]$/i.test(w);
  const out: { text: string; hit: boolean }[] = lead ? [{ text: lead, hit: false }] : [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    const joins = w.hit && prev?.hit && !ownPiece(w.word) && !ownPiece(prev.word);
    const last = out[out.length - 1];
    if (joins && last?.hit) last.text += prev.space + w.word;
    else {
      if (prev) {
        const tail = out[out.length - 1];
        if (tail && !tail.hit) tail.text += prev.space;
        else if (prev.space) out.push({ text: prev.space, hit: false });
      }
      const next = out[out.length - 1];
      if (!w.hit && next && !next.hit) next.text += w.word;
      else out.push({ text: w.word, hit: w.hit });
    }
  });
  const end = words[words.length - 1]?.space;
  if (end) out.push({ text: end, hit: false });
  return out.filter((p) => p.text);
}
