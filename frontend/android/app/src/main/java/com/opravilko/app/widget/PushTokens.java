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
 * so the helper knows where to send a nudge. Refreshed twice a day, or
 * whenever it changes.
 */
final class PushTokens {
    private static final String PREFS = "opravilko_push";
    // Twice a day: a phone the helper had to forget is back within hours.
    private static final long REFRESH_MS = 12L * 60 * 60 * 1000;

    private PushTokens() {}

    /** Called when the app hands over the sign-in: makes sure this phone is registered. */
    static void register(Context context) {
        WidgetStore store = new WidgetStore(context);
        if (!store.isFirebase() || store.getFirebaseUid() == null) return;
        try {
            FirebaseMessaging.getInstance().getToken()
                    .addOnSuccessListener(token -> save(context, token, false))
                    .addOnFailureListener(e -> failed(context, e.getMessage()));
        } catch (RuntimeException e) {
            // Firebase messaging not available on this phone (no Google services).
            failed(context, e.getMessage());
        }
    }

    /** Written to the log (Settings > About), at most once an hour, so it can be seen why. */
    private static void failed(Context context, String why) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (now - prefs.getLong("failedAt", 0) < 60 * 60 * 1000L) return;
        prefs.edit().putLong("failedAt", now).apply();
        PushLog.add(context, "This phone couldn't get its nudge address from Google: " + why);
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
                PushLog.add(app, "This phone is registered for nudges");
            } catch (JSONException | java.io.IOException e) {
                // Tried again on the next start.
                PushLog.add(app, "Registering for nudges failed: " + e.getMessage());
            }
        }, "opravilko-push-token").start();
    }
}
