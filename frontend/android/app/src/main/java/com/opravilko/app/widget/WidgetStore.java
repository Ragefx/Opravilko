package com.opravilko.app.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Everything the widget knows, kept in the app's private SharedPreferences:
 * the latest task data (pushed by the app, or downloaded by the sync job),
 * the sign-in the app shares with it (Dropbox, or Firebase with Google
 * sign-in), completions tapped in the widget that haven't been saved yet, and
 * which view each widget shows.
 */
public final class WidgetStore {
    private static final String PREFS = "opravilko_widget";
    private static final String KEY_SNAPSHOT = "snapshot";
    private static final String KEY_PENDING = "pending";
    private static final String KEY_APP_KEY = "appKey";
    private static final String KEY_REFRESH_TOKEN = "refreshToken";
    private static final String KEY_DATA_PATH = "dataPath";
    private static final String KEY_ACCESS_TOKEN = "accessToken";
    private static final String KEY_ACCESS_EXPIRES = "accessExpires";
    private static final String KEY_LAST_REFRESH = "lastRefresh";
    private static final String KEY_BACKEND = "backend";
    private static final String KEY_FB_API_KEY = "fbApiKey";
    private static final String KEY_FB_PROJECT = "fbProjectId";
    private static final String KEY_FB_REFRESH = "fbRefreshToken";
    private static final String KEY_FB_UID = "fbUid";
    private static final String KEY_FB_ID_TOKEN = "fbIdToken";
    private static final String KEY_FB_ID_EXPIRES = "fbIdExpires";
    private static final String KEY_REMINDERS = "remindersOn";

    public static final String VIEW_TODAY = "today";
    public static final String VIEW_UPCOMING = "upcoming";
    public static final String VIEW_INBOX = "inbox";
    public static final String PROJECT_PREFIX = "project:";

    private final SharedPreferences prefs;

    public WidgetStore(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---- task data ----

    public JSONObject getSnapshot() {
        String raw = prefs.getString(KEY_SNAPSHOT, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    /**
     * Stores fresh task data. Completions made in the widget that haven't
     * synced yet are re-applied on top, so they don't reappear in the list
     * when the app pushes data that predates them.
     */
    public synchronized void saveSnapshot(JSONObject data, boolean reapplyPending) {
        if (reapplyPending) {
            JSONArray pending = getPending();
            for (int i = 0; i < pending.length(); i++) {
                JSONObject p = pending.optJSONObject(i);
                if (p == null) continue;
                applyPending(data, p);
            }
        }
        prefs.edit().putString(KEY_SNAPSHOT, data.toString()).apply();
    }

    /** A queued change: a tick ("complete", the default) or "Reschedule" ("today"). */
    public static final String OP_TODAY = "today";
    /** A task made in the widget's Add task box: {task}. */
    public static final String OP_CREATE = "create";
    /** A line added to a shopping list from the widget: {projectId, line, newId, meal?, store?}. */
    public static final String OP_SHOP = "shop";
    /** A file attached in the widget's Add task card (Google sign-in only): {taskId, attId, path, name, type}. */
    public static final String OP_ATTACH = "attach";
    /** An item (task) edited in the widget: {taskId, content, description}. */
    public static final String OP_EDIT = "edit";
    /** An item (task) deleted in the widget: {taskId}. */
    public static final String OP_DELETE = "delete";

    static boolean applyPending(JSONObject data, JSONObject p) {
        String op = p.optString("op");
        if (OP_TODAY.equals(op)) return TaskLogic.moveToToday(data, p.optString("taskId"), p.optString("at"));
        if (OP_CREATE.equals(op)) return addTaskIfMissing(data, p.optJSONObject("task"));
        if (OP_EDIT.equals(op)) {
            JSONObject t = TaskLogic.findTask(data.optJSONArray("tasks"), p.optString("taskId"));
            if (t == null) return false;
            try {
                t.put("content", p.optString("content")).put("description", p.optString("description"))
                        .put("updatedAt", p.optString("at"));
            } catch (JSONException e) {
                return false;
            }
            return true;
        }
        if (OP_DELETE.equals(op)) {
            JSONArray tasks = data.optJSONArray("tasks");
            if (tasks == null) return false;
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject t = tasks.optJSONObject(i);
                if (t != null && p.optString("taskId").equals(t.optString("id"))) {
                    tasks.remove(i);
                    return true;
                }
            }
            return false;
        }
        if (OP_SHOP.equals(op)) {
            JSONArray tasks = data.optJSONArray("tasks");
            if (tasks == null) return false;
            // Already there (made by an earlier sync of this same line)? Then nothing to do.
            if (TaskLogic.findTask(tasks, p.optString("newId")) != null) return false;
            return ShoppingLogic.addLine(data.optJSONObject("shoppingGuide"), tasks, p.optString("projectId"),
                    p.optString("line"), p.optString("newId"), p.optString("at"), optStringOrNull(p, "meal"),
                    optStringOrNull(p, "store")) != null;
        }
        String taskId = p.optString("taskId");
        JSONObject before = TaskLogic.findTask(data.optJSONArray("tasks"), taskId);
        boolean wasOpen = before != null && !before.optBoolean("completed");
        boolean changed = TaskLogic.complete(data, taskId, optStringOrNull(p, "dueDate"), p.optString("at"));
        // A shopping item ticked off counts towards the list's "usual items", as in the app.
        if (changed && wasOpen) ShoppingLogic.countBought(data, taskId);
        return changed;
    }

    // ---- completions waiting to reach Dropbox ----

    public synchronized JSONArray getPending() {
        try {
            return new JSONArray(prefs.getString(KEY_PENDING, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static boolean addTaskIfMissing(JSONObject data, JSONObject task) {
        if (task == null) return false;
        try {
            JSONArray tasks = data.optJSONArray("tasks");
            if (tasks == null) {
                tasks = new JSONArray();
                data.put("tasks", tasks);
            }
            if (TaskLogic.findTask(tasks, task.optString("id")) != null) return false;
            tasks.put(new JSONObject(task.toString()));
            return true;
        } catch (JSONException e) {
            return false;
        }
    }

    /** Queues a change made in the widget (a new task, a shopping line) for the sync job. */
    public synchronized void addPendingOp(JSONObject entry) {
        JSONArray pending = getPending();
        pending.put(entry);
        prefs.edit().putString(KEY_PENDING, pending.toString()).apply();
    }

    public synchronized void addPending(String taskId, String dueDate, String at) {
        addPending(taskId, dueDate, at, null);
    }

    public synchronized void addPending(String taskId, String dueDate, String at, String op) {
        JSONArray pending = getPending();
        try {
            JSONObject entry = new JSONObject();
            entry.put("id", taskId + "@" + at + (op != null ? "#" + op : ""));
            if (op != null) entry.put("op", op);
            entry.put("taskId", taskId);
            if (dueDate != null) entry.put("dueDate", dueDate);
            entry.put("at", at);
            pending.put(entry);
        } catch (JSONException ignored) {
            return;
        }
        prefs.edit().putString(KEY_PENDING, pending.toString()).apply();
    }

    /** Drops the entries (by id) that the sync job has written to Dropbox. */
    public synchronized void removePending(java.util.Set<String> ids) {
        JSONArray pending = getPending();
        JSONArray kept = new JSONArray();
        for (int i = 0; i < pending.length(); i++) {
            JSONObject p = pending.optJSONObject(i);
            if (p != null && !ids.contains(p.optString("id"))) kept.put(p);
        }
        prefs.edit().putString(KEY_PENDING, kept.toString()).apply();
    }

    // ---- Dropbox credentials (shared by the app) ----

    public void setAuth(String appKey, String refreshToken, String dataPath) {
        SharedPreferences.Editor e = prefs.edit()
                .putString(KEY_BACKEND, "dropbox")
                .putString(KEY_APP_KEY, appKey)
                .putString(KEY_DATA_PATH, dataPath);
        // A different account/token invalidates the cached access token.
        if (refreshToken == null || !refreshToken.equals(prefs.getString(KEY_REFRESH_TOKEN, null))) {
            e.remove(KEY_ACCESS_TOKEN).remove(KEY_ACCESS_EXPIRES);
        }
        e.putString(KEY_REFRESH_TOKEN, refreshToken).apply();
    }

    public String getAppKey() { return prefs.getString(KEY_APP_KEY, null); }
    public String getRefreshToken() { return prefs.getString(KEY_REFRESH_TOKEN, null); }
    public String getDataPath() { return prefs.getString(KEY_DATA_PATH, "/opravilko-data.json"); }

    public boolean hasAuth() {
        return isFirebase() || (getAppKey() != null && getRefreshToken() != null);
    }

    // ---- Firebase sign-in (shared by the app when it uses Google sign-in) ----

    public void setFirebaseAuth(String apiKey, String projectId, String refreshToken, String uid) {
        SharedPreferences.Editor e = prefs.edit()
                .putString(KEY_BACKEND, "firebase")
                .putString(KEY_FB_API_KEY, apiKey)
                .putString(KEY_FB_PROJECT, projectId)
                .putString(KEY_FB_UID, uid);
        // A different account/token invalidates the cached ID token.
        if (refreshToken == null || !refreshToken.equals(prefs.getString(KEY_FB_REFRESH, null))) {
            e.remove(KEY_FB_ID_TOKEN).remove(KEY_FB_ID_EXPIRES);
        }
        e.putString(KEY_FB_REFRESH, refreshToken).apply();
    }

    public boolean isFirebase() {
        return "firebase".equals(prefs.getString(KEY_BACKEND, null)) && getFirebaseRefreshToken() != null;
    }

    public String getFirebaseApiKey() { return prefs.getString(KEY_FB_API_KEY, null); }
    public String getFirebaseProjectId() { return prefs.getString(KEY_FB_PROJECT, null); }
    public String getFirebaseRefreshToken() { return prefs.getString(KEY_FB_REFRESH, null); }
    public String getFirebaseUid() { return prefs.getString(KEY_FB_UID, null); }

    public void setFirebaseRefreshToken(String token) {
        prefs.edit().putString(KEY_FB_REFRESH, token).apply();
    }

    public String getCachedFirebaseIdToken() {
        long expires = prefs.getLong(KEY_FB_ID_EXPIRES, 0);
        if (System.currentTimeMillis() > expires - 60_000) return null;
        return prefs.getString(KEY_FB_ID_TOKEN, null);
    }

    public void setFirebaseIdToken(String token, long expiresAt) {
        prefs.edit().putString(KEY_FB_ID_TOKEN, token).putLong(KEY_FB_ID_EXPIRES, expiresAt).apply();
    }

    public String getCachedAccessToken() {
        long expires = prefs.getLong(KEY_ACCESS_EXPIRES, 0);
        if (System.currentTimeMillis() > expires - 60_000) return null;
        return prefs.getString(KEY_ACCESS_TOKEN, null);
    }

    public void setAccessToken(String token, long expiresAt) {
        prefs.edit().putString(KEY_ACCESS_TOKEN, token).putLong(KEY_ACCESS_EXPIRES, expiresAt).apply();
    }

    public long getLastRefresh() { return prefs.getLong(KEY_LAST_REFRESH, 0); }
    public void setLastRefresh(long at) { prefs.edit().putLong(KEY_LAST_REFRESH, at).apply(); }

    /** Task reminders on this phone (Settings in the app); on unless switched off. */
    public boolean remindersEnabled() { return prefs.getBoolean(KEY_REMINDERS, true); }

    public void setRemindersEnabled(boolean on) { prefs.edit().putBoolean(KEY_REMINDERS, on).apply(); }

    /** Signing out of Dropbox in the app: forget everything. */
    public void clearAll() {
        prefs.edit().clear().apply();
    }

    // ---- per-widget view ----

    public String getView(int appWidgetId) {
        return prefs.getString("view_" + appWidgetId, VIEW_TODAY);
    }

    public void setView(int appWidgetId, String view) {
        prefs.edit().putString("view_" + appWidgetId, view).apply();
    }

    public void removeView(int appWidgetId) {
        prefs.edit().remove("view_" + appWidgetId).apply();
    }

    static String optStringOrNull(JSONObject o, String key) {
        return o.has(key) && !o.isNull(key) ? o.optString(key) : null;
    }
}
