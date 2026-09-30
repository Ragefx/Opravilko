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
 * The widget as a month, like a phone calendar: a square per day with its
 * tasks in it, each shown by its first word or two ("Zobni", "Nejc žur").
 * ‹ and › change the month; a day opens the app's calendar on it, a task
 * opens it over the home screen. Repeating tasks show on each of their days.
 */
final class CalendarWidget {
    static final String ACTION_MONTH = "com.opravilko.app.widget.CAL_MONTH";
    static final String EXTRA_DELTA = "com.opravilko.app.widget.CAL_DELTA";

    private static final int HEADER_DP = 52 + 34 + 18 + 10;
    private static final int DAY_NUMBER_DP = 21;
    private static final int CHIP_DP = 16;

    private CalendarWidget() {}

    /** Header, month line and weeks; the header's buttons are set by the caller. */
    static RemoteViews build(Context context, int appWidgetId, JSONObject data) {
        WidgetStore store = new WidgetStore(context);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_calendar);

        Calendar month = Calendar.getInstance();
        month.set(Calendar.DAY_OF_MONTH, 1);
        month.add(Calendar.MONTH, store.getCalendarMonth(appWidgetId));
        String monthName = new SimpleDateFormat("LLLL yyyy", Locale.ENGLISH).format(month.getTime());
        views.setTextViewText(R.id.cal_month, monthName);

        // From the Monday on or before the 1st, whole weeks to the last day.
        Calendar first = (Calendar) month.clone();
        int back = (first.get(Calendar.DAY_OF_WEEK) + 5) % 7; // Monday = 0
        first.add(Calendar.DAY_OF_MONTH, -back);
        Calendar last = (Calendar) month.clone();
        last.set(Calendar.DAY_OF_MONTH, last.getActualMaximum(Calendar.DAY_OF_MONTH));
        int after = (7 - ((last.get(Calendar.DAY_OF_WEEK) + 5) % 7) - 1) % 7;
        last.add(Calendar.DAY_OF_MONTH, after);
        SimpleDateFormat day = TaskLogic.dayFormat();
        String from = day.format(first.getTime());
        String to = day.format(last.getTime());
        int weeks = (TaskLogic.daysBetween(from, to) + 1) / 7;

        Map<String, List<Item>> byDay = itemsByDay(data, from, to);
        int perDay = chipsThatFit(context, appWidgetId, weeks);
        String today = TaskLogic.todayStr();
        int thisMonth = month.get(Calendar.MONTH);

        Calendar c = (Calendar) first.clone();
        for (int w = 0; w < weeks; w++) {
            RemoteViews week = new RemoteViews(context.getPackageName(), R.layout.widget_cal_week);
            for (int d = 0; d < 7; d++) {
                String key = day.format(c.getTime());
                RemoteViews cell = new RemoteViews(context.getPackageName(), R.layout.widget_cal_day);
                cell.setTextViewText(R.id.cal_day_num, String.valueOf(c.get(Calendar.DAY_OF_MONTH)));
                if (key.equals(today)) {
                    cell.setInt(R.id.cal_day_num, "setBackgroundResource", R.drawable.widget_cal_today_bg);
                    cell.setTextColor(R.id.cal_day_num, context.getColor(R.color.widget_on_accent));
                } else if (c.get(Calendar.MONTH) != thisMonth) {
                    cell.setTextColor(R.id.cal_day_num, context.getColor(R.color.widget_text_muted));
                }
                List<Item> items = byDay.get(key);
                if (items != null) {
                    int shown = items.size() > perDay ? Math.max(0, perDay - 1) : items.size();
                    for (int i = 0; i < shown; i++) {
                        Item item = items.get(i);
                        RemoteViews chip = new RemoteViews(context.getPackageName(), R.layout.widget_cal_chip);
                        chip.setTextViewText(R.id.cal_chip, item.label);
                        if (item.overdue) {
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
                }
                cell.setOnClickPendingIntent(R.id.cal_day, TaskWidgetProvider.openApp(context, appWidgetId * 64 + w * 7 + d,
                        "opravilko://open?view=calendar&day=" + key));
                week.addView(R.id.cal_week, cell);
                c.add(Calendar.DAY_OF_MONTH, 1);
            }
            views.addView(R.id.cal_grid, week);
        }

        views.setOnClickPendingIntent(R.id.cal_prev, monthIntent(context, appWidgetId, -1));
        views.setOnClickPendingIntent(R.id.cal_next, monthIntent(context, appWidgetId, 1));
        // The month's name: back to this month.
        views.setOnClickPendingIntent(R.id.cal_month, monthIntent(context, appWidgetId, 0));
        return views;
    }

    /** ‹ / › / the month's name tapped: move the month (0: back to this one), then redraw. */
    static void onMonth(Context context, Intent intent) {
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return;
        WidgetStore store = new WidgetStore(context);
        int delta = intent.getIntExtra(EXTRA_DELTA, 0);
        store.setCalendarMonth(id, delta == 0 ? 0 : store.getCalendarMonth(id) + delta);
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

    /** How many task lines fit in a day square at the widget's current height. */
    private static int chipsThatFit(Context context, int appWidgetId, int weeks) {
        Bundle options = AppWidgetManager.getInstance(context).getAppWidgetOptions(appWidgetId);
        int height = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) : 0;
        if (height <= 0) return 2;
        int perWeek = (height - HEADER_DP) / Math.max(1, weeks);
        return Math.max(1, Math.min(5, (perWeek - DAY_NUMBER_DP) / CHIP_DP));
    }

    static final class Item {
        final String taskId;
        final String label;
        final String time;
        final boolean overdue;

        Item(String taskId, String label, String time, boolean overdue) {
            this.taskId = taskId;
            this.label = label;
            this.time = time;
            this.overdue = overdue;
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
            if (t == null || t.optBoolean("completed") || shoppingLists.contains(t.optString("projectId"))) continue;
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
                    list.add(new Item(id, label, time, d.compareTo(today) < 0));
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
