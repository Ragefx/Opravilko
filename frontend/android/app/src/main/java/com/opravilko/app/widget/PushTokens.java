package com.opravilko.app.widget;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.UUID;

/**
 * This phone's push address, kept in your account (users/{uid}/devices/{id})
 * so the helper knows where to send a nudge. Refreshed about once a week, or
 * whenever it changes.
 */
final class PushTokens {
    private static final String PREFS = "opravilko_push";
    private static final long REFRESH_MS = 7L * 24 * 60 * 60 * 1000;

    private PushTokens() {}

    /** Called when the app hands over the sign-in: makes sure this phone is registered. */
    static void register(Context context) {
        WidgetStore store = new WidgetStore(context);
        if (!store.isFirebase() || store.getFirebaseUid() == null) return;
        try {
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> save(context, token, false));
        } catch (RuntimeException e) {
            // Firebase messaging not available on this phone (no Google services).
        }
    }

    private static String nowIso() {
        java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US);
        f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return f.format(new java.util.Date());
    }

    static void save(Context context, String token, boolean force) {
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            WidgetStore store = new WidgetStore(app);
            String uid = store.getFirebaseUid();
            if (!store.isFirebase() || uid == null || token == null) return;
            SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String device = prefs.getString("device", null);
            if (device == null) {
                device = UUID.randomUUID().toString();
                prefs.edit().putString("device", device).apply();
            }
            boolean same = token.equals(prefs.getString("token", null)) && uid.equals(prefs.getString("uid", null));
            if (!force && same && System.currentTimeMillis() - prefs.getLong("at", 0) < REFRESH_MS) return;
            try {
                JSONObject doc = new JSONObject()
                        .put("token", token)
                        .put("model", Build.MANUFACTURER + " " + Build.MODEL)
                        .put("updatedAt", nowIso());
                new FirestoreClient(store).setDocument("users/" + uid + "/devices/" + device, doc);
                prefs.edit().putString("token", token).putString("uid", uid)
                        .putLong("at", System.currentTimeMillis()).apply();
            } catch (JSONException | java.io.IOException e) {
                // Tried again on the next start.
            }
        }, "opravilko-push-token").start();
    }
}
