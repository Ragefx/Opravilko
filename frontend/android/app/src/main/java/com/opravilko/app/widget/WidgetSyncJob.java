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
    /** The every-15-minutes check (Android's shortest), so a partner's changes show up. */
    private static final int PERIODIC_JOB_ID = 47_111;
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

    /**
     * Keeps the widget current on its own: a sync about every 15 minutes (the
     * shortest Android allows; it may run later while the phone sleeps), kept
     * across restarts. Set once; setting it again leaves the running one be.
     */
    public static void schedulePeriodic(Context context) {
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler == null || scheduler.getPendingJob(PERIODIC_JOB_ID) != null) return;
        JobInfo job = new JobInfo.Builder(PERIODIC_JOB_ID, new ComponentName(context, WidgetSyncJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L, 5 * 60 * 1000L)
                .setPersisted(true)
                .build();
        scheduler.schedule(job);
    }

    /** Stops the periodic check. */
    public static void cancelPeriodic(Context context) {
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler != null) scheduler.cancel(PERIODIC_JOB_ID);
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
                    changed |= WidgetStore.applyPending(data, p);
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
     * updated when it was tapped. Then the list itself is read afresh.
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
                if (WidgetStore.OP_CREATE.equals(p.optString("op"))) {
                    JSONObject task = p.getJSONObject("task");
                    firestore.createTask(task.getString("id"), storedTask(task, uid));
                    processed.add(p.optString("id"));
                    continue;
                }
                if (WidgetStore.OP_ATTACH.equals(p.optString("op"))) {
                    if (AttachmentUploader.upload(firestore, p, uid)) processed.add(p.optString("id"));
                    continue;
                }
                if (WidgetStore.OP_EDIT.equals(p.optString("op"))) {
                    firestore.updateTask(p.optString("taskId"), new JSONObject()
                            .put("content", p.optString("content")).put("description", p.optString("description"))
                            .put("updatedAt", p.optString("at")));
                    processed.add(p.optString("id"));
                    continue;
                }
                if (WidgetStore.OP_DELETE.equals(p.optString("op"))) {
                    firestore.deleteTask(p.optString("taskId"));
                    processed.add(p.optString("id"));
                    continue;
                }
                if (WidgetStore.OP_SHOP.equals(p.optString("op"))) {
                    addShopLine(store, firestore, p, uid);
                    processed.add(p.optString("id"));
                    continue;
                }
                JSONObject task = firestore.getTask(taskId);
                if (task == null) {
                    processed.add(p.optString("id")); // deleted meanwhile, or no longer shared
                    continue;
                }
                if (WidgetStore.OP_TODAY.equals(p.optString("op"))) {
                    // Reschedule: only the date moves (if it's still overdue).
                    JSONObject due = task.optJSONObject("due");
                    if (TaskLogic.dueToToday(due)) {
                        firestore.updateTask(taskId, new JSONObject().put("due", due).put("updatedAt", at));
                    }
                    processed.add(p.optString("id"));
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
                        boolean ticked = now.optBoolean("completed") && !prev.optBoolean("completed");
                        if (ticked) {
                            fields.put("completed", true).put("completedAt", now.optString("completedAt", at));
                            if (uid != null) fields.put("completedBy", uid);
                        } else if (now.has("due")) {
                            fields.put("due", now.get("due")); // a repeating task moved to its next date
                        }
                        firestore.updateTask(now.optString("id"), fields);
                        // A shopping item: counts towards the list's usual items, as in the app.
                        if (ticked && isShoppingList(store.getSnapshot(), now.optString("projectId"))) {
                            String name = ShoppingLogic.parse(now.optString("content"))[0];
                            firestore.countBought(now.optString("projectId"), ShoppingLogic.boughtKey(name), name);
                        }
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
        refreshFirebase(context, store, firestore, uid);
    }

    /**
     * Reads the tasks afresh, as the app does (open tasks of every project
     * you're on, plus tasks shared with you), so the widget shows what the
     * other phone added or ticked even while this app is closed.
     */
    private static void refreshFirebase(Context context, WidgetStore store, FirestoreClient firestore, String uid)
            throws IOException {
        if (uid == null) return;
        String myInbox = "inbox_" + uid;
        try {
            JSONArray projects = new JSONArray();
            JSONArray tasks = new JSONArray();
            JSONArray sections = new JSONArray();
            Set<String> seen = new HashSet<>();
            JSONArray found = firestore.whereContains("projects", "members", uid);
            for (int i = 0; i < found.length(); i++) {
                JSONObject p = found.getJSONObject(i);
                String id = p.getString("id");
                // Someone else's Inbox never shows, as in the app.
                if (p.optBoolean("isInboxProject") && !myInbox.equals(id)) continue;
                p.put("id", appProjectId(id, myInbox));
                if (p.has("parentId") && !p.isNull("parentId")) p.put("parentId", appProjectId(p.getString("parentId"), myInbox));
                projects.put(p);
                JSONArray secs = firestore.whereEquals("sections", "projectId", id, false);
                for (int k = 0; k < secs.length(); k++) {
                    JSONObject sec = secs.getJSONObject(k);
                    sec.put("projectId", appProjectId(id, myInbox));
                    sections.put(sec);
                }
                JSONArray open = firestore.whereEquals("tasks", "projectId", id, true);
                for (int k = 0; k < open.length(); k++) addTask(tasks, seen, open.getJSONObject(k), myInbox);
            }
            JSONArray shared = firestore.whereContains("tasks", "sharedWith", uid);
            for (int k = 0; k < shared.length(); k++) {
                JSONObject t = shared.getJSONObject(k);
                if (!t.optBoolean("archived")) addTask(tasks, seen, t, myInbox);
            }

            JSONObject old = store.getSnapshot();
            JSONObject data = old != null ? old : new JSONObject().put("version", 1);
            data.put("projects", sortByOrder(projects));
            data.put("tasks", tasks);
            data.put("sections", sortByOrder(sections));
            store.saveSnapshot(data, true);
            store.setLastRefresh(System.currentTimeMillis());
            TaskWidgetProvider.updateAll(context);
        } catch (JSONException e) {
            throw new IOException(e.getMessage());
        }
    }

    private static void addTask(JSONArray tasks, Set<String> seen, JSONObject t, String myInbox) throws JSONException {
        if (!seen.add(t.getString("id"))) return;
        t.remove("archived");
        t.put("projectId", appProjectId(t.optString("projectId"), myInbox));
        tasks.put(t);
    }

    /** A task as Firestore keeps it: the real Inbox id, not archived, who made it. */
    private static JSONObject storedTask(JSONObject task, String uid) throws JSONException {
        JSONObject doc = new JSONObject(task.toString());
        if ("inbox".equals(doc.optString("projectId")) && uid != null) doc.put("projectId", "inbox_" + uid);
        doc.put("archived", false);
        if (uid != null) doc.put("createdBy", uid);
        return doc;
    }

    /**
     * A shopping line from the widget, against the list as it is now: onto the
     * same item (the amount counts up) or as a new one.
     */
    private static void addShopLine(WidgetStore store, FirestoreClient firestore, JSONObject p, String uid)
            throws IOException, JSONException {
        String projectId = p.getString("projectId");
        String stored = "inbox".equals(projectId) && uid != null ? "inbox_" + uid : projectId;
        JSONArray open = firestore.whereEquals("tasks", "projectId", stored, true);
        for (int i = 0; i < open.length(); i++) open.getJSONObject(i).put("projectId", projectId);
        if (TaskLogic.findTask(open, p.optString("newId")) != null) return; // sent before
        JSONObject snapshot = store.getSnapshot();
        JSONObject guide = snapshot != null ? snapshot.optJSONObject("shoppingGuide") : null;
        String at = p.optString("at");
        JSONObject changed = ShoppingLogic.addLine(guide, open, projectId, p.optString("line"), p.optString("newId"), at,
                WidgetStore.optStringOrNull(p, "meal"), WidgetStore.optStringOrNull(p, "store"));
        if (changed == null) return;
        if (changed.optString("id").equals(p.optString("newId"))) {
            firestore.createTask(changed.getString("id"), storedTask(changed, uid));
        } else {
            firestore.updateTask(changed.getString("id"), new JSONObject().put("content", changed.getString("content"))
                    .put("description", changed.optString("description", "")).put("updatedAt", at));
        }
    }

    private static boolean isShoppingList(JSONObject snapshot, String projectId) {
        JSONObject project = TaskLogic.findProject(snapshot, projectId);
        return project != null && "shopping".equals(project.optString("viewStyle"));
    }

    /** The app calls your own Inbox just "inbox". */
    private static String appProjectId(String id, String myInbox) {
        return myInbox.equals(id) ? "inbox" : id;
    }

    private static JSONArray sortByOrder(JSONArray items) throws JSONException {
        java.util.List<JSONObject> list = new java.util.ArrayList<>();
        for (int i = 0; i < items.length(); i++) list.add(items.getJSONObject(i));
        list.sort((a, b) -> Double.compare(a.optDouble("order", 0), b.optDouble("order", 0)));
        return new JSONArray(list);
    }

    /** The widget has no use for calendar events or the completion history. */
    static JSONObject stripForWidget(JSONObject data) {
        data.remove("calendarEvents");
        data.remove("calendarFeeds");
        data.remove("completionLog");
        return data;
    }
}
