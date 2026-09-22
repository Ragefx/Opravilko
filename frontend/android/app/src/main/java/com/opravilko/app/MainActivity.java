package com.opravilko.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.opravilko.app.widget.WidgetBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
