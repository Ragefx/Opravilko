package com.opravilko.app.widget;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.opravilko.app.MainActivity;
import com.opravilko.app.R;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * "Maruša added to Shopping: milk, eggs" -- your partner's changes, noticed
 * by the background sync (or the app's data arriving while it's in the
 * background), one notification per list and kind. Nothing while you're in
 * the app: you see it there live.
 */
final class PartnerNotifier {
    private static final String CHANNEL = "partner";
    /** Whether the app is on screen (set by WidgetBridgePlugin). */
    static volatile boolean appInForeground;

    private PartnerNotifier() {}

    /** Compares the tasks before and after, and notifies about what the partner did. */
    static void check(Context context, WidgetStore store, JSONObject before, JSONObject after) {
        if (appInForeground || !store.partnerNewsEnabled()) return;
        List<PartnerNews.Event> events = PartnerNews.diff(before, after);
        if (events.isEmpty()) return;
        String who = PartnerNews.partnerFirstName(after);
        // One notification per list and kind: "added to Shopping", "finished in Home".
        Map<String, List<PartnerNews.Event>> groups = new LinkedHashMap<>();
        for (PartnerNews.Event e : events) {
            String key = e.kind + "|" + e.projectId;
            List<PartnerNews.Event> g = groups.get(key);
            if (g == null) groups.put(key, g = new ArrayList<>());
            g.add(e);
        }
        ensureChannel(context);
        for (List<PartnerNews.Event> g : groups.values()) post(context, after, who, g);
    }

    private static void post(Context context, JSONObject data, String who, List<PartnerNews.Event> g) {
        PartnerNews.Event first = g.get(0);
        String list = PartnerNews.projectName(data, first.projectId);
        String title;
        if (first.shopping) title = PartnerNews.ADDED.equals(first.kind) ? who + " added to " + list : who + " bought";
        else title = PartnerNews.ADDED.equals(first.kind) ? who + " added" : who + " finished";
        StringBuilder body = new StringBuilder();
        for (PartnerNews.Event e : g) {
            if (body.length() > 0) body.append(", ");
            body.append(e.title);
        }

        // Tapping opens the list (shopping), the one task, or the project.
        String link;
        if (first.shopping) link = "opravilko://open?view=shopping";
        else if (g.size() == 1 && PartnerNews.ADDED.equals(first.kind))
            link = "opravilko://open?task=" + Uri.encode(first.taskId) + "&project=" + Uri.encode(first.projectId);
        else link = "opravilko://open?view=" + Uri.encode("project:" + first.projectId);
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int id = (first.kind + "|" + first.projectId + "|" + System.currentTimeMillis()).hashCode();
        PendingIntent tap = PendingIntent.getActivity(context, id, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_opravilko)
                .setContentTitle(title)
                .setContentText(body.toString())
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body.toString()))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(tap);
        try {
            NotificationManagerCompat.from(context).notify(id, builder.build());
        } catch (SecurityException ignored) {
            // Notifications not allowed.
        }
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "From your partner", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("When your partner adds to or ticks off your shared lists");
        nm.createNotificationChannel(channel);
    }
}
