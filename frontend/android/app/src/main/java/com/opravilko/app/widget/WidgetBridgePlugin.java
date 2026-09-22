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
 * Dropbox sign-in here, and hears back when the widget changed the file.
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
        String refreshToken = call.getString("refreshToken");
        if (refreshToken != null && !refreshToken.isEmpty()) {
            store.setAuth(call.getString("appKey"), refreshToken, call.getString("dataPath"));
        }
        store.setLastRefresh(System.currentTimeMillis());
        TaskWidgetProvider.updateAll(getContext());
        // Widget completions still waiting (e.g. made offline) go out now.
        if (store.getPending().length() > 0 && store.hasAuth()) WidgetSyncJob.schedule(getContext());
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
