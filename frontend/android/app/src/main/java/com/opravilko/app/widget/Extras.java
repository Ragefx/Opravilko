package com.opravilko.app.widget;

import android.app.Activity;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * Repeat and reminders for the widget's add card and task card, the same
 * choices as the app's (frontend/src/utils/recurrence.ts REPEAT_PRESETS and
 * utils/reminders.ts), stored the same way.
 */
final class Extras {
    private Extras() {}

    interface OnReminders {
        void set(JSONArray reminders);
    }

    // ---- repeat ----

    static final String[] REPEAT_KEYS = { "daily", "weekdays", "weekly", "biweekly", "monthly", "monthly_last", "yearly" };

    static String repeatLabel(String key) {
        switch (key) {
            case "daily": return L.t("Every day", "Vsak dan");
            case "weekdays": return L.t("Every weekday", "Vsak delavnik");
            case "weekly": return L.t("Every week", "Vsak teden");
            case "biweekly": return L.t("Every 2 weeks", "Vsaka 2 tedna");
            case "monthly": return L.t("Every month", "Vsak mesec");
            case "monthly_last": return L.t("Every month, last day", "Vsak mesec, zadnji dan");
            case "yearly": return L.t("Every year", "Vsako leto");
            default: return L.t("Repeats", "Ponavlja se");
        }
    }

    private static final String[] EN_DAYS = { "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" };
    private static final String[] SL_DAYS = { "nedelja", "ponedeljek", "torek", "sreda", "četrtek", "petek", "sobota" };
    private static final String[] SL_EVERY_DAY = { "Vsako nedeljo", "Vsak ponedeljek", "Vsak torek", "Vsako sredo", "Vsak četrtek", "Vsak petek", "Vsako soboto" };

    private static String ordinal(int n) {
        if (L.sl()) return n + ".";
        String s = n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 == 1 ? "st" : n % 10 == 2 ? "nd" : n % 10 == 3 ? "rd" : "th";
        return n + s;
    }

    /**
     * A due date that repeats by the preset, from the day it's on (today, or
     * the next weekday for "every weekday", when it has none), keeping its time.
     */
    static JSONObject withRepeat(JSONObject due, String key) throws JSONException {
        String day = due != null ? due.optString("date", null) : null;
        if (day == null) {
            day = TaskLogic.todayStr();
            if ("weekdays".equals(key)) {
                Calendar w = TaskLogic.calendarFor(day);
                while (w.get(Calendar.DAY_OF_WEEK) == Calendar.SATURDAY || w.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY)
                    w.add(Calendar.DAY_OF_MONTH, 1);
                day = String.format(Locale.US, "%04d-%02d-%02d", w.get(Calendar.YEAR), w.get(Calendar.MONTH) + 1, w.get(Calendar.DAY_OF_MONTH));
            }
        }
        Calendar c = TaskLogic.calendarFor(day);
        int dow = c.get(Calendar.DAY_OF_WEEK) - 1; // 0 = Sunday, as in the app
        JSONObject rule = new JSONObject();
        String label;
        switch (key) {
            case "weekly":
            case "biweekly": {
                boolean two = "biweekly".equals(key);
                rule.put("freq", "weekly");
                if (two) rule.put("interval", 2);
                rule.put("byDay", new JSONArray().put(dow));
                label = two ? L.t("Every 2 weeks on " + EN_DAYS[dow], "Vsakih 2 tednov, " + SL_DAYS[dow])
                        : L.t("Every " + EN_DAYS[dow], SL_EVERY_DAY[dow]);
                break;
            }
            case "monthly": {
                int d = c.get(Calendar.DAY_OF_MONTH);
                rule.put("freq", "monthly").put("byMonthDay", d);
                label = L.t("Every month on the " + ordinal(d), "Vsak mesec, " + ordinal(d));
                break;
            }
            case "monthly_last":
                rule.put("freq", "monthly").put("byMonthDay", -1);
                c.set(Calendar.DAY_OF_MONTH, c.getActualMaximum(Calendar.DAY_OF_MONTH));
                day = String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
                label = L.t("Every month on the last day", "Vsak mesec, zadnji dan");
                break;
            default:
                rule.put("freq", key);
                label = repeatLabel(key);
        }
        JSONObject out = new JSONObject().put("date", day).put("string", label).put("isRecurring", true).put("rrule", rule.toString());
        if (due != null && due.has("datetime") && !due.isNull("datetime")) {
            // The time of day stays; on a moved day (last of the month) it moves along.
            java.util.Date at = TaskLogic.parseIso(due.optString("datetime"));
            if (at != null) {
                String time = new java.text.SimpleDateFormat("HH:mm", Locale.US).format(at);
                out.put("datetime", TaskLogic.makeDue(day, time).optString("datetime"));
            }
        }
        return out;
    }

    // ---- reminders ----

    private static boolean timed(JSONObject due) {
        return due != null && due.has("datetime") && !due.isNull("datetime");
    }

    private static String leadText(int minutes) {
        if (minutes == 0) return L.t("At the due time", "Ob času naloge");
        if (minutes % 1440 == 0) {
            int d = minutes / 1440;
            return L.t(d == 1 ? "1 day before" : d + " days before", d == 1 ? "1 dan prej" : d + " dni prej");
        }
        if (minutes % 60 == 0) return L.t(minutes / 60 + " h before", minutes / 60 + " h prej");
        return L.t(minutes + " min before", minutes + " min prej");
    }

    /** "15 min before", "Day before at 18:00", "Fri 3 Oct, 14:30" (as the app words them). */
    static String describe(JSONObject r) {
        String type = r.optString("type");
        if ("relative".equals(type)) return leadText(r.optInt("minutes"));
        if ("day".equals(type)) {
            int days = r.optInt("days");
            String time = r.optString("time");
            if (days == 0) return L.t("On the day at " + time, "Na dan ob " + time);
            if (days == 1) return L.t("Day before at " + time, "Dan prej ob " + time);
            return L.t(days + " days before at " + time, days + " dni prej ob " + time);
        }
        java.util.Date at = TaskLogic.parseIso(r.optString("at"));
        return at != null ? L.date("EEE d MMM, HH:mm", "EEE, d. MMM, HH:mm", at) : L.t("Reminder", "Opomnik");
    }

    /** Short, for a token: "15m before", "9:00", "Day before 18:00". */
    static String shortText(JSONArray list) {
        if (list == null || list.length() == 0) return "";
        JSONObject r = list.optJSONObject(0);
        String s;
        String type = r.optString("type");
        if ("relative".equals(type)) {
            int m = r.optInt("minutes");
            s = m == 0 ? L.t("At time", "Ob času")
                    : m % 1440 == 0 ? L.t(m / 1440 + "d before", m / 1440 + " d prej")
                    : m % 60 == 0 ? L.t(m / 60 + "h before", m / 60 + " h prej")
                    : L.t(m + "m before", m + " min prej");
        } else if ("day".equals(type)) {
            int d = r.optInt("days");
            String t = r.optString("time");
            s = d == 0 ? t : d == 1 ? L.t("Day before " + t, "Dan prej " + t) : L.t(d + "d before " + t, d + " d prej " + t);
        } else {
            java.util.Date at = TaskLogic.parseIso(r.optString("at"));
            s = at != null ? L.date("d MMM HH:mm", "d. MMM HH:mm", at) : L.t("Reminder", "Opomnik");
        }
        return list.length() > 1 ? s + " +" + (list.length() - 1) : s;
    }

    /** The quick ones for a due date: before its time, or on / the day before an all-day one. */
    private static List<JSONObject> presets(JSONObject due) throws JSONException {
        List<JSONObject> out = new ArrayList<>();
        if (due == null || due.optString("date", "").isEmpty()) return out;
        if (timed(due)) {
            for (int m : new int[] { 0, 15, 30, 60, 120, 1440 }) out.add(new JSONObject().put("type", "relative").put("minutes", m));
        } else {
            out.add(new JSONObject().put("type", "day").put("days", 0).put("time", "09:00"));
            out.add(new JSONObject().put("type", "day").put("days", 0).put("time", "18:00"));
            out.add(new JSONObject().put("type", "day").put("days", 1).put("time", "09:00"));
            out.add(new JSONObject().put("type", "day").put("days", 1).put("time", "18:00"));
        }
        return out;
    }

    private static boolean same(JSONObject a, JSONObject b) {
        String t = a.optString("type");
        if (!t.equals(b.optString("type"))) return false;
        if ("relative".equals(t)) return a.optInt("minutes") == b.optInt("minutes");
        if ("day".equals(t)) return a.optInt("days") == b.optInt("days") && a.optString("time").equals(b.optString("time"));
        return a.optString("at").equals(b.optString("at"));
    }

    private static String newId() {
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
        java.util.Random r = new java.security.SecureRandom();
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 8; i++) b.append(chars.charAt(r.nextInt(chars.length())));
        return b.toString();
    }

    private static JSONObject made(JSONObject spec, String me) throws JSONException {
        JSONObject r = new JSONObject(spec.toString()).put("id", newId());
        if (me != null && !me.isEmpty()) r.put("by", me);
        return r;
    }

    /** This phone's default reminder for a new task (Settings > Reminders in the app), or none. */
    static JSONArray defaults(JSONObject data, JSONObject due) {
        JSONArray out = new JSONArray();
        JSONObject d = data != null ? data.optJSONObject("reminderDefaults") : null;
        if (d == null || due == null || due.optString("date", "").isEmpty()) return out;
        String key = d.optString(timed(due) ? "timed" : "allDay", "none");
        try {
            JSONObject spec = null;
            java.util.regex.Matcher rel = java.util.regex.Pattern.compile("^rel:(\\d+)$").matcher(key);
            java.util.regex.Matcher day = java.util.regex.Pattern.compile("^day:(\\d+):(\\d\\d:\\d\\d)$").matcher(key);
            if (rel.matches()) spec = new JSONObject().put("type", "relative").put("minutes", Integer.parseInt(rel.group(1)));
            else if (day.matches()) spec = new JSONObject().put("type", "day").put("days", Integer.parseInt(day.group(1))).put("time", day.group(2));
            if (spec != null) out.put(made(spec, data.optString("me", null)));
        } catch (JSONException ignored) {
            // none
        }
        return out;
    }

    /**
     * The reminders window, as in the app: the ones set (tap one to remove
     * it), quick ones for the date, and a day and time of your own. Picking
     * one adds it and closes.
     */
    static void pick(Activity activity, JSONObject due, JSONArray current, String me, OnReminders done) {
        JSONArray set = current != null ? current : new JSONArray();
        List<String> rows = new ArrayList<>();
        List<Runnable> actions = new ArrayList<>();
        for (int i = 0; i < set.length(); i++) {
            JSONObject r = set.optJSONObject(i);
            if (r == null) continue;
            final int at = i;
            rows.add("\uD83D\uDD14 " + describe(r) + "   \u2715");
            actions.add(() -> {
                JSONArray next = new JSONArray();
                for (int k = 0; k < set.length(); k++) if (k != at) next.put(set.opt(k));
                done.set(next);
            });
        }
        try {
            for (JSONObject p : presets(due)) {
                boolean have = false;
                for (int i = 0; i < set.length(); i++) if (set.optJSONObject(i) != null && same(set.optJSONObject(i), p)) have = true;
                if (have) continue;
                rows.add("+ " + describe(p));
                actions.add(() -> add(set, p, me, done));
            }
        } catch (JSONException ignored) {
            // no quick ones
        }
        rows.add("\uD83D\uDD52 " + L.t("Pick a day and time…", "Izberi dan in uro …"));
        actions.add(() -> pickMoment(activity, due, set, me, done));
        new androidx.appcompat.app.AlertDialog.Builder(activity)
                .setTitle(L.t("Reminders", "Opomniki"))
                .setItems(rows.toArray(new String[0]), (d, which) -> actions.get(which).run())
                .setNegativeButton(L.t("Done", "Končano"), null)
                .show();
    }

    private static void add(JSONArray set, JSONObject spec, String me, OnReminders done) {
        try {
            JSONArray next = new JSONArray(set.toString());
            next.put(made(spec, me));
            done.set(next);
        } catch (JSONException ignored) {
            // left as it was
        }
    }

    private static void pickMoment(Activity activity, JSONObject due, JSONArray set, String me, OnReminders done) {
        String day = due != null ? due.optString("date", null) : null;
        Calendar c = day != null ? TaskLogic.calendarFor(day) : null;
        if (c == null) c = Calendar.getInstance();
        new DatePickerDialog(activity, (v, y, mo, d) -> new TimePickerDialog(activity, (tp, h, m) -> {
            Calendar at = Calendar.getInstance();
            at.set(y, mo, d, h, m, 0);
            at.set(Calendar.MILLISECOND, 0);
            java.text.SimpleDateFormat iso = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            iso.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            try {
                add(set, new JSONObject().put("type", "absolute").put("at", iso.format(at.getTime())), me, done);
            } catch (JSONException ignored) {
                // left as it was
            }
        }, 9, 0, true).show(), c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show();
    }
}
