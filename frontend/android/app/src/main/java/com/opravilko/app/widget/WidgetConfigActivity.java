package com.opravilko.app.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.PorterDuff;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.ScrollView;
import android.widget.TextView;

import com.opravilko.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Shown when placing the widget and from its header: pick what it lists.
 * Grouped like Todoist's picker: "Default views" (Today, Upcoming, Inbox,
 * the shopping list) and "Projects", each folding open; the current choice
 * has its radio filled.
 */
public class WidgetConfigActivity extends Activity {
    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private WidgetStore store;
    private String current;

    /** One choice: what it shows, its name and icon. */
    private static final class Option {
        final String value;
        final String label;
        final int icon;

        Option(String value, String label, int icon) {
            this.value = value;
            this.label = label;
            this.icon = icon;
        }
    }

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

        store = new WidgetStore(this);
        current = store.getView(appWidgetId);
        List<Option> views = new ArrayList<>();
        List<Option> projectOptions = new ArrayList<>();
        views.add(new Option(WidgetStore.VIEW_TODAY, "Today", R.drawable.ic_w_calendar));
        views.add(new Option(WidgetStore.VIEW_UPCOMING, "Upcoming", R.drawable.ic_w_calendar));
        views.add(new Option(WidgetStore.VIEW_INBOX, "Inbox", R.drawable.ic_w_inbox));

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
                String value = WidgetStore.PROJECT_PREFIX + p.optString("id");
                if ("shopping".equals(p.optString("viewStyle"))) {
                    views.add(new Option(value, "Shopping list", R.drawable.ic_w_cart));
                } else {
                    projectOptions.add(new Option(value, p.optString("name"), R.drawable.ic_w_hash));
                }
            }
        }

        // A dimmed screen; tapping beside the card cancels.
        FrameLayout scrim = new FrameLayout(this);
        scrim.setBackgroundColor(0x66000000);
        scrim.setPadding(dp(24), dp(48), dp(24), dp(48));
        scrim.setOnClickListener(v -> finish());

        ScrollView scroll = new ScrollView(this);
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(color(R.color.widget_bg));
        cardBg.setCornerRadius(dp(28));
        scroll.setBackground(cardBg);
        scroll.setClipToOutline(true);
        scroll.setOnClickListener(v -> { });
        FrameLayout.LayoutParams scrollLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        scrim.addView(scroll, scrollLp);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(0, dp(24), 0, dp(12));
        scroll.addView(card);

        TextView title = new TextView(this);
        title.setText(R.string.widget_config_title);
        title.setTextColor(color(R.color.widget_text));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
        title.setPadding(dp(24), 0, dp(24), dp(12));
        card.addView(title);

        if (data == null) {
            TextView hint = new TextView(this);
            hint.setText(R.string.widget_config_hint);
            hint.setTextColor(color(R.color.widget_text_secondary));
            hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            hint.setPadding(dp(24), 0, dp(24), dp(8));
            card.addView(hint);
        }

        boolean inProjects = false;
        for (Option o : projectOptions) if (o.value.equals(current)) inProjects = true;
        card.addView(group("Default views", views, !inProjects));
        if (!projectOptions.isEmpty()) card.addView(group("Projects", projectOptions, inProjects));

        TextView cancel = new TextView(this);
        cancel.setText(android.R.string.cancel);
        cancel.setTextColor(color(R.color.widget_accent));
        cancel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        cancel.setTypeface(Typeface.DEFAULT_BOLD);
        cancel.setGravity(Gravity.CENTER);
        cancel.setMinHeight(dp(48));
        cancel.setPadding(dp(20), 0, dp(20), 0);
        cancel.setBackgroundResource(selectable());
        cancel.setOnClickListener(v -> finish());
        LinearLayout.LayoutParams cancelLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cancelLp.gravity = Gravity.END;
        cancelLp.setMargins(0, dp(8), dp(16), 0);
        card.addView(cancel, cancelLp);

        setContentView(scrim);
    }

    /** A heading that folds its choices open and shut; shut, it lists their names. */
    private View group(String name, List<Option> options, boolean open) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);

        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.setMinimumHeight(dp(60));
        head.setPadding(dp(20), dp(8), dp(24), dp(8));
        head.setBackgroundResource(selectable());

        ImageView chevron = new ImageView(this);
        chevron.setImageResource(R.drawable.ic_w_chevron);
        chevron.setColorFilter(color(R.color.widget_text_secondary), PorterDuff.Mode.SRC_IN);
        head.addView(chevron, new LinearLayout.LayoutParams(dp(22), dp(22)));

        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams textsLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        textsLp.setMarginStart(dp(18));
        head.addView(texts, textsLp);

        TextView label = new TextView(this);
        label.setText(name);
        label.setTextColor(color(R.color.widget_text));
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        label.setTypeface(Typeface.DEFAULT_BOLD);
        texts.addView(label);

        StringBuilder names = new StringBuilder();
        for (Option o : options) names.append(names.length() > 0 ? ", " : "").append(o.label);
        TextView summary = new TextView(this);
        summary.setText(names);
        summary.setTextColor(color(R.color.widget_text_secondary));
        summary.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        summary.setSingleLine(true);
        summary.setEllipsize(TextUtils.TruncateAt.END);
        texts.addView(summary);
        box.addView(head);

        LinearLayout rows = new LinearLayout(this);
        rows.setOrientation(LinearLayout.VERTICAL);
        for (Option o : options) rows.addView(row(o));
        box.addView(rows);

        Runnable show = () -> {
            boolean isOpen = rows.getVisibility() == View.VISIBLE;
            chevron.setRotation(isOpen ? 180 : 0);
            summary.setVisibility(isOpen ? View.GONE : View.VISIBLE);
        };
        rows.setVisibility(open ? View.VISIBLE : View.GONE);
        show.run();
        head.setOnClickListener(v -> {
            rows.setVisibility(rows.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);
            show.run();
        });
        return box;
    }

    private View row(Option o) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(dp(56));
        row.setPadding(dp(60), 0, dp(20), 0);
        row.setBackgroundResource(selectable());

        ImageView icon = new ImageView(this);
        icon.setImageResource(o.icon);
        icon.setColorFilter(color(R.color.widget_text_secondary), PorterDuff.Mode.SRC_IN);
        row.addView(icon, new LinearLayout.LayoutParams(dp(20), dp(20)));

        TextView label = new TextView(this);
        label.setText(o.label);
        label.setTextColor(color(R.color.widget_text));
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        label.setSingleLine(true);
        label.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams labelLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        labelLp.setMarginStart(dp(14));
        row.addView(label, labelLp);

        RadioButton radio = new RadioButton(this);
        radio.setChecked(o.value.equals(current));
        radio.setClickable(false);
        radio.setFocusable(false);
        radio.setButtonTintList(new ColorStateList(
                new int[][] {new int[] {android.R.attr.state_checked}, new int[] {}},
                new int[] {color(R.color.widget_accent), color(R.color.widget_text_muted)}));
        row.addView(radio);

        row.setOnClickListener(v -> choose(o.value));
        return row;
    }

    private void choose(String value) {
        store.setView(appWidgetId, value);
        TaskWidgetProvider.updateAll(this);
        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        setResult(RESULT_OK, result);
        finish();
    }

    private int selectable() {
        TypedValue out = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackground, out, true);
        return out.resourceId;
    }

    private int color(int id) {
        return getResources().getColor(id, getTheme());
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
