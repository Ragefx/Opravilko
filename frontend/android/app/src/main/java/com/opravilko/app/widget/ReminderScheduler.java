package com.opravilko.app.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONObject;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Hands the next task reminders to Android's alarm clock, from the widget's
 * copy of the tasks. Rebuilt whenever that copy changes: the app pushing its
 * data, the widget's own sync every ~15 minutes (so reminders set on the
 * website arrive with the app closed), a tick from a notification, a restart.
 */
public final class ReminderScheduler {
    private static final String PREFS = "opravilko_reminders";
    private static final String KEY_CODES = "codes";
    private static final long HORIZON_MS = 30L * 24 * 60 * 60 * 1000;
    private static final int MAX = 60;

    private ReminderScheduler() {}

    public static void reschedule(Context context) {
        Context ctx = context.getApplicationContext();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        WidgetStore store = new WidgetStore(ctx);
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> old = new HashSet<>(prefs.getStringSet(KEY_CODES, new HashSet<>()));

        JSONObject data = store.getSnapshot();
        List<ReminderLogic.Upcoming> next = store.remindersEnabled() && data != null
                ? ReminderLogic.upcoming(data, store.getFirebaseUid(), System.currentTimeMillis(), HORIZON_MS, MAX)
                : java.util.Collections.emptyList();

        Set<String> codes = new HashSet<>();
        for (ReminderLogic.Upcoming u : next) {
            int code = u.code();
            codes.add(String.valueOf(code));
            Intent fire = new Intent(ctx, ReminderReceiver.class).setAction(ReminderReceiver.ACTION_FIRE)
                    .putExtra(ReminderReceiver.EXTRA_TASK_ID, u.taskId)
                    .putExtra(ReminderReceiver.EXTRA_REMINDER_ID, u.reminderId)
                    .putExtra(ReminderReceiver.EXTRA_AT, u.at);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, code, fire,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            setAlarm(am, u.at, pi);
        }
        // Ones no longer wanted (removed, moved, ticked off): cancel.
        for (String c : old) {
            if (codes.contains(c)) continue;
            try {
                Intent fire = new Intent(ctx, ReminderReceiver.class).setAction(ReminderReceiver.ACTION_FIRE);
                PendingIntent pi = PendingIntent.getBroadcast(ctx, Integer.parseInt(c), fire,
                        PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
                if (pi != null) {
                    am.cancel(pi);
                    pi.cancel();
                }
            } catch (NumberFormatException ignored) {
                // bad entry: dropped
            }
        }
        prefs.edit().putStringSet(KEY_CODES, codes).apply();
    }

    /** On time to the minute where Android allows it (it does for reminder apps), else close to it. */
    static void setAlarm(AlarmManager am, long at, PendingIntent pi) {
        boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
        try {
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }
}
