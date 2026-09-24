package com.opravilko.app.places;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.opravilko.app.widget.ReminderScheduler;

/**
 * Android forgets geofences and alarms on restart (and geofences on app
 * updates): watch the places and set the task reminders again. A new time
 * zone or clock moves "on the day at 9:00" reminders, so those reschedule too.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Geofences.register(context);
        }
        ReminderScheduler.reschedule(context);
    }
}
