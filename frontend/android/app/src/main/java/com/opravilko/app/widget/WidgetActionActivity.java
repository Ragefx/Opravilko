package com.opravilko.app.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.opravilko.app.MainActivity;

import org.json.JSONObject;

/**
 * Invisible handler for taps on widget rows (Theme.NoDisplay, finishes at
 * once). Completing updates the widget immediately and queues the change for
 * WidgetSyncJob; opening hands the task to the app.
 */
public class WidgetActionActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        String action = intent.getStringExtra(TaskWidgetProvider.EXTRA_ACTION);
        String taskId = intent.getStringExtra(TaskWidgetProvider.EXTRA_TASK_ID);

        if (TaskWidgetProvider.ACTION_COMPLETE.equals(action) && taskId != null) {
            complete(taskId, intent.getStringExtra(TaskWidgetProvider.EXTRA_DUE_DATE));
        } else if (TaskWidgetProvider.ACTION_RESCHEDULE.equals(action)) {
            rescheduleOverdue(intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID));
        } else if (TaskWidgetProvider.ACTION_EDIT_ITEM.equals(action) && taskId != null) {
            Intent edit = new Intent(this, ShopItemActivity.class);
            edit.putExtra(ShopItemActivity.EXTRA_TASK_ID, taskId);
            edit.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(edit);
        } else if (TaskWidgetProvider.ACTION_EDIT_TASK.equals(action) && taskId != null) {
            Intent edit = new Intent(this, TaskItemActivity.class);
            edit.putExtra(TaskItemActivity.EXTRA_TASK_ID, taskId);
            edit.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(edit);
        } else if (TaskWidgetProvider.ACTION_OPEN.equals(action) && taskId != null) {
            String project = intent.getStringExtra(TaskWidgetProvider.EXTRA_PROJECT_ID);
            Uri uri = Uri.parse("opravilko://open?task=" + Uri.encode(taskId)
                    + "&project=" + Uri.encode(project != null ? project : "inbox"));
            Intent open = new Intent(Intent.ACTION_VIEW, uri, this, MainActivity.class);
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(open);
        }
        finish();
        overridePendingTransition(0, 0);
    }

    /** "Reschedule" on the Overdue heading: every overdue task in this widget's view moves to today. */
    private void rescheduleOverdue(int appWidgetId) {
        WidgetStore store = new WidgetStore(this);
        JSONObject data = store.getSnapshot();
        if (data == null) return;
        String today = TaskLogic.todayStr();
        String at = TaskLogic.nowIso();
        boolean changed = false;
        for (TaskLogic.Row row : TaskLogic.rowsForView(data, store.getView(appWidgetId))) {
            if (row.dueDate == null || row.dueDate.compareTo(today) >= 0) continue;
            store.addPending(row.id, null, at, WidgetStore.OP_TODAY);
            changed |= TaskLogic.moveToToday(data, row.id, at);
        }
        if (changed) store.saveSnapshot(data, false);
        TaskWidgetProvider.updateAll(this);
        WidgetSyncJob.schedule(this);
    }

    private void complete(String taskId, String dueDate) {
        // The tick, the line and the fade first; then it's done (and synced).
        CompleteAnimation.start(this, taskId, dueDate);
    }

    /** Ticks a task off from outside the app (the widget, a reminder's Done): saved by the sync job. */
    static void completeTask(Context context, String taskId, String dueDate) {
        WidgetStore store = new WidgetStore(context);
        String at = TaskLogic.nowIso();
        // Queue first, so data the app pushes meanwhile still gets it re-applied.
        store.addPending(taskId, dueDate, at);
        JSONObject data = store.getSnapshot();
        if (data != null && TaskLogic.complete(data, taskId, dueDate, at)) {
            store.saveSnapshot(data, false);
        }
        TaskWidgetProvider.updateAll(context);
        WidgetSyncJob.schedule(context);
    }
}
