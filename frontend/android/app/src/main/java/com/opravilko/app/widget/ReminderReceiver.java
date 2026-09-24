package com.opravilko.app.widget;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.opravilko.app.MainActivity;
import com.opravilko.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * A task reminder going off: shows the task, with Done and Snooze. Done ticks
 * it off the way the widget does (saved to the tasks by the widget's sync, app
 * closed or not); a tap opens the task in the app.
 */
public class ReminderReceiver extends BroadcastReceiver {
    static final String ACTION_FIRE = "com.opravilko.app.reminder.FIRE";
    static final String ACTION_DONE = "com.opravilko.app.reminder.DONE";
    static final String ACTION_SNOOZE = "com.opravilko.app.reminder.SNOOZE";
    static final String EXTRA_TASK_ID = "taskId";
    static final String EXTRA_REMINDER_ID = "reminderId";
    static final String EXTRA_AT = "at";
    static final String EXTRA_SNOOZED = "snoozed";
    static final String EXTRA_MINUTES = "minutes";
    private static final String CHANNEL = "reminders";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String taskId = intent.getStringExtra(EXTRA_TASK_ID);
        if (action == null || taskId == null) return;
        WidgetStore store = new WidgetStore(context);
        JSONObject data = store.getSnapshot();
        JSONArray tasks = data != null ? data.optJSONArray("tasks") : null;
        JSONObject task = tasks != null ? TaskLogic.findTask(tasks, taskId) : null;

        if (ACTION_FIRE.equals(action)) {
            // Skip if it was ticked off, deleted or the reminder changed since it was set.
            boolean snoozed = intent.getBooleanExtra(EXTRA_SNOOZED, false);
            if (task == null || task.optBoolean("completed")) return;
            if (!snoozed && !ReminderLogic.stillDue(task, String.valueOf(intent.getStringExtra(EXTRA_REMINDER_ID)),
                    intent.getLongExtra(EXTRA_AT, 0))) return;
            if (!store.remindersEnabled()) return;
            show(context, task);
            // The next batch (only the soonest are handed to Android at a time).
            ReminderScheduler.reschedule(context);
        } else if (ACTION_DONE.equals(action)) {
            NotificationManagerCompat.from(context).cancel(notificationId(taskId));
            if (task == null || task.optBoolean("completed")) return;
            JSONObject due = task.optJSONObject("due");
            WidgetActionActivity.completeTask(context, taskId, due != null ? due.optString("date", null) : null);
        } else if (ACTION_SNOOZE.equals(action)) {
            NotificationManagerCompat.from(context).cancel(notificationId(taskId));
            int minutes = intent.getIntExtra(EXTRA_MINUTES, 15);
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent fire = new Intent(context, ReminderReceiver.class).setAction(ACTION_FIRE)
                    .putExtra(EXTRA_TASK_ID, taskId)
                    .putExtra(EXTRA_SNOOZED, true);
            PendingIntent pi = PendingIntent.getBroadcast(context, ("snooze|" + taskId).hashCode(), fire,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            ReminderScheduler.setAlarm(am, System.currentTimeMillis() + minutes * 60_000L, pi);
        }
    }

    static int notificationId(String taskId) {
        return ("remind:" + taskId).hashCode();
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Task reminders", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Reminders you add to tasks");
        nm.createNotificationChannel(channel);
    }

    private static PendingIntent action(Context context, String action, String taskId, int minutes) {
        Intent i = new Intent(context, ReminderReceiver.class).setAction(action)
                .putExtra(EXTRA_TASK_ID, taskId)
                .putExtra(EXTRA_MINUTES, minutes);
        return PendingIntent.getBroadcast(context, (action + "|" + minutes + "|" + taskId).hashCode(), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void show(Context context, JSONObject task) {
        ensureChannel(context);
        String taskId = task.optString("id");
        String title = task.optString("content", "Task");
        // Tapping opens the task in the app (the same link the widget uses).
        Uri uri = Uri.parse("opravilko://open?task=" + Uri.encode(taskId)
                + "&project=" + Uri.encode(task.optString("projectId", "inbox")));
        Intent open = new Intent(Intent.ACTION_VIEW, uri, context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent tap = PendingIntent.getActivity(context, notificationId(taskId), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_opravilko)
                .setContentTitle(title)
                .setContentText(ReminderLogic.dueText(task, System.currentTimeMillis()))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(tap)
                .addAction(R.drawable.ic_stat_opravilko, "Done", action(context, ACTION_DONE, taskId, 0))
                .addAction(R.drawable.ic_stat_opravilko, "Snooze 15 min", action(context, ACTION_SNOOZE, taskId, 15))
                .addAction(R.drawable.ic_stat_opravilko, "1 h", action(context, ACTION_SNOOZE, taskId, 60));
        try {
            NotificationManagerCompat.from(context).notify(notificationId(taskId), builder.build());
        } catch (SecurityException ignored) {
            // Notifications not allowed.
        }
    }
}
