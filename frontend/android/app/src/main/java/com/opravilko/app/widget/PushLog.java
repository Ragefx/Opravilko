package com.opravilko.app.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * The last few nudges this phone sent and received, and how they went, for
 * Settings > About > Instant updates (so a nudge that didn't arrive can be
 * traced to the phone that sent it or the one that should have got it).
 */
final class PushLog {
    private static final String PREFS = "opravilko_push_log";
    private static final int KEEP = 30;

    private PushLog() {}

    static synchronized void add(Context context, String line) {
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray was;
        try {
            was = new JSONArray(prefs.getString("lines", "[]"));
        } catch (org.json.JSONException e) {
            was = new JSONArray();
        }
        JSONArray next = new JSONArray();
        next.put(new SimpleDateFormat("d.M. HH:mm:ss", Locale.US).format(new Date()) + "  " + line);
        for (int i = 0; i < was.length() && next.length() < KEEP; i++) next.put(was.optString(i));
        prefs.edit().putString("lines", next.toString()).apply();
    }

    static synchronized String read(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("lines", "[]");
    }
}
