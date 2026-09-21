import { parseISO, isValid, format } from "date-fns";
import type { Due, Priority } from "../api/types";
import { parseNaturalDate } from "./date";
import {
  describeRecurrence,
  initialDueForRecurrence,
  parseNaturalRecurrence,
  serializeRecurrence,
} from "./recurrence";

/** One row of a parsed Todoist CSV export, already mapped to our shapes. */
export interface ImportedTask {
  content: string;
  description: string;
  priority: Priority;
  due: Due | null;
  /** 1 = top level, 2 = subtask, ... (Todoist's INDENT column). */
  indent: number;
  sectionName: string | null;
}

export interface ImportPreview {
  sections: string[];
  tasks: ImportedTask[];
  /** Rows we couldn't interpret, surfaced so the user isn't silently shortchanged. */
  skipped: number;
}

/**
 * Minimal RFC4180 CSV reader: handles quoted fields, escaped quotes ("") and
 * newlines inside quotes. Todoist's export uses all three.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalise line endings so \r\n inside the file doesn't leak into values.
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Todoist writes dates as ISO ("2026-09-20"), as display text ("Mar 20"), or as
 * a recurrence phrase ("every day"). Try each in turn.
 */
function parseImportedDate(raw: string): Due | null {
  const value = raw.trim();
  if (!value) return null;

  const recurrence = parseNaturalRecurrence(value);
  if (recurrence) {
    return {
      date: initialDueForRecurrence(recurrence.rule),
      string: describeRecurrence(recurrence.rule),
      isRecurring: true,
      rrule: serializeRecurrence(recurrence.rule),
    };
  }

  const iso = parseISO(value);
  if (isValid(iso)) {
    return { date: format(iso, "yyyy-MM-dd"), string: value, isRecurring: false };
  }

  const loose = new Date(value);
  if (isValid(loose) && !Number.isNaN(loose.getTime())) {
    return { date: format(loose, "yyyy-MM-dd"), string: value, isRecurring: false };
  }

  return parseNaturalDate(value).due;
}

/** Todoist's CSV PRIORITY is 1 (highest) .. 4 (none); we store the inverse. */
function mapPriority(raw: string): Priority {
  const n = parseInt(raw.trim(), 10);
  if (!n || n < 1 || n > 4) return 1;
  return (5 - n) as Priority;
}

export function parseTodoistCsv(text: string): ImportPreview {
  const rows = parseCsv(text);
  if (rows.length === 0) return { sections: [], tasks: [], skipped: 0 };

  const header = rows[0].map((h) => h.trim().toUpperCase());
  const col = (name: string) => header.indexOf(name);
  const iType = col("TYPE");
  const iContent = col("CONTENT");
  const iDescription = col("DESCRIPTION");
  const iPriority = col("PRIORITY");
  const iIndent = col("INDENT");
  const iDate = col("DATE");

  if (iType === -1 || iContent === -1) {
    throw new Error("This doesn't look like a Todoist CSV export (missing TYPE/CONTENT columns).");
  }

  const sections: string[] = [];
  const tasks: ImportedTask[] = [];
  let currentSection: string | null = null;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const type = (row[iType] ?? "").trim().toLowerCase();
    const content = (row[iContent] ?? "").trim();

    if (!type) continue; // Todoist pads the file with blank separator rows.

    if (type === "section") {
      if (content) {
        currentSection = content;
        if (!sections.includes(content)) sections.push(content);
      } else {
        // An empty section row marks the end of a section in Todoist's format.
        currentSection = null;
      }
      continue;
    }

    if (type === "task") {
      if (!content) {
        skipped++;
        continue;
      }
      tasks.push({
        content,
        description: iDescription === -1 ? "" : (row[iDescription] ?? "").trim(),
        priority: iPriority === -1 ? 1 : mapPriority(row[iPriority] ?? ""),
        due: iDate === -1 ? null : parseImportedDate(row[iDate] ?? ""),
        indent: iIndent === -1 ? 1 : Math.max(1, parseInt((row[iIndent] ?? "1").trim(), 10) || 1),
        sectionName: currentSection,
      });
      continue;
    }

    // "note" rows and anything else aren't represented as tasks.
    skipped++;
  }

  return { sections, tasks, skipped };
}
