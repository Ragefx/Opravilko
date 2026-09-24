package com.opravilko.app.widget;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Task reminders worked out from the widget's copy of the tasks (the same
 * rules as frontend/src/utils/reminders.ts). Plain Java, so it's testable
 * off the phone.
 */
final class ReminderLogic {
    private ReminderLogic() {}

    /** One reminder to schedule. */
    static final class Upcoming {
        final String taskId;
        final String reminderId;
        final long at;

        Upcoming(String taskId, String reminderId, long at) {
            this.taskId = taskId;
            this.reminderId = reminderId;
            this.at = at;
        }

        /** Stable alarm request code for this reminder at this time. */
        int code() {
            return (taskId + "|" + reminderId + "|" + at).hashCode() & 0x7fffffff;
        }
    }

    /** A task's reminders, including the older single `reminderMinutes` one. */
    static JSONArray remindersOf(JSONObject task) {
        JSONArray list = task.optJSONArray("reminders");
        if (list != null) return list;
        JSONArray out = new JSONArray();
        JSONObject due = task.optJSONObject("due");
        if (task.has("reminderMinutes") && !task.isNull("reminderMinutes") && due != null && hasDatetime(due)) {
            try {
                out.put(new JSONObject().put("id", "legacy").put("type", "relative")
                        .put("minutes", task.optInt("reminderMinutes")));
            } catch (Exception ignored) {
                // never happens
            }
        }
        return out;
    }

    static boolean hasDatetime(JSONObject due) {
        return due.has("datetime") && !due.isNull("datetime") && !due.optString("datetime").isEmpty();
    }

    static Date parseIso(String iso) {
        Date d = TaskLogic.parseIso(iso);
        if (d != null || iso == null) return d;
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US);
            return f.parse(iso);
        } catch (Exception e) {
            return null;
        }
    }

    /** When the reminder goes off for the task's current due date (ms), or -1 if it can't. */
    static long timeOf(JSONObject task, JSONObject r) {
        JSONObject due = task.optJSONObject("due");
        String type = r.optString("type");
        if ("absolute".equals(type)) {
            Date d = parseIso(r.optString("at", null));
            return d != null ? d.getTime() : -1;
        }
        if ("relative".equals(type)) {
            if (due == null || !hasDatetime(due)) return -1;
            Date d = parseIso(due.optString("datetime"));
            return d != null ? d.getTime() - r.optLong("minutes") * 60_000L : -1;
        }
        if ("day".equals(type)) {
            if (due == null) return -1;
            Calendar c = TaskLogic.calendarFor(due.optString("date", null));
            if (c == null) return -1;
            String[] hm = r.optString("time", "09:00").split(":");
            int h, m;
            try {
                h = Integer.parseInt(hm[0]);
                m = hm.length > 1 ? Integer.parseInt(hm[1]) : 0;
            } catch (NumberFormatException e) {
                return -1;
            }
            c.add(Calendar.DAY_OF_MONTH, -r.optInt("days"));
            c.set(Calendar.HOUR_OF_DAY, h);
            c.set(Calendar.MINUTE, m);
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            return c.getTimeInMillis();
        }
        return -1;
    }

    /** Mine to be notified about: set by me, or with no owner (Dropbox, older ones). */
    static boolean isMine(JSONObject r, String me) {
        String by = r.optString("by", "");
        return by.isEmpty() || me == null || me.isEmpty() || by.equals(me);
    }

    /** Open tasks' reminders of mine still to go off within `horizonMs`, soonest first, at most `max`. */
    static List<Upcoming> upcoming(JSONObject data, String me, long now, long horizonMs, int max) {
        List<Upcoming> out = new ArrayList<>();
        JSONArray tasks = data != null ? data.optJSONArray("tasks") : null;
        if (tasks == null) return out;
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t == null || t.optBoolean("completed") || t.optBoolean("archived")) continue;
            JSONArray rs = remindersOf(t);
            for (int k = 0; k < rs.length(); k++) {
                JSONObject r = rs.optJSONObject(k);
                if (r == null || !isMine(r, me)) continue;
                long at = timeOf(t, r);
                if (at > now && at - now <= horizonMs) out.add(new Upcoming(t.optString("id"), r.optString("id"), at));
            }
        }
        Collections.sort(out, (a, b) -> Long.compare(a.at, b.at));
        return out.size() > max ? new ArrayList<>(out.subList(0, max)) : out;
    }

    /** Does this reminder still go off at `at` (±1 min)? False once removed, moved or ticked off. */
    static boolean stillDue(JSONObject task, String reminderId, long at) {
        if (task == null || task.optBoolean("completed")) return false;
        JSONArray rs = remindersOf(task);
        for (int k = 0; k < rs.length(); k++) {
            JSONObject r = rs.optJSONObject(k);
            if (r != null && reminderId.equals(r.optString("id"))) {
                long t = timeOf(task, r);
                return t > 0 && Math.abs(t - at) < 60_000L;
            }
        }
        return false;
    }

    /** The notification's second line: "Due 14:30", "Due today", "Due tomorrow at 9:00", "Due Fri 3 Oct". */
    static String dueText(JSONObject task, long now) {
        JSONObject due = task.optJSONObject("due");
        if (due == null) return "Reminder";
        String today = TaskLogic.dayFormat().format(new Date(now));
        String tomorrow = TaskLogic.addDaysStr(today, 1);
        if (hasDatetime(due)) {
            Date d = parseIso(due.optString("datetime"));
            if (d != null) {
                String time = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(d);
                String day = TaskLogic.dayFormat().format(d);
                if (day.equals(today)) return "Due " + time;
                if (day.equals(tomorrow)) return "Due tomorrow at " + time;
                return "Due " + new SimpleDateFormat("EEE d MMM", Locale.getDefault()).format(d) + " at " + time;
            }
        }
        String date = due.optString("date", "");
        if (date.equals(today)) return "Due today";
        if (date.equals(tomorrow)) return "Due tomorrow";
        Calendar c = TaskLogic.calendarFor(date);
        if (c == null) return "Reminder";
        if (date.compareTo(today) < 0) return "Overdue since " + new SimpleDateFormat("EEE d MMM", Locale.getDefault()).format(c.getTime());
        return "Due " + new SimpleDateFormat("EEE d MMM", Locale.getDefault()).format(c.getTime());
    }
}
