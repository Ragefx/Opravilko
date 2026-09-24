package com.opravilko.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import com.opravilko.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Supplies the widget's list: headings and task rows.
 *   Today     "Overdue" (with Reschedule), then today.
 *   Upcoming  "Overdue", then each day of the coming week (empty days greyed).
 *   A project / Inbox: tasks without a section, then each section with its count.
 */
public class TaskWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext(),
                intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID));
    }

    /** One line of the list: a heading or a task. */
    static final class Item {
        final String heading;
        final int count;
        final boolean muted;
        final boolean reschedule;
        final TaskLogic.Row row;
        /** Date views: the row sits under its day's heading. */
        final boolean dateInHeading;
        /** Shopping list: the item's name, amount and icon. */
        String shopName, shopAmount, shopIcon, shopStore;

        private Item(String heading, int count, boolean muted, boolean reschedule, TaskLogic.Row row, boolean dateInHeading) {
            this.heading = heading;
            this.count = count;
            this.muted = muted;
            this.reschedule = reschedule;
            this.row = row;
            this.dateInHeading = dateInHeading;
        }

        static Item heading(String title, int count, boolean muted, boolean reschedule) {
            return new Item(title, count, muted, reschedule, null, false);
        }

        static Item task(TaskLogic.Row row, boolean dateInHeading) {
            return new Item(null, 0, false, false, row, dateInHeading);
        }

        static Item shop(JSONObject data, TaskLogic.Row row) {
            Item item = new Item(null, 0, false, false, row, false);
            String[] parsed = ShoppingLogic.parse(row.content);
            item.shopName = parsed[0];
            item.shopAmount = parsed[1];
            item.shopIcon = ShoppingLogic.emoji(data, row.description, parsed[0]);
            item.shopStore = ShoppingLogic.storeOf(row.description);
            return item;
        }
    }

    static List<Item> itemsFor(JSONObject data, String view) {
        List<Item> items = new ArrayList<>();
        List<TaskLogic.Row> rows = TaskLogic.rowsForView(data, view);
        String today = TaskLogic.todayStr();
        boolean isToday = WidgetStore.VIEW_TODAY.equals(view);
        boolean isUpcoming = WidgetStore.VIEW_UPCOMING.equals(view);

        if (isToday || isUpcoming) {
            List<TaskLogic.Row> overdue = new ArrayList<>();
            for (TaskLogic.Row r : rows) if (r.dueDate.compareTo(today) < 0) overdue.add(r);
            if (!overdue.isEmpty()) {
                items.add(Item.heading("Overdue", 0, false, true));
                for (TaskLogic.Row r : overdue) items.add(Item.task(r, false));
            }
            int days = isToday ? 1 : TaskLogic.UPCOMING_DAYS;
            for (int d = 0; d < days; d++) {
                String day = TaskLogic.addDaysStr(today, d);
                List<TaskLogic.Row> onDay = new ArrayList<>();
                for (TaskLogic.Row r : rows) if (r.dueDate.equals(day)) onDay.add(r);
                // Today's heading only when there's something above it or on it.
                if (isToday && onDay.isEmpty() && overdue.isEmpty()) continue;
                items.add(Item.heading(TaskLogic.dayHeading(day, isUpcoming), 0, onDay.isEmpty(), false));
                for (TaskLogic.Row r : onDay) items.add(Item.task(r, true));
            }
            return items;
        }

        // The shopping list: its items, as the app lists them.
        if (ShoppingLogic.isShoppingView(data, view)) {
            // By category, in the shop-walk order the app uses; within one, as added.
            List<TaskLogic.Row> sorted = new ArrayList<>(rows);
            java.util.Map<String, Integer> rank = new java.util.HashMap<>();
            for (TaskLogic.Row r : sorted) {
                String name = ShoppingLogic.parse(r.content)[0];
                rank.put(r.id, ShoppingLogic.categoryRank(data, ShoppingLogic.categoryId(data, r.description, name)));
            }
            java.util.Collections.sort(sorted, (a, b) -> Integer.compare(rank.get(a.id), rank.get(b.id)));
            for (TaskLogic.Row r : sorted) items.add(Item.shop(data, r));
            return items;
        }

        // A project (or the Inbox): loose tasks first, then its sections in order.
        String projectId = TaskLogic.viewProjectId(view);
        if (!rows.isEmpty()) projectId = rows.get(0).projectId;
        List<JSONObject> sections = new ArrayList<>();
        JSONArray all = data != null ? data.optJSONArray("sections") : null;
        if (all != null) {
            for (int i = 0; i < all.length(); i++) {
                JSONObject s = all.optJSONObject(i);
                if (s != null && projectId.equals(s.optString("projectId")) && !s.optBoolean("archived")) sections.add(s);
            }
            sections.sort((a, b) -> Double.compare(a.optDouble("order", 0), b.optDouble("order", 0)));
        }
        List<String> known = new ArrayList<>();
        for (JSONObject s : sections) known.add(s.optString("id"));
        for (TaskLogic.Row r : rows) {
            if (r.sectionId == null || !known.contains(r.sectionId)) items.add(Item.task(r, false));
        }
        for (JSONObject s : sections) {
            List<TaskLogic.Row> in = new ArrayList<>();
            for (TaskLogic.Row r : rows) if (s.optString("id").equals(r.sectionId)) in.add(r);
            items.add(Item.heading(s.optString("name"), in.size(), in.isEmpty(), false));
            for (TaskLogic.Row r : in) items.add(Item.task(r, false));
        }
        return items;
    }

    static final class Factory implements RemoteViewsFactory {
        private final Context context;
        private final int appWidgetId;
        private List<Item> items = new ArrayList<>();
        private boolean showProject;
        private String view = WidgetStore.VIEW_TODAY;

        Factory(Context context, int appWidgetId) {
            this.context = context;
            this.appWidgetId = appWidgetId;
        }

        @Override public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            WidgetStore store = new WidgetStore(context);
            view = store.getView(appWidgetId);
            items = itemsFor(store.getSnapshot(), view);
            // Date-based views mix projects, so each row says which one.
            showProject = WidgetStore.VIEW_TODAY.equals(view) || WidgetStore.VIEW_UPCOMING.equals(view);
        }

        @Override public void onDestroy() { items = new ArrayList<>(); }

        @Override public int getCount() { return items.size(); }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= items.size()) return null;
            Item item = items.get(position);
            if (item.row == null) return headingView(item);
            return item.shopName != null ? shopView(item) : taskView(item);
        }

        private RemoteViews shopView(Item item) {
            TaskLogic.Row row = item.row;
            RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_shop_row);
            rv.setTextViewText(R.id.shop_name, item.shopName);
            rv.setViewVisibility(R.id.shop_amount, item.shopAmount != null ? View.VISIBLE : View.GONE);
            if (item.shopAmount != null) rv.setTextViewText(R.id.shop_amount, item.shopAmount);
            rv.setTextViewText(R.id.shop_icon, item.shopIcon);
            rv.setViewVisibility(R.id.shop_store, item.shopStore != null ? View.VISIBLE : View.GONE);
            if (item.shopStore != null) rv.setTextViewText(R.id.shop_store, item.shopStore);

            Intent bought = new Intent();
            bought.putExtra(TaskWidgetProvider.EXTRA_ACTION, TaskWidgetProvider.ACTION_COMPLETE);
            bought.putExtra(TaskWidgetProvider.EXTRA_TASK_ID, row.id);
            rv.setOnClickFillInIntent(R.id.shop_check, bought);
            // Tapping the item itself opens it in the app (its note, shop, amount).
            Intent open = new Intent();
            open.putExtra(TaskWidgetProvider.EXTRA_ACTION, TaskWidgetProvider.ACTION_OPEN);
            open.putExtra(TaskWidgetProvider.EXTRA_TASK_ID, row.id);
            open.putExtra(TaskWidgetProvider.EXTRA_PROJECT_ID, row.projectId);
            rv.setOnClickFillInIntent(R.id.shop_root, open);
            return rv;
        }

        private RemoteViews headingView(Item item) {
            RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_section_row);
            rv.setTextViewText(R.id.section_title, item.heading);
            rv.setTextColor(R.id.section_title, context.getColor(item.muted ? R.color.widget_text_muted : R.color.widget_text));
            boolean showCount = item.count > 0;
            rv.setTextViewText(R.id.section_count, showCount ? String.valueOf(item.count) : "");
            rv.setViewVisibility(R.id.section_count, showCount ? View.VISIBLE : View.GONE);
            rv.setViewVisibility(R.id.section_action, item.reschedule ? View.VISIBLE : View.GONE);
            if (item.reschedule) {
                Intent reschedule = new Intent();
                reschedule.putExtra(TaskWidgetProvider.EXTRA_ACTION, TaskWidgetProvider.ACTION_RESCHEDULE);
                rv.setOnClickFillInIntent(R.id.section_action, reschedule);
            }
            return rv;
        }

        private RemoteViews taskView(Item item) {
            TaskLogic.Row row = item.row;
            RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_task_row);
            rv.setImageViewResource(R.id.row_check, checkDrawable(row.priority));
            rv.setTextViewText(R.id.row_title, row.content);

            // The date next to the calendar icon: Today, Yesterday, Tomorrow or "27 Sep" (and a time).
            String due = row.dueDate != null ? TaskLogic.dueLabel(row) : null;
            boolean hasDue = row.dueDate != null;
            int neutral = context.getColor(R.color.widget_text_secondary);
            int iconColor = context.getColor(hasDue ? dueColor(row) : R.color.widget_text_secondary);
            rv.setViewVisibility(R.id.row_due_icon, hasDue ? View.VISIBLE : View.GONE);
            rv.setInt(R.id.row_due_icon, "setColorFilter", iconColor);
            rv.setViewVisibility(R.id.row_due, due != null ? View.VISIBLE : View.GONE);
            if (due != null) {
                rv.setTextViewText(R.id.row_due, due);
                rv.setTextColor(R.id.row_due, iconColor);
            }
            rv.setViewVisibility(R.id.row_repeat, row.recurring ? View.VISIBLE : View.GONE);
            rv.setInt(R.id.row_repeat, "setColorFilter", iconColor);
            rv.setViewVisibility(R.id.row_notes, row.hasDescription ? View.VISIBLE : View.GONE);
            rv.setInt(R.id.row_notes, "setColorFilter", neutral);

            boolean project = showProject && row.projectName != null;
            rv.setViewVisibility(R.id.row_project, project ? View.VISIBLE : View.GONE);
            rv.setViewVisibility(R.id.row_project_icon, project ? View.VISIBLE : View.GONE);
            if (project) {
                rv.setTextViewText(R.id.row_project, row.projectName);
                rv.setImageViewResource(R.id.row_project_icon, row.projectIsInbox ? R.drawable.ic_w_inbox : R.drawable.ic_w_hash);
                rv.setInt(R.id.row_project_icon, "setColorFilter", context.getColor(R.color.widget_accent));
            }
            rv.setViewVisibility(R.id.row_meta, hasDue || row.hasDescription || project ? View.VISIBLE : View.GONE);

            Intent complete = new Intent();
            complete.putExtra(TaskWidgetProvider.EXTRA_ACTION, TaskWidgetProvider.ACTION_COMPLETE);
            complete.putExtra(TaskWidgetProvider.EXTRA_TASK_ID, row.id);
            // A repeating task is only advanced if it's still on the date shown.
            if (row.recurring) complete.putExtra(TaskWidgetProvider.EXTRA_DUE_DATE, row.dueDate);
            rv.setOnClickFillInIntent(R.id.row_check, complete);

            Intent open = new Intent();
            open.putExtra(TaskWidgetProvider.EXTRA_ACTION, TaskWidgetProvider.ACTION_OPEN);
            open.putExtra(TaskWidgetProvider.EXTRA_TASK_ID, row.id);
            open.putExtra(TaskWidgetProvider.EXTRA_PROJECT_ID, row.projectId);
            rv.setOnClickFillInIntent(R.id.row_root, open);
            return rv;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 3; }
        @Override public long getItemId(int position) {
            if (position >= items.size()) return position;
            Item item = items.get(position);
            return item.row != null ? item.row.id.hashCode() : ("h:" + item.heading).hashCode();
        }
        @Override public boolean hasStableIds() { return true; }

        /** Stored priority 4..1 is shown as p1..p4 (red, yellow, green, plain grey), like the app. */
        private static int checkDrawable(int priority) {
            switch (priority) {
                case 4: return R.drawable.widget_check_4;
                case 3: return R.drawable.widget_check_3;
                case 2: return R.drawable.widget_check_2;
                default: return R.drawable.widget_check_1;
            }
        }

        private static int dueColor(TaskLogic.Row row) {
            switch (TaskLogic.dueKind(row.dueDate)) {
                case OVERDUE: return R.color.widget_due_overdue;
                case TODAY: return R.color.widget_due_today;
                case TOMORROW: return R.color.widget_due_tomorrow;
                default:
                    // The coming week in purple, further out in grey.
                    return row.dueDate.compareTo(TaskLogic.addDaysStr(TaskLogic.todayStr(), 6)) <= 0
                            ? R.color.widget_due_later : R.color.widget_due_far;
            }
        }
    }
}
