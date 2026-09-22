package com.opravilko.app.widget;

import android.app.Activity;
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

    private void complete(String taskId, String dueDate) {
        WidgetStore store = new WidgetStore(this);
        String at = TaskLogic.nowIso();
        // Queue first, so data the app pushes meanwhile still gets it re-applied.
        store.addPending(taskId, dueDate, at);
        JSONObject data = store.getSnapshot();
        if (data != null && TaskLogic.complete(data, taskId, dueDate, at)) {
            store.saveSnapshot(data, false);
        }
        TaskWidgetProvider.updateAll(this);
        WidgetSyncJob.schedule(this);
    }
}
