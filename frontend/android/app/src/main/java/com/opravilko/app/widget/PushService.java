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
        try {
            WidgetSyncJob.sync(context);
        } catch (Exception e) {
            // Offline for a moment: let the job retry it.
            WidgetSyncJob.schedule(context);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        PushTokens.save(getApplicationContext(), token, true);
    }
}
