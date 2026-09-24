package com.opravilko.app.widget;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * The app's side of the widget: the web app hands over its task data and
 * sign-in (Dropbox, or Firebase with Google sign-in) here, and hears back
 * when the widget changed the Dropbox file.
 */
@CapacitorPlugin(name = "OpravilkoWidget")
public class WidgetBridgePlugin extends Plugin {
    @Override
    public void load() {
        WidgetEvents.setListener(() -> notifyListeners("dataChanged", new JSObject()));
    }

    @Override
    protected void handleOnDestroy() {
        WidgetEvents.setListener(null);
    }

    /** data: the AppData JSON as a string; plus appKey, refreshToken, dataPath. */
    @PluginMethod
    public void update(PluginCall call) {
        String json = call.getString("data");
        if (json == null) {
            call.reject("data is required");
            return;
        }
        WidgetStore store = new WidgetStore(getContext());
        try {
            JSONObject data = WidgetSyncJob.stripForWidget(new JSONObject(json));
            store.saveSnapshot(data, true);
        } catch (JSONException e) {
            call.reject("Invalid data", e);
            return;
        }
        JSObject firebase = call.getObject("firebase");
        String refreshToken = call.getString("refreshToken");
        if (firebase != null && firebase.getString("refreshToken") != null) {
            // Google sign-in: the widget writes its ticks to Firestore directly.
            store.setFirebaseAuth(firebase.getString("apiKey"), firebase.getString("projectId"),
                    firebase.getString("refreshToken"), firebase.getString("uid"));
        } else if (refreshToken != null && !refreshToken.isEmpty()) {
            store.setAuth(call.getString("appKey"), refreshToken, call.getString("dataPath"));
        }
        Boolean reminders = call.getBoolean("reminders");
        if (reminders != null) store.setRemindersEnabled(reminders);
        store.setLastRefresh(System.currentTimeMillis());
        // Redraws the widget and reschedules the reminders from the new data.
        TaskWidgetProvider.updateAll(getContext());
        // Widget completions still waiting (e.g. made offline) go out now.
        if (store.getPending().length() > 0 && store.hasAuth()) WidgetSyncJob.schedule(getContext());
        // And the widget keeps itself current from now on (every ~15 minutes).
        if (store.hasAuth()) WidgetSyncJob.schedulePeriodic(getContext());
        call.resolve();
    }

    /** Signed out: forget the data and credentials. */
    @PluginMethod
    public void clear(PluginCall call) {
        new WidgetStore(getContext()).clearAll();
        TaskWidgetProvider.updateAll(getContext());
        call.resolve();
    }
}
