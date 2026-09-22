package com.opravilko.app.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.util.TypedValue;
import android.widget.ArrayAdapter;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;

import com.opravilko.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Shown when placing (or reconfiguring) the widget: pick what it lists --
 * Today, Upcoming, Inbox or one of your projects.
 */
public class WidgetConfigActivity extends Activity {
    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Backing out without choosing keeps (or, on first placement, cancels) the widget.
        setResult(RESULT_CANCELED);
        Bundle extras = getIntent().getExtras();
        if (extras != null) {
            appWidgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        WidgetStore store = new WidgetStore(this);
        final List<String> labels = new ArrayList<>();
        final List<String> values = new ArrayList<>();
        labels.add("Today");
        values.add(WidgetStore.VIEW_TODAY);
        labels.add("Upcoming (next 7 days)");
        values.add(WidgetStore.VIEW_UPCOMING);
        labels.add("Inbox");
        values.add(WidgetStore.VIEW_INBOX);

        JSONObject data = store.getSnapshot();
        JSONArray projects = data != null ? data.optJSONArray("projects") : null;
        if (projects != null) {
            List<JSONObject> list = new ArrayList<>();
            for (int i = 0; i < projects.length(); i++) {
                JSONObject p = projects.optJSONObject(i);
                if (p != null && !p.optBoolean("isInboxProject") && !"inbox".equals(p.optString("id"))) list.add(p);
            }
            list.sort((a, b) -> Double.compare(a.optDouble("order", 0), b.optDouble("order", 0)));
            for (JSONObject p : list) {
                labels.add("# " + p.optString("name"));
                values.add(WidgetStore.PROJECT_PREFIX + p.optString("id"));
            }
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);

        TextView title = new TextView(this);
        title.setText(R.string.widget_config_title);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        title.setPadding(pad, pad, pad, dp(8));
        root.addView(title);

        if (data == null) {
            TextView hint = new TextView(this);
            hint.setText(R.string.widget_config_hint);
            hint.setPadding(pad, 0, pad, dp(8));
            root.addView(hint);
        }

        ListView listView = new ListView(this);
        listView.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, labels));
        listView.setOnItemClickListener((parent, view, position, id) -> {
            store.setView(appWidgetId, values.get(position));
            TaskWidgetProvider.updateAll(this);
            Intent result = new Intent();
            result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            setResult(RESULT_OK, result);
            finish();
        });
        root.addView(listView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        setContentView(root);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
