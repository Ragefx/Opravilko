package com.opravilko.app.places;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The places to remind about on arrival -- tasks with a location and "Remind
 * me when I arrive" -- kept in the app's preferences and handed to Android's
 * geofencing (Google Play services), which watches them in the background
 * with little battery use and wakes GeofenceReceiver on arrival.
 */
final class Geofences {
    private static final String PREFS = "opravilko_places";
    private static final String KEY_PLACES = "places";
    /** How close counts as "arrived", in metres. */
    private static final float RADIUS_M = 150f;
    /** Android allows at most 100 geofences per app. */
    private static final int MAX = 100;

    private Geofences() {}

    static void save(Context context, String placesJson) {
        prefs(context).edit().putString(KEY_PLACES, placesJson).apply();
    }

    static JSONArray load(Context context) {
        try {
            return new JSONArray(prefs(context).getString(KEY_PLACES, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** One place (task) by its id, as the app described it. */
    static JSONObject find(Context context, String id) {
        JSONArray places = load(context);
        for (int i = 0; i < places.length(); i++) {
            JSONObject p = places.optJSONObject(i);
            if (p != null && id.equals(p.optString("id"))) return p;
        }
        return null;
    }

    static boolean hasLocation(Context context) {
        return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    /** Watching in the background needs "Allow all the time" (Android 10+). */
    static boolean hasBackground(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return hasLocation(context);
        return context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    /** Replaces the watched places with the saved list; returns how many are watched. */
    @SuppressLint("MissingPermission") // checked just below
    static int register(Context context) {
        Context app = context.getApplicationContext();
        GeofencingClient client = LocationServices.getGeofencingClient(app);
        PendingIntent intent = pendingIntent(app);
        if (!hasLocation(app) || !hasBackground(app)) {
            client.removeGeofences(intent);
            return 0;
        }
        List<Geofence> fences = new ArrayList<>();
        JSONArray places = load(app);
        for (int i = 0; i < places.length() && fences.size() < MAX; i++) {
            JSONObject p = places.optJSONObject(i);
            if (p == null || !p.has("lat") || !p.has("lng")) continue;
            fences.add(new Geofence.Builder()
                    .setRequestId(p.optString("id"))
                    .setCircularRegion(p.optDouble("lat"), p.optDouble("lng"), RADIUS_M)
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                    .setNotificationResponsiveness(60_000)
                    .build());
        }
        if (fences.isEmpty()) {
            client.removeGeofences(intent);
            return 0;
        }
        // No alert for a place you're already at when the reminder is turned on.
        GeofencingRequest request = new GeofencingRequest.Builder()
                .setInitialTrigger(0)
                .addGeofences(fences)
                .build();
        client.removeGeofences(intent).addOnCompleteListener(done -> {
            try {
                client.addGeofences(request, intent);
            } catch (SecurityException ignored) {
                // Permission taken away meanwhile: nothing to watch.
            }
        });
        return fences.size();
    }

    private static PendingIntent pendingIntent(Context context) {
        Intent intent = new Intent(context, GeofenceReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        // Play services adds the geofence details to this intent, so it must be mutable.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        return PendingIntent.getBroadcast(context, 0, intent, flags);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
