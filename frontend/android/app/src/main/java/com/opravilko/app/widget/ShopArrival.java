package com.opravilko.app.widget;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.opravilko.app.MainActivity;
import com.opravilko.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Arriving at one of your shops (pinned in the app's shopping list): shows
 * what to buy there -- that shop's items, then those for any shop -- from
 * the widget's copy of the list. Once per shop in a while, and not at all
 * when there's nothing to buy.
 */
public final class ShopArrival {
    private static final String CHANNEL = "arrivals";
    private static final String PREFS = "opravilko_shop_arrivals";
    /** Not again for the same shop within this long (in and out of the car park...). */
    private static final long QUIET_MS = 90 * 60 * 1000L;

    private ShopArrival() {}

    /** The items to buy at `shop`: its own first, then those for any shop. */
    static List<String> itemsFor(JSONObject data, String shop) {
        List<String> own = new ArrayList<>();
        List<String> any = new ArrayList<>();
        JSONArray tasks = data != null ? data.optJSONArray("tasks") : null;
        if (tasks == null) return own;
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t == null || t.optBoolean("completed")) continue;
            if (!PartnerNews.isShopping(data, t.optString("projectId"))) continue;
            String store = ShoppingLogic.storeOf(t.optString("description", ""));
            String name = ShoppingLogic.parse(t.optString("content"))[0];
            if (store == null) any.add(name);
            else if (store.equalsIgnoreCase(shop)) own.add(name);
        }
        own.addAll(any);
        return own;
    }

    public static void notify(Context context, String shop) {
        if (shop == null || shop.isEmpty()) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        String key = shop.toLowerCase();
        if (now - prefs.getLong(key, 0) < QUIET_MS) return;
        List<String> items = itemsFor(new WidgetStore(context).getSnapshot(), shop);
        if (items.isEmpty()) return;
        prefs.edit().putLong(key, now).apply();

        ensureChannel(context);
        Uri uri = Uri.parse("opravilko://open?view=shopping&shop=" + Uri.encode(shop));
        Intent open = new Intent(Intent.ACTION_VIEW, uri, context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int id = ("shop:" + key).hashCode();
        PendingIntent tap = PendingIntent.getActivity(context, id, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String body = String.join(", ", items);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_opravilko)
                .setContentTitle("🛒 At " + shop + " · " + items.size() + " to buy")
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
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
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Arrival reminders", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Tasks to do when you arrive at a place");
        nm.createNotificationChannel(channel);
    }
}
