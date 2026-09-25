package com.opravilko.app.widget;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

/**
 * The parts of the app's task rules the widget needs, ported from the web
 * code so both behave the same: completing a task (sub-tasks too, repeating
 * tasks move to their next date, every completion is logged), and which
 * tasks each widget view shows. Mirrors src/api/hooks.ts and
 * src/utils/recurrence.ts -- keep them in step.
 */
public final class TaskLogic {
    private static final int COMPLETION_LOG_LIMIT = 5000;
    /** Upcoming shows overdue tasks, then this many days starting today. */
    public static final int UPCOMING_DAYS = 7;

    private TaskLogic() {}

    // ---- dates ----

    static SimpleDateFormat dayFormat() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        f.setLenient(false);
        return f;
    }

    static SimpleDateFormat isoFormat() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f;
    }

    public static String nowIso() {
        return isoFormat().format(new Date());
    }

    public static String todayStr() {
        return dayFormat().format(new Date());
    }

    static String addDaysStr(String day, int days) {
        Calendar c = calendarFor(day);
        if (c == null) return day;
        c.add(Calendar.DAY_OF_MONTH, days);
        return dayFormat().format(c.getTime());
    }

    static Calendar calendarFor(String day) {
        try {
            Calendar c = Calendar.getInstance();
            c.setTime(dayFormat().parse(day));
            return c;
        } catch (ParseException | NullPointerException e) {
            return null;
        }
    }

    static Date parseIso(String iso) {
        if (iso == null) return null;
        try {
            return isoFormat().parse(iso);
        } catch (ParseException e) {
            return null;
        }
    }

    /** Whole calendar days from `from` to `to` ("yyyy-MM-dd"). */
    static int daysBetween(String from, String to) {
        Calendar a = calendarFor(from);
        Calendar b = calendarFor(to);
        if (a == null || b == null) return 0;
        // Noon avoids DST hours skewing the division.
        a.set(Calendar.HOUR_OF_DAY, 12);
        b.set(Calendar.HOUR_OF_DAY, 12);
        return (int) Math.round((b.getTimeInMillis() - a.getTimeInMillis()) / 86_400_000.0);
    }

    // ---- recurrence (src/utils/recurrence.ts: advanceDate) ----

    static String advanceDate(String day, JSONObject rule) {
        Calendar c = calendarFor(day);
        if (c == null) return day;
        String freq = rule.optString("freq", "weekly");
        int n = Math.max(1, rule.optInt("interval", 1));
        switch (freq) {
            case "daily":
                c.add(Calendar.DAY_OF_MONTH, 1);
                break;
            case "every_n_days":
                c.add(Calendar.DAY_OF_MONTH, n);
                break;
            case "monthly":
                if (rule.has("byMonthDay")) {
                    // Step from the 1st so "the 31st" doesn't drift after short
                    // months; -1 is the month's last day.
                    int byMonthDay = rule.optInt("byMonthDay", 0);
                    c.set(Calendar.DAY_OF_MONTH, 1);
                    c.add(Calendar.MONTH, n);
                    int max = c.getActualMaximum(Calendar.DAY_OF_MONTH);
                    c.set(Calendar.DAY_OF_MONTH, byMonthDay == -1 ? max : Math.max(1, Math.min(byMonthDay, max)));
                } else {
                    // Like date-fns addMonths: clamps the 31st to the month's last day.
                    c.add(Calendar.MONTH, n);
                }
                break;
            case "yearly":
                c.add(Calendar.YEAR, n);
                break;
            case "weekdays":
                c.add(Calendar.DAY_OF_MONTH, 1);
                while (c.get(Calendar.DAY_OF_WEEK) == Calendar.SATURDAY
                        || c.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY) {
                    c.add(Calendar.DAY_OF_MONTH, 1);
                }
                break;
            case "weekly":
            default:
                c.add(Calendar.DAY_OF_MONTH, 7 * n);
                break;
        }
        return dayFormat().format(c.getTime());
    }

    /** Next occurrence, skipping missed ones; a set time moves with the date. */
    static void advanceRecurringDue(JSONObject due, JSONObject rule) throws JSONException {
        String date = due.getString("date");
        String today = todayStr();
        String next;
        if (rule.optBoolean("afterDone")) {
            // "After done": counted from today, pinned days don't apply.
            JSONObject plain = new JSONObject().put("freq", rule.optString("freq"));
            if (rule.has("interval")) plain.put("interval", rule.optInt("interval"));
            next = advanceDate(today, plain);
        } else {
            next = advanceDate(date, rule);
            while (next.compareTo(today) < 0) next = advanceDate(next, rule);
        }
        if (due.has("datetime") && !due.isNull("datetime")) {
            Date dt = parseIso(due.optString("datetime"));
            if (dt != null) {
                Calendar c = Calendar.getInstance();
                c.setTime(dt);
                c.add(Calendar.DAY_OF_MONTH, daysBetween(date, next));
                due.put("datetime", isoFormat().format(c.getTime()));
            }
        }
        due.put("date", next);
    }

    // ---- completing (src/api/hooks.ts: useCompleteTask) ----

    static JSONObject findTask(JSONArray tasks, String id) {
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t != null && id.equals(t.optString("id"))) return t;
        }
        return null;
    }

    static void logCompletion(JSONObject data, JSONObject task, String at) throws JSONException {
        JSONArray log = data.optJSONArray("completionLog");
        if (log == null) {
            log = new JSONArray();
            data.put("completionLog", log);
        }
        JSONObject entry = new JSONObject();
        entry.put("taskId", task.optString("id"));
        entry.put("projectId", task.optString("projectId"));
        entry.put("content", task.optString("content"));
        entry.put("at", at);
        log.put(entry);
        if (log.length() > COMPLETION_LOG_LIMIT) {
            JSONArray trimmed = new JSONArray();
            for (int i = log.length() - COMPLETION_LOG_LIMIT; i < log.length(); i++) trimmed.put(log.get(i));
            data.put("completionLog", trimmed);
        }
    }

    /**
     * Completes a task in `data`. `expectedDueDate` guards repeating tasks
     * against being advanced twice (only advance if it's still on the date the
     * user saw when tapping). Returns true if anything changed.
     */
    public static boolean complete(JSONObject data, String taskId, String expectedDueDate, String at) {
        try {
            JSONArray tasks = data.optJSONArray("tasks");
            if (tasks == null || taskId == null) return false;
            JSONObject task = findTask(tasks, taskId);
            if (task == null || task.optBoolean("completed")) return false;

            JSONObject due = task.optJSONObject("due");
            if (due != null && due.optBoolean("isRecurring") && due.has("rrule")) {
                JSONObject rule = null;
                try {
                    rule = new JSONObject(due.optString("rrule"));
                } catch (JSONException ignored) {
                    // Unreadable rule: fall through and complete it like a one-off task.
                }
                if (rule != null) {
                    if (expectedDueDate != null && !expectedDueDate.equals(due.optString("date"))) return false;
                    advanceRecurringDue(due, rule);
                    task.put("updatedAt", at);
                    logCompletion(data, task, at);
                    return true;
                }
            }

            task.put("completed", true);
            task.put("completedAt", at);
            task.put("updatedAt", at);
            logCompletion(data, task, at);

            // Sub-tasks close with their parent.
            Set<String> ids = new HashSet<>();
            ids.add(taskId);
            boolean grew = true;
            while (grew) {
                grew = false;
                for (int i = 0; i < tasks.length(); i++) {
                    JSONObject t = tasks.optJSONObject(i);
                    if (t == null) continue;
                    String parent = t.isNull("parentId") ? null : t.optString("parentId", null);
                    if (parent != null && ids.contains(parent) && !ids.contains(t.optString("id"))) {
                        ids.add(t.optString("id"));
                        grew = true;
                        if (!t.optBoolean("completed")) {
                            t.put("completed", true);
                            t.put("completedAt", at);
                            t.put("updatedAt", at);
                            logCompletion(data, t, at);
                        }
                    }
                }
            }
            return true;
        } catch (JSONException e) {
            return false;
        }
    }

    // ---- views ----

    /** A task row as the widget shows it. */
    public static final class Row {
        public final String id;
        public final String projectId;
        public final String content;
        public final int priority;
        public final String dueDate;
        public final String dueDatetime;
        public final boolean recurring;
        public final String projectName;
        public final boolean projectIsInbox;
        public final String sectionId;
        public final boolean hasDescription;
        public final String description;
        final double order;

        Row(JSONObject t, String projectName) {
            id = t.optString("id");
            projectId = t.optString("projectId");
            content = t.optString("content");
            priority = t.optInt("priority", 1);
            JSONObject due = t.optJSONObject("due");
            dueDate = due != null ? due.optString("date", null) : null;
            dueDatetime = due != null && due.has("datetime") && !due.isNull("datetime") ? due.optString("datetime") : null;
            recurring = due != null && due.optBoolean("isRecurring");
            order = t.optDouble("order", 0);
            this.projectName = projectName;
            projectIsInbox = "inbox".equals(projectId) || projectId.startsWith("inbox_");
            sectionId = t.isNull("sectionId") ? null : t.optString("sectionId", null);
            description = t.optString("description", "");
            hasDescription = !description.trim().isEmpty();
        }
    }

    public static String viewTitle(JSONObject data, String view) {
        if (WidgetStore.VIEW_TODAY.equals(view)) return "Today";
        if (WidgetStore.VIEW_UPCOMING.equals(view)) return "Upcoming";
        if (WidgetStore.VIEW_INBOX.equals(view)) return "Inbox";
        if (view.startsWith(WidgetStore.PROJECT_PREFIX) && data != null) {
            JSONObject p = findProject(data, view.substring(WidgetStore.PROJECT_PREFIX.length()));
            if (p != null) return p.optString("name");
        }
        return "Today";
    }

    /** The project a view is scoped to (new tasks from the widget go here). */
    public static String viewProjectId(String view) {
        if (view.startsWith(WidgetStore.PROJECT_PREFIX)) return view.substring(WidgetStore.PROJECT_PREFIX.length());
        return "inbox";
    }

    static JSONObject findProject(JSONObject data, String id) {
        JSONArray projects = data.optJSONArray("projects");
        if (projects == null) return null;
        for (int i = 0; i < projects.length(); i++) {
            JSONObject p = projects.optJSONObject(i);
            if (p != null && id.equals(p.optString("id"))) return p;
        }
        return null;
    }

    public static List<Row> rowsForView(JSONObject data, String view) {
        List<Row> rows = new ArrayList<>();
        if (data == null) return rows;
        JSONArray tasks = data.optJSONArray("tasks");
        if (tasks == null) return rows;
        String today = todayStr();
        String weekAhead = addDaysStr(today, UPCOMING_DAYS - 1);
        boolean byDate = WidgetStore.VIEW_TODAY.equals(view) || WidgetStore.VIEW_UPCOMING.equals(view);
        String projectId = WidgetStore.VIEW_INBOX.equals(view) ? "inbox"
                : view.startsWith(WidgetStore.PROJECT_PREFIX) ? view.substring(WidgetStore.PROJECT_PREFIX.length()) : null;
        if (!byDate && projectId != null && findProject(data, projectId) == null) projectId = "inbox";

        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t == null || t.optBoolean("completed")) continue;
            JSONObject due = t.optJSONObject("due");
            String date = due != null ? due.optString("date", null) : null;
            boolean include;
            if (WidgetStore.VIEW_TODAY.equals(view)) {
                include = date != null && date.compareTo(today) <= 0;
            } else if (WidgetStore.VIEW_UPCOMING.equals(view)) {
                include = date != null && date.compareTo(weekAhead) <= 0;
            } else {
                include = projectId != null && projectId.equals(t.optString("projectId")) && t.isNull("parentId");
            }
            if (!include) continue;
            JSONObject project = byDate ? findProject(data, t.optString("projectId")) : null;
            String name = project != null ? project.optString("name") : null;
            if (byDate && name == null && t.optString("projectId").startsWith("inbox")) name = "Inbox";
            rows.add(new Row(t, name));
        }

        if (byDate) {
            Collections.sort(rows, (a, b) -> {
                int c = a.dueDate.compareTo(b.dueDate);
                if (c != 0) return c;
                String at = a.dueDatetime != null ? a.dueDatetime : "~";
                String bt = b.dueDatetime != null ? b.dueDatetime : "~";
                c = at.compareTo(bt);
                if (c != 0) return c;
                c = Integer.compare(b.priority, a.priority);
                return c != 0 ? c : Double.compare(a.order, b.order);
            });
        } else {
            Collections.sort(rows, (a, b) -> Double.compare(a.order, b.order));
        }
        return rows;
    }

    // ---- due labels (src/utils/date.ts: formatDueLabel, dueDateClass) ----

    public enum DueKind { OVERDUE, TODAY, TOMORROW, LATER }

    public static DueKind dueKind(String date) {
        String today = todayStr();
        int cmp = date.compareTo(today);
        if (cmp < 0) return DueKind.OVERDUE;
        if (cmp == 0) return DueKind.TODAY;
        if (date.equals(addDaysStr(today, 1))) return DueKind.TOMORROW;
        return DueKind.LATER;
    }

    /**
     * The date as a row shows it: Today, Yesterday, Tomorrow, otherwise
     * "27 Sep" (with the year if it's another year); plus the time if the
     * task has one.
     */
    public static String dueLabel(Row row) {
        if (row.dueDate == null) return null;
        String label;
        DueKind kind = dueKind(row.dueDate);
        String today = todayStr();
        Calendar c = calendarFor(row.dueDate);
        if (kind == DueKind.TODAY) label = "Today";
        else if (kind == DueKind.TOMORROW) label = "Tomorrow";
        else if (row.dueDate.equals(addDaysStr(today, -1))) label = "Yesterday";
        else if (c == null) label = row.dueDate;
        else {
            boolean thisYear = row.dueDate.substring(0, 4).equals(today.substring(0, 4));
            label = new SimpleDateFormat(thisYear ? "d MMM" : "d MMM yyyy", Locale.ENGLISH).format(c.getTime());
        }
        String time = dueTime(row);
        return time != null ? label + " " + time : label;
    }

    /** "09:00" if the task has a time, else null. */
    public static String dueTime(Row row) {
        if (row.dueDatetime == null) return null;
        Date dt = parseIso(row.dueDatetime);
        return dt != null ? new SimpleDateFormat("HH:mm", Locale.US).format(dt) : null;
    }

    /** "Wednesday, 23 Sep", with " · Today" / " · Tomorrow" when asked. */
    public static String dayHeading(String day, boolean relative) {
        Calendar c = calendarFor(day);
        String label = c != null ? new SimpleDateFormat("EEEE, d MMM", Locale.ENGLISH).format(c.getTime()) : day;
        if (!relative) return label;
        DueKind kind = dueKind(day);
        if (kind == DueKind.TODAY) return label + " \u00b7 Today";
        if (kind == DueKind.TOMORROW) return label + " \u00b7 Tomorrow";
        return label;
    }

    /**
     * "Reschedule": an overdue task moves to today, keeping its time of day
     * and its repeat. Returns true if it changed.
     */
    public static boolean moveToToday(JSONObject data, String taskId, String at) {
        try {
            JSONArray tasks = data.optJSONArray("tasks");
            if (tasks == null || taskId == null) return false;
            JSONObject task = findTask(tasks, taskId);
            if (task == null || task.optBoolean("completed")) return false;
            JSONObject due = task.optJSONObject("due");
            if (!dueToToday(due)) return false;
            task.put("updatedAt", at);
            return true;
        } catch (JSONException e) {
            return false;
        }
    }

    /** Moves an overdue `due` to today in place; false if it isn't overdue. */
    static boolean dueToToday(JSONObject due) throws JSONException {
        if (due == null) return false;
        String date = due.optString("date", null);
        String today = todayStr();
        if (date == null || date.compareTo(today) >= 0) return false;
        int shift = daysBetween(date, today);
        due.put("date", today);
        Calendar day = calendarFor(today);
        String label = day != null ? new SimpleDateFormat("MMM d, yyyy", Locale.ENGLISH).format(day.getTime()) : today;
        if (due.has("datetime") && !due.isNull("datetime")) {
            Date dt = parseIso(due.optString("datetime"));
            if (dt != null) {
                Calendar c = Calendar.getInstance();
                c.setTime(dt);
                c.add(Calendar.DAY_OF_MONTH, shift);
                due.put("datetime", isoFormat().format(c.getTime()));
                label += " at " + new SimpleDateFormat("HH:mm", Locale.US).format(c.getTime());
            }
        }
        // A repeating task keeps its own wording ("every monday"); others get the new date.
        if (!due.optBoolean("isRecurring")) due.put("string", label);
        return true;
    }

    // ---- new tasks (src/api/hooks.ts: useCreateTask) ----

    private static final String ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    private static final java.security.SecureRandom RANDOM = new java.security.SecureRandom();

    /** An id like the app's (nanoid: 21 URL-safe characters). */
    public static String newId() {
        StringBuilder b = new StringBuilder(21);
        for (int i = 0; i < 21; i++) b.append(ID_CHARS.charAt(RANDOM.nextInt(ID_CHARS.length())));
        return b.toString();
    }

    /** A task as the app makes one; `due` may be null. */
    static JSONObject newTask(String id, String content, String projectId, int priority, JSONObject due, long order, String at)
            throws JSONException {
        return new JSONObject()
                .put("id", id)
                .put("content", content)
                .put("description", "")
                .put("projectId", projectId)
                .put("sectionId", JSONObject.NULL)
                .put("parentId", JSONObject.NULL)
                .put("order", order)
                .put("priority", priority)
                .put("due", due != null ? due : JSONObject.NULL)
                .put("labels", new JSONArray())
                .put("completed", false)
                .put("completedAt", JSONObject.NULL)
                .put("createdAt", at)
                .put("updatedAt", at);
    }

    /** The next order at the end of a project's loose tasks. */
    static long nextOrder(JSONObject data, String projectId) {
        return nextOrder(data, projectId, null);
    }

    /** The next order at the end of a section (or, with null, the project's loose tasks). */
    static long nextOrder(JSONObject data, String projectId, String sectionId) {
        double max = -1;
        JSONArray tasks = data != null ? data.optJSONArray("tasks") : null;
        if (tasks != null) {
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject t = tasks.optJSONObject(i);
                boolean sameSection = sectionId == null ? t != null && t.isNull("sectionId")
                        : t != null && sectionId.equals(t.optString("sectionId"));
                if (t != null && projectId.equals(t.optString("projectId")) && sameSection && t.isNull("parentId")) {
                    max = Math.max(max, t.optDouble("order", 0));
                }
            }
        }
        return (long) Math.floor(max) + 1;
    }

    /** A due date (and time, "HH:mm", or null) as the app stores it. */
    static JSONObject makeDue(String day, String time) throws JSONException {
        Calendar c = calendarFor(day);
        String label = c != null ? new SimpleDateFormat("MMM d, yyyy", Locale.ENGLISH).format(c.getTime()) : day;
        JSONObject due = new JSONObject().put("date", day).put("isRecurring", false);
        if (time != null && c != null) {
            String[] hm = time.split(":");
            c.set(Calendar.HOUR_OF_DAY, Integer.parseInt(hm[0]));
            c.set(Calendar.MINUTE, Integer.parseInt(hm[1]));
            due.put("datetime", isoFormat().format(c.getTime()));
            label += " at " + time;
        }
        return due.put("string", label);
    }
}
