package com.opravilko.app.widget;

import android.app.Activity;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.opravilko.app.R;

import org.json.JSONObject;

/**
 * A card over the home screen, opened from the widget (a shopping item, a
 * task): the dimmed screen, the sheet with its handle, and the fields, chips
 * and buttons it's built from, in the widget's colours.
 */
abstract class WidgetSheetActivity extends Activity {
    protected WidgetStore store;
    private FrameLayout scrim;
    private LinearLayout sheet;

    /** The empty card to fill; call showSheet() once it's built. */
    protected LinearLayout openSheet() {
        // A dimmed screen; tapping beside the card closes it.
        scrim = new FrameLayout(this);
        scrim.setBackgroundColor(0x66000000);
        scrim.setOnClickListener(v -> finish());

        ScrollView scroll = new ScrollView(this);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color(R.color.widget_bg));
        float r = dp(26);
        bg.setCornerRadii(new float[] { r, r, r, r, 0, 0, 0, 0 });
        scroll.setBackground(bg);
        scroll.setOnClickListener(v -> { });
        scrim.addView(scroll, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setPadding(dp(20), dp(10), dp(20), dp(16));
        scroll.addView(sheet);

        View handle = new View(this);
        GradientDrawable hb = new GradientDrawable();
        hb.setColor(color(R.color.widget_divider));
        hb.setCornerRadius(dp(2));
        handle.setBackground(hb);
        LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(dp(40), dp(4));
        hlp.gravity = Gravity.CENTER_HORIZONTAL;
        hlp.bottomMargin = dp(14);
        sheet.addView(handle, hlp);
        return sheet;
    }

    protected void showSheet() {
        setContentView(scrim);
        keepAboveKeyboard(scrim, sheet);
    }

    /** Edge to edge: the card sits above the navigation bar, or above the keyboard while typing. */
    private void keepAboveKeyboard(View root, View sheet) {
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        final int base = sheet.getPaddingBottom();
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            int keyboard = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.ime()).bottom;
            int bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()).bottom;
            int top = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()).top;
            v.setPadding(0, top + dp(24), 0, 0);
            sheet.setPadding(sheet.getPaddingLeft(), sheet.getPaddingTop(), sheet.getPaddingRight(),
                    base + Math.max(keyboard, bars));
            return androidx.core.view.WindowInsetsCompat.CONSUMED;
        });
    }

    /** Shown in the widget straight away, sent on by the sync job. */
    protected void queue(JSONObject data, JSONObject op) {
        store.addPendingOp(op);
        if (WidgetStore.applyPending(data, op)) store.saveSnapshot(data, false);
        TaskWidgetProvider.updateAll(this);
        WidgetSyncJob.schedule(this);
    }

    // ---- pieces ----

    protected EditText field(String value, String hint, int inputType) {
        EditText e = new EditText(this);
        e.setText(value);
        e.setHint(hint);
        e.setInputType(inputType);
        e.setTextColor(color(R.color.widget_text));
        e.setHintTextColor(color(R.color.widget_text_muted));
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
        GradientDrawable box = new GradientDrawable();
        box.setColor(color(R.color.widget_bg));
        box.setStroke(dp(1), color(R.color.widget_divider));
        box.setCornerRadius(dp(12));
        e.setBackground(box);
        return e;
    }

    protected View labelled(String label, View field) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        TextView l = new TextView(this);
        l.setText(label);
        l.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        l.setTypeface(Typeface.DEFAULT_BOLD);
        l.setTextColor(color(R.color.widget_text_secondary));
        l.setPadding(dp(2), 0, 0, dp(4));
        box.addView(l);
        box.addView(field, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        box.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return box;
    }

    protected TextView caption(String text) {
        TextView c = new TextView(this);
        c.setText(text);
        c.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        c.setTypeface(Typeface.DEFAULT_BOLD);
        c.setTextColor(color(R.color.widget_text_secondary));
        c.setPadding(dp(2), dp(14), 0, dp(6));
        return c;
    }

    protected LinearLayout chipRow(LinearLayout parent) {
        HorizontalScrollView scroller = new HorizontalScrollView(this);
        scroller.setHorizontalScrollBarEnabled(false);
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        scroller.addView(row);
        parent.addView(scroller);
        return row;
    }

    protected void addChip(LinearLayout row, String label, boolean on, View.OnClickListener click) {
        TextView chip = new TextView(this);
        chip.setText(label);
        chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        chip.setGravity(Gravity.CENTER);
        chip.setMinHeight(dp(38));
        chip.setPadding(dp(14), 0, dp(14), 0);
        chip.setTextColor(color(on ? R.color.widget_accent : R.color.widget_text));
        if (on) chip.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(on ? (color(R.color.widget_accent) & 0x00FFFFFF) | 0x22000000 : color(R.color.widget_bg));
        bg.setStroke(dp(1), color(on ? R.color.widget_accent : R.color.widget_divider));
        bg.setCornerRadius(dp(19));
        chip.setBackground(bg);
        chip.setOnClickListener(click);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMarginEnd(dp(6));
        row.addView(chip, lp);
    }

    protected TextView button(String label, int textColor, int fill) {
        TextView b = new TextView(this);
        b.setText(label);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(textColor);
        b.setGravity(Gravity.CENTER);
        b.setMinHeight(dp(44));
        b.setPadding(dp(18), 0, dp(18), 0);
        if (fill != 0) {
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(fill);
            bg.setCornerRadius(dp(14));
            b.setBackground(bg);
        } else {
            b.setBackgroundTintList(ColorStateList.valueOf(0));
        }
        return b;
    }

    protected int color(int id) {
        return getResources().getColor(id, getTheme());
    }

    protected int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
