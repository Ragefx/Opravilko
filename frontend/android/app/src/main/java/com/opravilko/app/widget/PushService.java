package com.opravilko.app.widget;

import android.content.Context;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * A nudge from the helper (your partner changed something shared): fetch
 * the latest now. The sync updates the widget and shows the usual "Maruša
 * added to Shopping" notification (PartnerNotifier), as the regular
 * 15-minute check would, only straight away.
 */
public class PushService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        if (!"sync".equals(message.getData().get("kind"))) return;
        Context context = getApplicationContext();
        boolean full = "1".equals(message.getData().get("full"));
        PushLog.add(context, "Nudge received" + (full ? " (something deleted: full fetch)" : ""));
        // A deletion leaves nothing for the changes-only fetch to find: fetch everything.
        if (full) new WidgetStore(context).setFirebaseFull(0);
        try {
            WidgetSyncJob.sync(context);
            PushLog.add(context, "  … list fetched, widget updated");
        } catch (Exception e) {
            // Offline for a moment: let the job retry it.
            PushLog.add(context, "  … fetch failed (" + e.getMessage() + "), trying again shortly");
            WidgetSyncJob.schedule(context);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        PushTokens.save(getApplicationContext(), token, true);
    }
}
