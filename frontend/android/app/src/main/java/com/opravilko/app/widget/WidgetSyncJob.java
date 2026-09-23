package com.opravilko.app.widget;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.HashSet;
import java.util.Set;

/**
 * Background sync for the widget, run by Android's JobScheduler whenever
 * there's a network connection: applies completions tapped in the widget to
 * the Dropbox file (download, apply, upload against the same revision,
 * retrying if the file changed meanwhile) and refreshes the widget's copy of
 * the tasks. With no network the job simply waits, so taps made offline sync
 * once the phone is back online.
 */
public class WidgetSyncJob extends JobService {
    private static final int JOB_ID = 47_110;
    private static final Object LOCK = new Object();

    public static void schedule(Context context) {
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler == null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(context, WidgetSyncJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setBackoffCriteria(30_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                .build();
        scheduler.schedule(job);
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        final Context context = getApplicationContext();
        new Thread(() -> {
            boolean retry = false;
            try {
                sync(context);
            } catch (DropboxClient.AuthException | FirestoreClient.AuthException e) {
                // Signed out or revoked: nothing to retry until the app signs in again.
            } catch (IOException e) {
                retry = true;
            }
            jobFinished(params, retry);
        }, "opravilko-widget-sync").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        // Interrupted (e.g. network lost): try again later. Completions stay
        // queued until they've been written, so a rerun is harmless.
        return true;
    }

    static void sync(Context context) throws IOException {
        synchronized (LOCK) {
            WidgetStore store = new WidgetStore(context);
            if (!store.hasAuth()) return;
            if (store.isFirebase()) {
                syncFirebase(context, store);
                return;
            }
            DropboxClient dropbox = new DropboxClient(store);

            for (int attempt = 0; attempt < 3; attempt++) {
                DropboxClient.Download download = dropbox.download();
                JSONObject data;
                try {
                    data = new JSONObject(download.text);
                } catch (JSONException e) {
                    throw new IOException("Data file isn't valid JSON");
                }

                JSONArray pending = store.getPending();
                Set<String> processed = new HashSet<>();
                boolean changed = false;
                for (int i = 0; i < pending.length(); i++) {
                    JSONObject p = pending.optJSONObject(i);
                    if (p == null) continue;
                    processed.add(p.optString("id"));
                    changed |= TaskLogic.complete(data, p.optString("taskId"),
                            WidgetStore.optStringOrNull(p, "dueDate"), p.optString("at"));
                }

                if (changed) {
                    try {
                        dropbox.upload(data.toString(2), download.rev);
                    } catch (DropboxClient.ConflictException e) {
                        continue; // someone else saved first: re-download and re-apply
                    } catch (JSONException e) {
                        throw new IOException(e.getMessage());
                    }
                }

                store.removePending(processed);
                // Taps made while this ran are re-applied on top of the fresh copy.
                store.saveSnapshot(stripForWidget(data), true);
                store.setLastRefresh(System.currentTimeMillis());
                TaskWidgetProvider.updateAll(context);
                if (changed) WidgetEvents.notifyDataChanged();
                return;
            }
            throw new IOException("Dropbox file kept changing");
        }
    }

    /**
     * With Google sign-in the tasks live in Firestore: each completion tapped
     * in the widget is applied to the task as it is now (so a repeating task
     * isn't advanced twice) and only the changed fields are written. The app,
     * if it's open, sees the change live; the widget's list was already
     * updated when it was tapped. (The widget's list itself refreshes when
     * the app runs.)
     */
    private static void syncFirebase(Context context, WidgetStore store) throws IOException {
        FirestoreClient firestore = new FirestoreClient(store);
        String uid = store.getFirebaseUid();
        JSONObject snapshot = store.getSnapshot();
        JSONArray known = snapshot != null ? snapshot.optJSONArray("tasks") : null;
        JSONArray pending = store.getPending();
        Set<String> processed = new HashSet<>();
        try {
            for (int i = 0; i < pending.length(); i++) {
                JSONObject p = pending.optJSONObject(i);
                if (p == null) continue;
                String taskId = p.optString("taskId");
                String at = p.optString("at");
                JSONObject task = firestore.getTask(taskId);
                if (task == null) {
                    processed.add(p.optString("id")); // deleted meanwhile, or no longer shared
                    continue;
                }
                // The task as it is now, plus its sub-tasks as the widget knows them.
                JSONArray tasks = new JSONArray().put(task);
                if (known != null) {
                    for (int k = 0; k < known.length(); k++) {
                        JSONObject t = known.optJSONObject(k);
                        if (t != null && !taskId.equals(t.optString("id"))) tasks.put(new JSONObject(t.toString()));
                    }
                }
                JSONObject data = new JSONObject().put("tasks", tasks);
                String before = tasks.toString();
                if (TaskLogic.complete(data, taskId, WidgetStore.optStringOrNull(p, "dueDate"), at)
                        && !before.equals(tasks.toString())) {
                    JSONArray after = data.getJSONArray("tasks");
                    JSONArray was = new JSONArray(before);
                    for (int k = 0; k < after.length(); k++) {
                        JSONObject now = after.getJSONObject(k);
                        JSONObject prev = was.getJSONObject(k);
                        if (now.toString().equals(prev.toString())) continue;
                        JSONObject fields = new JSONObject().put("updatedAt", now.optString("updatedAt", at));
                        if (now.optBoolean("completed") && !prev.optBoolean("completed")) {
                            fields.put("completed", true).put("completedAt", now.optString("completedAt", at));
                            if (uid != null) fields.put("completedBy", uid);
                        } else if (now.has("due")) {
                            fields.put("due", now.get("due")); // a repeating task moved to its next date
                        }
                        firestore.updateTask(now.optString("id"), fields);
                    }
                }
                processed.add(p.optString("id"));
            }
        } catch (JSONException e) {
            throw new IOException(e.getMessage());
        } finally {
            store.removePending(processed);
            TaskWidgetProvider.updateAll(context);
        }
    }

    /** The widget has no use for calendar events or the completion history. */
    static JSONObject stripForWidget(JSONObject data) {
        data.remove("calendarEvents");
        data.remove("calendarFeeds");
        data.remove("completionLog");
        return data;
    }
}
