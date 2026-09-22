package com.opravilko.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import com.opravilko.app.R;

import java.util.ArrayList;
import java.util.List;

/** Supplies the widget's task rows. */
public class TaskWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext(),
                intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID));
    }

    static final class Factory implements RemoteViewsFactory {
        private final Context context;
        private final int appWidgetId;
        private List<TaskLogic.Row> rows = new ArrayList<>();
        private boolean showProject;

        Factory(Context context, int appWidgetId) {
            this.context = context;
            this.appWidgetId = appWidgetId;
        }

        @Override public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            WidgetStore store = new WidgetStore(context);
            String view = store.getView(appWidgetId);
            rows = TaskLogic.rowsForView(store.getSnapshot(), view);
            // Date-based views mix projects, so each row says which one.
            showProject = WidgetStore.VIEW_TODAY.equals(view) || WidgetStore.VIEW_UPCOMING.equals(view);
        }

        @Override public void onDestroy() { rows = new ArrayList<>(); }

        @Override public int getCount() { return rows.size(); }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= rows.size()) return null;
            TaskLogic.Row row = rows.get(position);
            RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_task_row);
            rv.setImageViewResource(R.id.row_check, checkDrawable(row.priority));
            rv.setTextViewText(R.id.row_title, row.content);

            String due = TaskLogic.dueLabel(row);
            if (due != null) {
                rv.setTextViewText(R.id.row_due, due);
                rv.setTextColor(R.id.row_due, context.getColor(dueColor(TaskLogic.dueKind(row.dueDate))));
                rv.setViewVisibility(R.id.row_due, View.VISIBLE);
            } else {
                rv.setViewVisibility(R.id.row_due, View.GONE);
            }
            boolean project = showProject && row.projectName != null;
            if (project) rv.setTextViewText(R.id.row_project, row.projectName);
            rv.setViewVisibility(R.id.row_project, project ? View.VISIBLE : View.GONE);
            rv.setViewVisibility(R.id.row_meta, due != null || project ? View.VISIBLE : View.GONE);

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
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int position) {
            return position < rows.size() ? rows.get(position).id.hashCode() : position;
        }
        @Override public boolean hasStableIds() { return true; }

        /** Stored priority 4..1 is shown as p1..p4 (red, yellow, green, blue), like the app. */
        private static int checkDrawable(int priority) {
            switch (priority) {
                case 4: return R.drawable.widget_check_4;
                case 3: return R.drawable.widget_check_3;
                case 2: return R.drawable.widget_check_2;
                default: return R.drawable.widget_check_1;
            }
        }

        private static int dueColor(TaskLogic.DueKind kind) {
            switch (kind) {
                case OVERDUE: return R.color.widget_due_overdue;
                case TODAY: return R.color.widget_due_today;
                case TOMORROW: return R.color.widget_due_tomorrow;
                default: return R.color.widget_due_later;
            }
        }
    }
}
