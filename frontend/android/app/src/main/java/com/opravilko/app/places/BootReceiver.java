package com.opravilko.app.places;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Android forgets geofences on restart and app updates: watch the places again. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Geofences.register(context);
        }
    }
}
