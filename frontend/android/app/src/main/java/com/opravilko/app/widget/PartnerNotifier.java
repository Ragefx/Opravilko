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
        if (first.shopping) title = PartnerNews.ADDED.equals(first.kind) ? who + L.t(" added to ", " je dodal(a) v ") + list : who + L.t(" bought", " je kupil(a)");
        else title = PartnerNews.ADDED.equals(first.kind) ? who + L.t(" added", " je dodal(a)") : who + L.t(" finished", " je opravil(a)");
        // With push, changes arrive one by one (each item ticked in the shop):
        // while the last notification for this list is still showing, it's
        // updated with the new ones, quietly, instead of buzzing each time.
        String key = first.kind + "|" + first.projectId;
        int id = key.hashCode();
        List<String> titles = new ArrayList<>();
        android.content.SharedPreferences shown = context.getSharedPreferences("opravilko_partner_shown", Context.MODE_PRIVATE);
        boolean stillShowing = isShowing(context, id);
        if (stillShowing) {
            try {
                org.json.JSONArray was = new org.json.JSONArray(shown.getString(key, "[]"));
                for (int i = 0; i < was.length(); i++) titles.add(was.optString(i));
            } catch (org.json.JSONException ignored) {
                // start afresh
            }
        }
        for (PartnerNews.Event e : g) if (!titles.contains(e.title)) titles.add(e.title);
        shown.edit().putString(key, new org.json.JSONArray(titles).toString()).apply();
        StringBuilder body = new StringBuilder();
        for (String t : titles) {
            if (body.length() > 0) body.append(", ");
            body.append(t);
        }

        // Tapping opens the list (shopping), the one task, or the project.
        String link;
        if (first.shopping) link = "opravilko://open?view=shopping";
        else if (g.size() == 1 && PartnerNews.ADDED.equals(first.kind))
            link = "opravilko://open?task=" + Uri.encode(first.taskId) + "&project=" + Uri.encode(first.projectId);
        else link = "opravilko://open?view=" + Uri.encode("project:" + first.projectId);
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent tap = PendingIntent.getActivity(context, id, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_opravilko)
                .setContentTitle(title)
                .setContentText(body.toString())
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body.toString()))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setOnlyAlertOnce(stillShowing)
                .setContentIntent(tap);
        try {
            NotificationManagerCompat.from(context).notify(id, builder.build());
        } catch (SecurityException ignored) {
            // Notifications not allowed.
        }
    }

    private static boolean isShowing(Context context, int id) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return false;
        for (android.service.notification.StatusBarNotification n : nm.getActiveNotifications()) {
            if (n.getId() == id) return true;
        }
        return false;
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, L.t("From your partner", "Od partnerja"), NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription(L.t("When your partner adds to or ticks off your shared lists", "Ko partner kaj doda na skupne sezname ali odkljuka"));
        nm.createNotificationChannel(channel);
    }
}
