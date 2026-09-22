package com.opravilko.app.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Everything the widget knows, kept in the app's private SharedPreferences:
 * the latest task data (pushed by the app, or downloaded by the sync job),
 * the Dropbox credentials the app shares with it, completions tapped in the
 * widget that haven't reached Dropbox yet, and which view each widget shows.
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
                TaskLogic.complete(data, p.optString("taskId"), optStringOrNull(p, "dueDate"), p.optString("at"));
            }
        }
        prefs.edit().putString(KEY_SNAPSHOT, data.toString()).apply();
    }

    // ---- completions waiting to reach Dropbox ----

    public synchronized JSONArray getPending() {
        try {
            return new JSONArray(prefs.getString(KEY_PENDING, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    public synchronized void addPending(String taskId, String dueDate, String at) {
        JSONArray pending = getPending();
        try {
            JSONObject entry = new JSONObject();
            entry.put("id", taskId + "@" + at);
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
        return getAppKey() != null && getRefreshToken() != null;
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
