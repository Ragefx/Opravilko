import { addDays, format, startOfDay } from "date-fns";
import type { ActivitySummary, AppData, CompletionEntry } from "../api/types";

/**
 * Every recorded completion. Tasks completed before the completion log existed
 * only have their `completedAt`, so those are folded in too (deduplicated
 * against the log, which records the same timestamp).
 */
export function allCompletions(data: AppData): CompletionEntry[] {
  const log = data.completionLog ?? [];
  const seen = new Set(log.map((e) => `${e.taskId}@${e.at}`));
  // Only your own: a shared task your partner ticked off is theirs.
  const legacy = data.tasks
    .filter((t) => t.completed && t.completedAt && !seen.has(`${t.id}@${t.completedAt}`))
    .filter((t) => !t.completedBy || !data.me || t.completedBy === data.me)
    .map((t) => ({ taskId: t.id, projectId: t.projectId, content: t.content, at: t.completedAt! }));
  return [...log, ...legacy];
}

/** Completions per local calendar day, keyed "yyyy-MM-dd". */
export function countByDay(entries: CompletionEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const key = format(new Date(e.at), "yyyy-MM-dd");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Consecutive days with at least one completion, ending today -- or ending
 * yesterday when nothing's been done yet today, so the streak doesn't read
 * as broken first thing in the morning.
 */
export function currentStreak(byDay: Map<string, number>, today = new Date()): number {
  let day = startOfDay(today);
  if (!byDay.get(format(day, "yyyy-MM-dd"))) day = addDays(day, -1);
  let streak = 0;
  while (byDay.get(format(day, "yyyy-MM-dd"))) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

export function longestStreak(byDay: Map<string, number>): number {
  const days = [...byDay.keys()].filter((k) => byDay.get(k)).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev && format(addDays(new Date(`${prev}T00:00:00`), 1), "yyyy-MM-dd") === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** The last `n` days (oldest first) with their completion counts. */
export function lastNDays(byDay: Map<string, number>, n: number, today = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const d = addDays(startOfDay(today), i - (n - 1));
    const key = format(d, "yyyy-MM-dd");
    return { date: d, key, count: byDay.get(key) ?? 0 };
  });
}

/** A clean axis top and tick step (1/2/5 x 10^n) covering `max` in at most ~4 steps. */
export function niceScale(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 4, step: 1 };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const cleanStep = Math.max(1, step);
  return { top: Math.ceil(max / cleanStep) * cleanStep, step: cleanStep };
}

// ---------- you and your partner ----------

const SUMMARY_DAYS = 120;
/** Ticks at the shop further apart than this are separate trips. */
const TRIP_GAP_MS = 90 * 60 * 1000;

/** Your completions as numbers per day (no names), for your partner's Productivity page. */
export function activitySummary(data: AppData, today = new Date()): ActivitySummary {
  const shopLists = new Set(data.projects.filter((p) => p.viewStyle === "shopping").map((p) => p.id));
  const entries = allCompletions(data);
  const from = format(addDays(startOfDay(today), -(SUMMARY_DAYS - 1)), "yyyy-MM-dd");
  const days: Record<string, [number, number, number]> = {};
  const shopTimes = new Map<string, number[]>();
  for (const e of entries) {
    const when = new Date(e.at);
    const key = format(when, "yyyy-MM-dd");
    if (key < from) continue;
    const day = (days[key] ??= [0, 0, 0]);
    day[0]++;
    if (shopLists.has(e.projectId)) {
      day[1]++;
      const list = shopTimes.get(key) ?? [];
      list.push(when.getTime());
      shopTimes.set(key, list);
    }
  }
  for (const [key, times] of shopTimes) {
    times.sort((a, b) => a - b);
    days[key][2] = times.filter((t, i) => i === 0 || t - times[i - 1] > TRIP_GAP_MS).length;
  }
  return { at: new Date().toISOString(), total: entries.length, days };
}

export interface PersonTotals {
  today: number;
  week: number;
  prevWeek: number;
  month: number;
  bought: number;
  trips: number;
  /** Last `n` days, oldest first. */
  perDay: number[];
}

/** Totals from a summary: today, last 7 days, the 7 before, 30 days, and shopping over 30 days. */
export function totalsOf(summary: ActivitySummary | null | undefined, n: number, today = new Date()): PersonTotals {
  const keys = Array.from({ length: Math.max(n, 30) }, (_, i) =>
    format(addDays(startOfDay(today), -i), "yyyy-MM-dd")
  );
  const day = (k: string) => summary?.days[k] ?? [0, 0, 0];
  const sum = (ks: string[], i: number) => ks.reduce((acc, k) => acc + day(k)[i], 0);
  const last30 = keys.slice(0, 30);
  return {
    today: day(keys[0])[0],
    week: sum(keys.slice(0, 7), 0),
    prevWeek: sum(
      Array.from({ length: 7 }, (_, i) => format(addDays(startOfDay(today), -(7 + i)), "yyyy-MM-dd")),
      0
    ),
    month: sum(last30, 0),
    bought: sum(last30, 1),
    trips: sum(last30, 2),
    perDay: keys.slice(0, n).reverse().map((k) => day(k)[0]),
  };
}
