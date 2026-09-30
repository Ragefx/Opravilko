package com.opravilko.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.RemoteViews;

import com.opravilko.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The widget's two calendar views:
 * - Month: a grid like the website's calendar, each day with its trip band,
 *   holiday and tasks (blue chips, by their first word or two).
 * - Month + tasks: a small month (dots for tasks, a band for trips) with the
 *   chosen day's and the next days' tasks under it, to tick off.
 * ‹ › change the month, and tapping its name comes back to this one; repeating tasks show on each of
 * their days, trips and the Slovenian holidays as in the app.
 */
final class CalendarWidget {
    static final String ACTION_MONTH = "com.opravilko.app.widget.CAL_MONTH";
    static final String ACTION_SELECT = "com.opravilko.app.widget.CAL_SELECT";
    static final String EXTRA_DELTA = "com.opravilko.app.widget.CAL_DELTA";
    static final String EXTRA_DAY = "com.opravilko.app.widget.CAL_DAY";

    private static final int HEADER_DP = 52 + 42 + 20 + 10;
    private static final int DAY_NUMBER_DP = 17;
    private static final int CHIP_DP = 16;

    private CalendarWidget() {}

    /** What a month shows, worked out once for either view. */
    private static final class Month {
        Calendar month;
        Calendar first;
        int weeks;
        String today;
        Map<String, List<Item>> byDay;
        List<Trip> trips;
        Map<String, Holidays.Holiday> holidays;
        /** What got done each day up to today (Settings > Appearance), newest first. */
        Map<String, List<Done>> done;

        Month(Context context, int appWidgetId, JSONObject data) {
            WidgetStore store = new WidgetStore(context);
            month = Calendar.getInstance();
            month.set(Calendar.DAY_OF_MONTH, 1);
            month.add(Calendar.MONTH, store.getCalendarMonth(appWidgetId));
            // From the Monday on or before the 1st, whole weeks to the last day.
            first = (Calendar) month.clone();
            first.add(Calendar.DAY_OF_MONTH, -((first.get(Calendar.DAY_OF_WEEK) + 5) % 7));
            Calendar last = (Calendar) month.clone();
            last.set(Calendar.DAY_OF_MONTH, last.getActualMaximum(Calendar.DAY_OF_MONTH));
            last.add(Calendar.DAY_OF_MONTH, (7 - ((last.get(Calendar.DAY_OF_WEEK) + 5) % 7) - 1) % 7);
            SimpleDateFormat day = TaskLogic.dayFormat();
            String from = day.format(first.getTime());
            String to = day.format(last.getTime());
            weeks = (TaskLogic.daysBetween(from, to) + 1) / 7;
            today = TaskLogic.todayStr();
            // The list under the small month can reach past the month's end.
            // (and back far enough to catch what's overdue, listed under today).
            String back = TaskLogic.addDaysStr(today, -90);
            byDay = itemsByDay(data, back.compareTo(from) < 0 ? back : from, TaskLogic.addDaysStr(to, 31));
            trips = trips(data);
            holidays = new HashMap<>();
            if (data != null && data.optBoolean("holidays", true)) {
                int y = month.get(Calendar.YEAR);
                for (int year = y - 1; year <= y + 1; year++) {
                    for (Holidays.Holiday h : Holidays.of(year)) holidays.put(h.date, h);
                }
            }
            done = data != null && data.optBoolean("calendarDone", true) ? doneByDay(data, today) : new HashMap<>();
        }

        List<Done> doneOn(String key) {
            List<Done> list = done.get(key);
            return list != null ? list : new ArrayList<>();
        }

        boolean inMonth(Calendar c) {
            return c.get(Calendar.MONTH) == month.get(Calendar.MONTH);
        }

        /** The trips covering a day (yours first), or none. */
        List<Trip> tripsOn(String key) {
            List<Trip> on = new ArrayList<>();
            for (Trip t : trips) if (t.start.compareTo(key) <= 0 && key.compareTo(t.end) <= 0) on.add(t);
            on.sort((a, b) -> Boolean.compare(a.partnerLook(), b.partnerLook()));
            return on;
        }
    }

    static RemoteViews build(Context context, int appWidgetId, JSONObject data, boolean withTasks) {
        Month m = new Month(context, appWidgetId, data);
        RemoteViews views = new RemoteViews(context.getPackageName(),
                withTasks ? R.layout.widget_cal_agenda : R.layout.widget_calendar);
        views.setTextViewText(R.id.cal_month, new SimpleDateFormat("LLLL yyyy", Locale.ENGLISH).format(m.month.getTime()));
        views.setOnClickPendingIntent(R.id.cal_prev, monthIntent(context, appWidgetId, -1));
        views.setOnClickPendingIntent(R.id.cal_next, monthIntent(context, appWidgetId, 1));
        // Tapping the month's name brings back this month; away from it, the name shows in the accent colour.
        views.setOnClickPendingIntent(R.id.cal_month, monthIntent(context, appWidgetId, 0));
        boolean elsewhere = new WidgetStore(context).getCalendarMonth(appWidgetId) != 0;
        views.setTextColor(R.id.cal_month, context.getColor(elsewhere ? R.color.widget_accent : R.color.widget_text));
        if (withTasks) buildSmallMonth(context, appWidgetId, views, m);
        else buildGrid(context, appWidgetId, views, m);
        return views;
    }

    // ---- the month grid ----

    private static void buildGrid(Context context, int appWidgetId, RemoteViews views, Month m) {
        int perDay = chipsThatFit(context, appWidgetId, m.weeks);
        SimpleDateFormat day = TaskLogic.dayFormat();
        // Android redraws onto the widget as it is, so an update's weeks would be
        // added under the last month's: clear them first.
        views.removeAllViews(R.id.cal_grid);
        Calendar c = (Calendar) m.first.clone();
        for (int w = 0; w < m.weeks; w++) {
            RemoteViews week = new RemoteViews(context.getPackageName(), R.layout.widget_cal_week);
            for (int d = 0; d < 7; d++) {
                String key = day.format(c.getTime());
                RemoteViews cell = new RemoteViews(context.getPackageName(), R.layout.widget_cal_day);
                cell.setTextViewText(R.id.cal_day_num, String.valueOf(c.get(Calendar.DAY_OF_MONTH)));
                boolean isToday = key.equals(m.today);
                List<Trip> away = m.tripsOn(key);
                if (isToday) {
                    cell.setInt(R.id.cal_day, "setBackgroundResource", R.drawable.widget_cal_today_flat);
                    cell.setInt(R.id.cal_day_num, "setBackgroundResource", R.drawable.widget_cal_today_bg);
                    cell.setTextColor(R.id.cal_day_num, context.getColor(R.color.widget_on_accent));
                } else if (!m.inMonth(c)) {
                    cell.setInt(R.id.cal_day, "setBackgroundResource", R.drawable.widget_cal_out_flat);
                }
                if (!m.inMonth(c) && !isToday) cell.setTextColor(R.id.cal_day_num, context.getColor(R.color.widget_text_muted));

                int room = perDay;
                // The trip band: its name on the first day and each Monday, blank between.
                if (!away.isEmpty()) {
                    Trip trip = away.get(0);
                    RemoteViews band = new RemoteViews(context.getPackageName(), R.layout.widget_cal_trip);
                    band.setTextViewText(R.id.cal_trip, key.equals(trip.start) || d == 0 ? trip.label() : " ");
                    if (trip.off) {
                        band.setInt(R.id.cal_trip, "setBackgroundResource", R.drawable.widget_cal_band_off_bg);
                        band.setTextColor(R.id.cal_trip, context.getColor(R.color.widget_cal_off_text));
                    } else if (trip.partnerLook()) {
                        band.setInt(R.id.cal_trip, "setBackgroundResource", R.drawable.widget_cal_band_partner_bg);
                        band.setTextColor(R.id.cal_trip, context.getColor(R.color.widget_cal_away_partner_text));
                    }
                    cell.addView(R.id.cal_day_items, band);
                    room = Math.max(1, room - 1);
                }
                Holidays.Holiday holiday = m.holidays.get(key);
                if (holiday != null) {
                    RemoteViews label = new RemoteViews(context.getPackageName(), R.layout.widget_cal_holiday);
                    label.setTextViewText(R.id.cal_holiday, holiday.name);
                    if (!holiday.free) label.setInt(R.id.cal_holiday, "setBackgroundResource", R.drawable.widget_cal_hol_bg);
                    cell.addView(R.id.cal_day_items, label);
                    room = Math.max(1, room - 1);
                    if (holiday.free && !isToday) cell.setTextColor(R.id.cal_day_num, context.getColor(R.color.widget_due_overdue));
                }
                List<Item> items = m.byDay.get(key);
                if (items != null) {
                    int shown = items.size() > room ? Math.max(0, room - 1) : items.size();
                    for (int i = 0; i < shown; i++) {
                        Item item = items.get(i);
                        RemoteViews chip = new RemoteViews(context.getPackageName(), R.layout.widget_cal_chip);
                        chip.setTextViewText(R.id.cal_chip, item.label);
                        if (item.event) {
                            chip.setInt(R.id.cal_chip, "setBackgroundResource", R.drawable.widget_cal_event_bg);
                            chip.setTextColor(R.id.cal_chip, context.getColor(R.color.widget_event_text));
                            if (item.past) chip.setFloat(R.id.cal_chip, "setAlpha", 0.5f);
                        } else if (item.overdue) {
                            chip.setInt(R.id.cal_chip, "setBackgroundResource", R.drawable.widget_cal_chip_overdue_bg);
                            chip.setTextColor(R.id.cal_chip, context.getColor(R.color.widget_cal_chip_overdue_text));
                        }
                        chip.setOnClickPendingIntent(R.id.cal_chip, openTask(context, appWidgetId, item.taskId));
                        cell.addView(R.id.cal_day_items, chip);
                    }
                    if (shown < items.size()) {
                        RemoteViews more = new RemoteViews(context.getPackageName(), R.layout.widget_cal_more);
                        more.setTextViewText(R.id.cal_more, "+" + (items.size() - shown));
                        cell.addView(R.id.cal_day_items, more);
                    }
                    room -= items.size() > room ? room : items.size();
                }
                // What got done that day, greyed with a tick, in the room that's left.
                List<Done> done = m.doneOn(key);
                if (!done.isEmpty() && room > 0) {
                    int shown = done.size() > room ? Math.max(0, room - 1) : done.size();
                    for (int i = 0; i < shown; i++) {
                        Done item = done.get(i);
                        RemoteViews chip = new RemoteViews(context.getPackageName(), R.layout.widget_cal_done);
                        chip.setTextViewText(R.id.cal_done, "✓ " + item.label);
                        chip.setOnClickPendingIntent(R.id.cal_done, openTask(context, appWidgetId, item.taskId));
                        cell.addView(R.id.cal_day_items, chip);
                    }
                    if (shown < done.size()) {
                        RemoteViews more = new RemoteViews(context.getPackageName(), R.layout.widget_cal_more);
                        more.setTextViewText(R.id.cal_more, "✓" + (done.size() - shown));
                        cell.addView(R.id.cal_day_items, more);
                    }
                }
                cell.setOnClickPendingIntent(R.id.cal_day, TaskWidgetProvider.openApp(context, appWidgetId * 64 + w * 7 + d,
                        "opravilko://open?view=calendar&day=" + key));
                week.addView(R.id.cal_week, cell);
                c.add(Calendar.DAY_OF_MONTH, 1);
            }
            views.addView(R.id.cal_grid, week);
        }
    }

    // ---- the small month with the tasks under it ----

    private static void buildSmallMonth(Context context, int appWidgetId, RemoteViews views, Month m) {
        // Days open the app now, so the list always starts from today.
        String selected = m.today;
        SimpleDateFormat day = TaskLogic.dayFormat();

        views.removeAllViews(R.id.ag_grid);
        Calendar c = (Calendar) m.first.clone();
        for (int w = 0; w < m.weeks; w++) {
            RemoteViews week = new RemoteViews(context.getPackageName(), R.layout.widget_ag_week);
            for (int d = 0; d < 7; d++) {
                String key = day.format(c.getTime());
                RemoteViews cell = new RemoteViews(context.getPackageName(), R.layout.widget_ag_day);
                cell.setTextViewText(R.id.ag_num, String.valueOf(c.get(Calendar.DAY_OF_MONTH)));
                Holidays.Holiday holiday = m.holidays.get(key);
                if (key.equals(m.today)) {
                    cell.setInt(R.id.ag_num, "setBackgroundResource", R.drawable.widget_cal_today_bg);
                    cell.setTextColor(R.id.ag_num, context.getColor(R.color.widget_on_accent));
                } else if (!m.inMonth(c)) {
                    cell.setTextColor(R.id.ag_num, context.getColor(R.color.widget_text_muted));
                } else if (holiday != null && holiday.free) {
                    cell.setTextColor(R.id.ag_num, context.getColor(R.color.widget_due_overdue));
                }
                if (key.equals(selected) && !key.equals(m.today)) {
                    cell.setInt(R.id.ag_num, "setBackgroundResource", R.drawable.widget_ag_selected_bg);
                }
                // A trip: a band across its days, rounded where it starts and ends (and at week ends).
                List<Trip> away = m.tripsOn(key);
                if (!away.isEmpty()) {
                    Trip t = away.get(0);
                    boolean starts = key.equals(t.start) || d == 0;
                    boolean ends = key.equals(t.end) || d == 6;
                    int[] set = t.off
                            ? new int[] {R.drawable.widget_ag_band_off, R.drawable.widget_ag_band_start_off, R.drawable.widget_ag_band_end_off, R.drawable.widget_ag_band_mid_off}
                            : t.partnerLook()
                            ? new int[] {R.drawable.widget_ag_band_partner, R.drawable.widget_ag_band_start_partner, R.drawable.widget_ag_band_end_partner, R.drawable.widget_ag_band_mid_partner}
                            : new int[] {R.drawable.widget_ag_band, R.drawable.widget_ag_band_start, R.drawable.widget_ag_band_end, R.drawable.widget_ag_band_mid};
                    int band = starts && ends ? set[0] : starts ? set[1] : ends ? set[2] : set[3];
                    cell.setInt(R.id.ag_day, "setBackgroundResource", band);
                }
                List<Item> items = m.byDay.get(key);
                int n = items != null ? Math.min(3, items.size()) : 0;
                cell.setTextViewText(R.id.ag_dots, n == 0 ? (m.doneOn(key).isEmpty() ? "" : "✓") : n == 1 ? "●" : n == 2 ? "● ●" : "● ● ●");
                // A tap opens the app's calendar on that day.
                cell.setOnClickPendingIntent(R.id.ag_day, TaskWidgetProvider.openApp(context, appWidgetId * 64 + w * 7 + d,
                        "opravilko://open?view=calendar&day=" + key));
                week.addView(R.id.ag_week, cell);
                c.add(Calendar.DAY_OF_MONTH, 1);
            }
            views.addView(R.id.ag_grid, week);
        }

        // Under it: the chosen day (today unless one was tapped), then the next days with tasks.
        views.removeAllViews(R.id.ag_list);
        int budget = listSpace(context, appWidgetId, m.weeks);
        String d = selected;
        for (int i = 0; i < 60 && budget > 0; i++, d = TaskLogic.addDaysStr(d, 1)) {
            List<Item> items = new ArrayList<>();
            if (m.byDay.get(d) != null) items.addAll(m.byDay.get(d));
            // Today also lists what's overdue.
            if (d.equals(m.today)) {
                for (Map.Entry<String, List<Item>> e : m.byDay.entrySet()) {
                    if (e.getKey().compareTo(m.today) < 0) {
                        for (Item it : e.getValue()) if (it.dueDate.equals(e.getKey()) && !it.event) items.add(0, it);
                    }
                }
            }
            Holidays.Holiday holiday = m.holidays.get(d);
            List<Trip> away = m.tripsOn(d);
            boolean startsTrip = false;
            for (Trip t : away) if (t.start.equals(d)) startsTrip = true;
            boolean first = d.equals(selected);
            List<Done> done = m.doneOn(d);
            if (!first && items.isEmpty() && holiday == null && !startsTrip && done.isEmpty()) continue;

            RemoteViews heading = new RemoteViews(context.getPackageName(), R.layout.widget_ag_heading);
            heading.setTextViewText(R.id.ag_heading, dayHeading(d, m.today));
            heading.setOnClickPendingIntent(R.id.ag_heading, TaskWidgetProvider.openApp(context, appWidgetId * 64 + 50 + i,
                    "opravilko://open?view=calendar&day=" + d));
            views.addView(R.id.ag_list, heading);
            budget -= 22;
            if (holiday != null && budget > 0) {
                RemoteViews note = new RemoteViews(context.getPackageName(), R.layout.widget_ag_note);
                note.setTextViewText(R.id.ag_note, holiday.name);
                if (holiday.free) note.setTextColor(R.id.ag_note, context.getColor(R.color.widget_due_overdue));
                views.addView(R.id.ag_list, note);
                budget -= 20;
            }
            for (Trip t : away) {
                if (!t.start.equals(d) && !(first && budget > 0)) continue;
                RemoteViews note = new RemoteViews(context.getPackageName(), R.layout.widget_ag_note);
                note.setTextViewText(R.id.ag_note, t.label() + (t.start.equals(t.end) ? "" : " · " + shortRange(t)));
                note.setTextColor(R.id.ag_note, context.getColor(t.off ? R.color.widget_cal_off_text
                        : t.partnerLook() ? R.color.widget_cal_away_partner_text : R.color.widget_cal_away_text));
                views.addView(R.id.ag_list, note);
                budget -= 20;
                break;
            }
            if (items.isEmpty() && first && done.isEmpty()) {
                RemoteViews note = new RemoteViews(context.getPackageName(), R.layout.widget_ag_note);
                note.setTextViewText(R.id.ag_note, "Nothing due");
                views.addView(R.id.ag_list, note);
                budget -= 20;
            }
            for (Item it : items) {
                if (budget < 26) break;
                RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_ag_row);
                row.setTextViewText(R.id.ag_title, it.content);
                row.setTextViewText(R.id.ag_time, it.time != null ? (it.endTime != null ? it.time + "–" + it.endTime : it.time)
                        : it.overdue ? shortDate(it.dueDate) : "");
                if (it.overdue) row.setTextColor(R.id.ag_time, context.getColor(R.color.widget_due_overdue));
                if (it.event) {
                    // Nothing to tick: the mark opens it; greyed once it's over.
                    row.setImageViewResource(R.id.ag_check, R.drawable.widget_event_mark);
                    row.setTextColor(R.id.ag_time, context.getColor(R.color.widget_event));
                    row.setOnClickPendingIntent(R.id.ag_check, openTask(context, appWidgetId, it.taskId));
                    if (it.past) row.setFloat(R.id.ag_row, "setAlpha", 0.5f);
                } else {
                    row.setImageViewResource(R.id.ag_check, checkFor(it.priority));
                    row.setOnClickPendingIntent(R.id.ag_check, completeTask(context, appWidgetId, it));
                }
                row.setOnClickPendingIntent(R.id.ag_row, openTask(context, appWidgetId, it.taskId));
                views.addView(R.id.ag_list, row);
                budget -= 26;
            }
            // Then what got done that day, greyed with a tick.
            for (Done it : done) {
                if (budget < 20) break;
                RemoteViews note = new RemoteViews(context.getPackageName(), R.layout.widget_ag_note);
                note.setTextViewText(R.id.ag_note, "✓ " + it.content + (it.time.isEmpty() ? "" : "  " + it.time));
                note.setOnClickPendingIntent(R.id.ag_note, openTask(context, appWidgetId, it.taskId));
                views.addView(R.id.ag_list, note);
                budget -= 20;
            }
        }
    }

    private static int checkFor(int priority) {
        switch (priority) {
            case 4: return R.drawable.widget_check_4;
            case 3: return R.drawable.widget_check_3;
            case 2: return R.drawable.widget_check_2;
            default: return R.drawable.widget_check_1;
        }
    }

    /** "Today · Thu 8 Oct", "Tomorrow · Fri 9 Oct", "Mon 12 Oct". */
    private static String dayHeading(String day, String today) {
        Calendar c = TaskLogic.calendarFor(day);
        String label = c != null ? new SimpleDateFormat("EEE d MMM", Locale.ENGLISH).format(c.getTime()) : day;
        if (day.equals(today)) return "Today · " + label;
        if (day.equals(TaskLogic.addDaysStr(today, 1))) return "Tomorrow · " + label;
        return label;
    }

    private static String shortDate(String day) {
        Calendar c = TaskLogic.calendarFor(day);
        return c != null ? new SimpleDateFormat("d MMM", Locale.ENGLISH).format(c.getTime()) : day;
    }

    private static String shortRange(Trip t) {
        return shortDate(t.start) + " – " + shortDate(t.end);
    }

    // ---- taps ----

    /** ‹ / › / Today tapped: move the month (0: back to this one, and today chosen), then redraw. */
    static void onMonth(Context context, Intent intent) {
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return;
        WidgetStore store = new WidgetStore(context);
        int delta = intent.getIntExtra(EXTRA_DELTA, 0);
        store.setCalendarMonth(id, delta == 0 ? 0 : store.getCalendarMonth(id) + delta);
        if (delta == 0) store.setCalendarDay(id, null);
        AppWidgetManager.getInstance(context).updateAppWidget(id, TaskWidgetProvider.buildViews(context, id));
    }

    /** A day tapped in the small month: its tasks in the list under it. */
    static void onSelect(Context context, Intent intent) {
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        String day = intent.getStringExtra(EXTRA_DAY);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID || day == null) return;
        new WidgetStore(context).setCalendarDay(id, day.equals(TaskLogic.todayStr()) ? null : day);
        AppWidgetManager.getInstance(context).updateAppWidget(id, TaskWidgetProvider.buildViews(context, id));
    }

    private static PendingIntent monthIntent(Context context, int appWidgetId, int delta) {
        Intent intent = new Intent(context, TaskWidgetProvider.class).setAction(ACTION_MONTH);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        intent.putExtra(EXTRA_DELTA, delta);
        intent.setData(Uri.parse("opravilko-widget://month/" + appWidgetId + "/" + delta));
        return PendingIntent.getBroadcast(context, appWidgetId * 8 + 6, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent openTask(Context context, int appWidgetId, String taskId) {
        Intent intent = new Intent(context, WidgetActionActivity.class);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        intent.putExtra(TaskWidgetProvider.EXTRA_ACTION, TaskWidgetProvider.ACTION_EDIT_TASK);
        intent.putExtra(TaskWidgetProvider.EXTRA_TASK_ID, taskId);
        intent.setData(Uri.parse("opravilko-widget://cal-task/" + appWidgetId + "/" + Uri.encode(taskId)));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, appWidgetId * 8 + 7, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent completeTask(Context context, int appWidgetId, Item item) {
        Intent intent = new Intent(context, WidgetActionActivity.class);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        intent.putExtra(TaskWidgetProvider.EXTRA_ACTION, TaskWidgetProvider.ACTION_COMPLETE);
        intent.putExtra(TaskWidgetProvider.EXTRA_TASK_ID, item.taskId);
        intent.putExtra(TaskWidgetProvider.EXTRA_DUE_DATE, item.dueDate);
        intent.setData(Uri.parse("opravilko-widget://cal-done/" + appWidgetId + "/" + Uri.encode(item.taskId)));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, appWidgetId * 8 + 7, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // ---- sizes ----

    private static int widgetHeight(Context context, int appWidgetId) {
        Bundle options = AppWidgetManager.getInstance(context).getAppWidgetOptions(appWidgetId);
        return options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) : 0;
    }

    /** How many lines fit in a day of the grid at the widget's current height. */
    private static int chipsThatFit(Context context, int appWidgetId, int weeks) {
        int height = widgetHeight(context, appWidgetId);
        if (height <= 0) return 2;
        int perWeek = (height - HEADER_DP) / Math.max(1, weeks);
        return Math.max(1, Math.min(5, (perWeek - DAY_NUMBER_DP) / CHIP_DP));
    }

    /** Room (dp) for the list under the small month. */
    private static int listSpace(Context context, int appWidgetId, int weeks) {
        int height = widgetHeight(context, appWidgetId);
        if (height <= 0) height = 420;
        return Math.max(60, height - 52 - 42 - 16 - weeks * 32 - 24);
    }

    // ---- data ----

    static final class Trip {
        final String start;
        final String end;
        final String title;
        final boolean car;
        /** Off work (🏖️) rather than travelling: sand-coloured. */
        final boolean off;
        /** Both of you (either can have added it): in your colour, not the partner's. */
        final boolean together;
        final boolean mine;

        Trip(JSONObject period, String title, boolean mine) {
            this.start = period.optString("start");
            this.end = period.optString("end", start);
            this.title = title;
            this.car = "car".equals(period.optString("by"));
            this.off = "off".equals(period.optString("by"));
            this.together = period.optBoolean("together");
            this.mine = mine;
        }

        boolean partnerLook() {
            return !mine && !together;
        }

        String label() {
            return (off ? "\uD83C\uDFD6\uFE0F " : car ? "\uD83D\uDE97 " : "\u2708\uFE0F ") + title;
        }
    }

    static List<Trip> trips(JSONObject data) {
        List<Trip> trips = new ArrayList<>();
        if (data == null) return trips;
        JSONArray away = data.optJSONArray("away");
        if (away != null) {
            for (int i = 0; i < away.length(); i++) {
                JSONObject a = away.optJSONObject(i);
                if (a != null) trips.add(new Trip(a, a.optString("title"), true));
            }
        }
        JSONArray projects = data.optJSONArray("projects");
        if (projects != null) {
            for (int i = 0; i < projects.length(); i++) {
                JSONObject p = projects.optJSONObject(i);
                JSONObject trip = p != null ? p.optJSONObject("trip") : null;
                if (trip != null) trips.add(new Trip(trip, p.optString("name"), true));
            }
        }
        JSONArray partnerAway = data.optJSONArray("partnerAway");
        if (partnerAway != null) {
            JSONObject partner = data.optJSONObject("partner");
            String who = partner != null ? partner.optString("name").split(" ")[0] : "";
            for (int i = 0; i < partnerAway.length(); i++) {
                JSONObject a = partnerAway.optJSONObject(i);
                if (a == null) continue;
                // A trip together shows as the two of yours; one of just theirs carries their name.
                String title = a.optBoolean("together") || who.isEmpty() ? a.optString("title") : who + " · " + a.optString("title");
                trips.add(new Trip(a, title, false));
            }
        }
        trips.removeIf(t -> t.start.length() < 10);
        return trips;
    }

    static final class Item {
        final String taskId;
        final String label;
        final String content;
        final String time;
        final boolean overdue;
        final int priority;
        /** The task's own due date (what ticking it off expects). */
        final String dueDate;
        /** An event (violet, no tick); `past` once it's over (greyed); `endTime` "HH:mm" or null. */
        boolean event;
        boolean past;
        String endTime;

        Item(String taskId, String label, String content, String time, boolean overdue, int priority, String dueDate) {
            this.taskId = taskId;
            this.label = label;
            this.content = content;
            this.time = time;
            this.overdue = overdue;
            this.priority = priority;
            this.dueDate = dueDate;
        }
    }

    /**
     * Open tasks by day between `from` and `to` (the shopping list left out),
     * timed ones first by time. A repeating task shows on each of its days
     * from its current one; one that counts from when it's done, only there.
     */
    static Map<String, List<Item>> itemsByDay(JSONObject data, String from, String to) {
        Map<String, List<Item>> byDay = new HashMap<>();
        JSONArray tasks = data != null ? data.optJSONArray("tasks") : null;
        if (tasks == null) return byDay;
        Set<String> shoppingLists = new HashSet<>();
        JSONArray projects = data.optJSONArray("projects");
        if (projects != null) {
            for (int i = 0; i < projects.length(); i++) {
                JSONObject p = projects.optJSONObject(i);
                if (p != null && "shopping".equals(p.optString("viewStyle"))) shoppingLists.add(p.optString("id"));
            }
        }
        String today = TaskLogic.todayStr();
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t == null || shoppingLists.contains(t.optString("projectId"))) continue;
            // Events stay on their day once they're over, greyed; done tasks go.
            boolean event = TaskLogic.isEvent(t);
            if (t.optBoolean("completed") && !event) continue;
            boolean past = event && (t.optBoolean("completed") || TaskLogic.eventOver(t));
            String endTime = event && t.has("endTime") && !t.isNull("endTime") ? t.optString("endTime") : null;
            JSONObject due = t.optJSONObject("due");
            String date = due != null ? WidgetStore.optStringOrNull(due, "date") : null;
            if (date == null || date.length() < 10) continue;
            date = date.substring(0, 10);
            String time = null;
            String datetime = WidgetStore.optStringOrNull(due, "datetime");
            if (datetime != null) {
                java.util.Date dt = TaskLogic.parseIso(datetime);
                if (dt != null) time = new SimpleDateFormat("HH:mm", Locale.US).format(dt);
            }
            String label = shortLabel(t.optString("content"));
            String id = t.optString("id");

            JSONObject rule = null;
            if (due.optBoolean("isRecurring")) {
                try {
                    rule = new JSONObject(due.optString("rrule", "{}"));
                } catch (org.json.JSONException e) {
                    rule = null;
                }
                if (rule != null && rule.optBoolean("afterDone")) rule = null;
            }
            String d = date;
            for (int n = 0; n < 60 && d.compareTo(to) <= 0; n++) {
                if (d.compareTo(from) >= 0) {
                    List<Item> list = byDay.get(d);
                    if (list == null) byDay.put(d, list = new ArrayList<>());
                    Item item = new Item(id, label, t.optString("content"), time, !event && d.compareTo(today) < 0,
                            t.optInt("priority", 1), date);
                    item.event = event;
                    item.past = past && d.equals(date);
                    item.endTime = endTime;
                    list.add(item);
                }
                if (rule == null) break;
                String next = TaskLogic.advanceDate(d, rule);
                if (next.compareTo(d) <= 0) break;
                d = next;
            }
        }
        for (List<Item> list : byDay.values()) {
            list.sort((a, b) -> {
                if (a.time != null && b.time != null) return a.time.compareTo(b.time);
                if (a.time != null) return -1;
                if (b.time != null) return 1;
                return 0;
            });
        }
        return byDay;
    }

    /** A task that got done, on the day it was ticked off. */
    static final class Done {
        final String taskId;
        final String content;
        final String label;
        final String at;
        final String time;

        Done(String taskId, String content, String at, String time) {
            this.taskId = taskId;
            this.content = content;
            this.label = shortLabel(content);
            this.at = at;
            this.time = time;
        }
    }

    /**
     * What got done by day, up to `today`: the app's list (`done`, sent with
     * the snapshot) plus what was ticked off in the widget since
     * (`completionLog`) and completed tasks still in the snapshot.
     */
    static Map<String, List<Done>> doneByDay(JSONObject data, String today) {
        Map<String, List<Done>> byDay = new HashMap<>();
        Set<String> seen = new HashSet<>();
        SimpleDateFormat dayFmt = TaskLogic.dayFormat();
        SimpleDateFormat timeFmt = new SimpleDateFormat("HH:mm", Locale.US);
        List<String[]> all = new ArrayList<>();
        JSONArray sent = data.optJSONArray("done");
        if (sent != null) {
            for (int i = 0; i < sent.length(); i++) {
                JSONObject e = sent.optJSONObject(i);
                if (e != null) all.add(new String[] {e.optString("id"), e.optString("c"), e.optString("at")});
            }
        }
        JSONArray log = data.optJSONArray("completionLog");
        if (log != null) {
            for (int i = 0; i < log.length(); i++) {
                JSONObject e = log.optJSONObject(i);
                if (e != null) all.add(new String[] {e.optString("taskId"), e.optString("content"), e.optString("at")});
            }
        }
        JSONArray tasks = data.optJSONArray("tasks");
        if (tasks != null) {
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject t = tasks.optJSONObject(i);
                if (t != null && t.optBoolean("completed") && !t.optString("completedAt").isEmpty() && !TaskLogic.isEvent(t)) {
                    all.add(new String[] {t.optString("id"), t.optString("content"), t.optString("completedAt")});
                }
            }
        }
        for (String[] e : all) {
            if (e[0].isEmpty() || e[2].isEmpty() || !seen.add(e[0] + "@" + e[2])) continue;
            java.util.Date at = ReminderLogic.parseIso(e[2]);
            if (at == null) continue;
            String day = dayFmt.format(at);
            if (day.compareTo(today) > 0) continue;
            List<Done> list = byDay.get(day);
            if (list == null) byDay.put(day, list = new ArrayList<>());
            list.add(new Done(e[0], e[1], e[2], timeFmt.format(at)));
        }
        for (List<Done> list : byDay.values()) list.sort((a, b) -> b.at.compareTo(a.at));
        return byDay;
    }

    /** A task's first word, or its first two when they're short ("Nejc žur"), for a day square. */
    static String shortLabel(String content) {
        String[] words = content.trim().split("\\s+");
        if (words.length == 0 || words[0].isEmpty()) return content.trim();
        String label = words[0];
        // A second word when both fit, but not a little one ("Predstava v" reads as "Predstava").
        if (words.length > 1 && words[1].length() >= 3 && label.length() + 1 + words[1].length() <= 12) label += " " + words[1];
        return label;
    }
}
