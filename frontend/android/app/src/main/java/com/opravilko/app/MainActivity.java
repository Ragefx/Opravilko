package com.opravilko.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.opravilko.app.places.PlacesPlugin;
import com.opravilko.app.share.SharePlugin;
import com.opravilko.app.update.UpdatePlugin;
import com.opravilko.app.voice.VoicePlugin;
import com.opravilko.app.widget.WidgetBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(PlacesPlugin.class);
        registerPlugin(VoicePlugin.class);
        registerPlugin(SharePlugin.class);
        registerPlugin(UpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
