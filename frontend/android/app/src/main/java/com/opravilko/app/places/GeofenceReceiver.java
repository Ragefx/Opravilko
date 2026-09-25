package com.opravilko.app.places;

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

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;
import com.opravilko.app.MainActivity;
import com.opravilko.app.R;
import com.opravilko.app.widget.ShopArrival;

import org.json.JSONObject;

import java.util.List;

/** Woken by Android when you arrive at a watched place: shows the task as a notification. */
public class GeofenceReceiver extends BroadcastReceiver {
    private static final String CHANNEL = "arrivals";

    @Override
    public void onReceive(Context context, Intent intent) {
        GeofencingEvent event = GeofencingEvent.fromIntent(intent);
        if (event == null || event.hasError()) return;
        if (event.getGeofenceTransition() != Geofence.GEOFENCE_TRANSITION_ENTER) return;
        List<Geofence> fences = event.getTriggeringGeofences();
        if (fences == null) return;
        ensureChannel(context);
        for (Geofence fence : fences) {
            JSONObject place = Geofences.find(context, fence.getRequestId());
            if (place == null) continue;
            // One of your shops: what's on the list for it.
            if ("shop".equals(place.optString("kind"))) ShopArrival.notify(context, place.optString("shop"));
            else notify(context, place);
        }
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Arrival reminders", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Tasks to do when you arrive at a place");
        nm.createNotificationChannel(channel);
    }

    private static void notify(Context context, JSONObject place) {
        String taskId = place.optString("id");
        // Tapping opens the task in the app (the same link the widget uses).
        Uri uri = Uri.parse("opravilko://open?task=" + Uri.encode(taskId)
                + "&project=" + Uri.encode(place.optString("projectId", "inbox")));
        Intent open = new Intent(Intent.ACTION_VIEW, uri, context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent tap = PendingIntent.getActivity(context, taskId.hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_opravilko)
                .setContentTitle("📍 " + place.optString("placeName", "You've arrived"))
                .setContentText(place.optString("title"))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(place.optString("title")))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(tap);
        try {
            NotificationManagerCompat.from(context).notify(("arrive:" + taskId).hashCode(), builder.build());
        } catch (SecurityException ignored) {
            // Notifications not allowed.
        }
    }
}
