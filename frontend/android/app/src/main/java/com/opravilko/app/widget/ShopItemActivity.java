package com.opravilko.app.widget;

import android.app.Activity;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputType;
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
import android.widget.Toast;

import com.opravilko.app.R;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * A shopping item tapped in the widget, edited right over the home screen
 * (like the app's item window): its name, amount, note, shop and category;
 * Save or Delete. The change shows in the widget at once and is sent on by
 * WidgetSyncJob, like a tick.
 */
public class ShopItemActivity extends Activity {
    static final String EXTRA_TASK_ID = "com.opravilko.app.widget.EDIT_TASK_ID";

    private WidgetStore store;
    private JSONObject task;
    private String categoryId;
    private String shop;
    private LinearLayout shopChips;
    private LinearLayout categoryChips;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new WidgetStore(this);
        JSONObject data = store.getSnapshot();
        String taskId = getIntent().getStringExtra(EXTRA_TASK_ID);
        task = data != null && taskId != null ? TaskLogic.findTask(data.optJSONArray("tasks"), taskId) : null;
        if (task == null) {
            Toast.makeText(this, "That item isn't on the list any more.", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }
        JSONObject guide = data.optJSONObject("shoppingGuide");
        String description = task.optString("description", "");
        String[] parsed = ShoppingLogic.parse(task.optString("content"));
        categoryId = ShoppingLogic.categoryId(data, description, parsed[0]);
        shop = ShoppingLogic.storeOf(description);

        // A dimmed screen; tapping beside the card closes it.
        FrameLayout scrim = new FrameLayout(this);
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

        LinearLayout sheet = new LinearLayout(this);
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

        // Name and amount side by side.
        LinearLayout names = new LinearLayout(this);
        names.setOrientation(LinearLayout.HORIZONTAL);
        EditText name = field(parsed[0], "Item", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        names.addView(labelled("Item", name), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        EditText amount = field(parsed[1] != null ? parsed[1] : "", "1 l, 4, 500 g", InputType.TYPE_CLASS_TEXT);
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(dp(110), ViewGroup.LayoutParams.WRAP_CONTENT);
        alp.setMarginStart(dp(10));
        names.addView(labelled("Amount", amount), alp);
        sheet.addView(names);

        EditText note = field(ShoppingLogic.noteOf(description), "e.g. the Alpsko yoghurt, or cheese if there's none",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        note.setMinLines(2);
        note.setGravity(Gravity.TOP | Gravity.START);
        View noteBox = labelled("Note", note);
        ((LinearLayout.LayoutParams) noteBox.getLayoutParams()).topMargin = dp(12);
        sheet.addView(noteBox);

        sheet.addView(caption("Shop"));
        shopChips = chipRow(sheet);
        buildShopChips(data);

        sheet.addView(caption("Category"));
        categoryChips = chipRow(sheet);
        buildCategoryChips(guide);

        // Delete on the left, Save on the right.
        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams aclp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        aclp.topMargin = dp(18);
        sheet.addView(actions, aclp);

        TextView delete = button("Delete", color(R.color.widget_due_overdue), 0);
        delete.setOnClickListener(v -> delete());
        actions.addView(delete);
        View spacer = new View(this);
        actions.addView(spacer, new LinearLayout.LayoutParams(0, 1, 1));
        TextView cancel = button("Cancel", color(R.color.widget_text_secondary), 0);
        cancel.setOnClickListener(v -> finish());
        actions.addView(cancel);
        TextView save = button("Save", color(R.color.widget_on_accent), color(R.color.widget_accent));
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        slp.setMarginStart(dp(8));
        actions.addView(save, slp);
        save.setOnClickListener(v -> save(name.getText().toString(), amount.getText().toString(), note.getText().toString()));

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

    private void buildShopChips(JSONObject data) {
        shopChips.removeAllViews();
        List<String> shops = new ArrayList<>(ShoppingLogic.stores(data, task.optString("projectId")));
        if (shop != null && !shops.contains(shop)) shops.add(shop);
        addChip(shopChips, "Any shop", shop == null, v -> {
            shop = null;
            buildShopChips(data);
        });
        for (String s : shops) {
            addChip(shopChips, s, s.equals(shop), v -> {
                shop = s;
                buildShopChips(data);
            });
        }
    }

    private void buildCategoryChips(JSONObject guide) {
        categoryChips.removeAllViews();
        JSONArray order = guide != null ? guide.optJSONArray("categoryOrder") : null;
        JSONObject emoji = guide != null ? guide.optJSONObject("emoji") : null;
        JSONObject names = guide != null ? guide.optJSONObject("names") : null;
        if (order == null) return;
        for (int i = 0; i < order.length(); i++) {
            String id = order.optString(i);
            String label = (emoji != null ? emoji.optString(id, "") + "  " : "")
                    + (names != null ? names.optString(id, id) : id);
            addChip(categoryChips, label, id.equals(categoryId), v -> {
                categoryId = id;
                buildCategoryChips(guide);
            });
        }
    }

    private void save(String name, String amount, String note) {
        if (name.trim().isEmpty()) {
            Toast.makeText(this, "The item needs a name.", Toast.LENGTH_SHORT).show();
            return;
        }
        JSONObject data = store.getSnapshot();
        if (data == null) return;
        JSONObject guide = data.optJSONObject("shoppingGuide");
        try {
            String at = TaskLogic.nowIso();
            JSONObject op = new JSONObject().put("id", "edit@" + task.optString("id") + "@" + at)
                    .put("op", WidgetStore.OP_EDIT).put("taskId", task.optString("id"))
                    .put("content", ShoppingLogic.editedTitle(guide, name, amount))
                    .put("description", ShoppingLogic.editedDescription(guide, task.optString("description", ""),
                            name, note, categoryId, shop))
                    .put("at", at);
            queue(data, op);
            finish();
        } catch (JSONException e) {
            Toast.makeText(this, "Couldn't save that.", Toast.LENGTH_SHORT).show();
        }
    }

    private void delete() {
        JSONObject data = store.getSnapshot();
        if (data == null) return;
        try {
            String at = TaskLogic.nowIso();
            queue(data, new JSONObject().put("id", "delete@" + task.optString("id")).put("op", WidgetStore.OP_DELETE)
                    .put("taskId", task.optString("id")).put("at", at));
            Toast.makeText(this, "Removed " + ShoppingLogic.parse(task.optString("content"))[0], Toast.LENGTH_SHORT).show();
            finish();
        } catch (JSONException e) {
            Toast.makeText(this, "Couldn't remove that.", Toast.LENGTH_SHORT).show();
        }
    }

    /** Shown in the widget straight away, sent on by the sync job. */
    private void queue(JSONObject data, JSONObject op) {
        store.addPendingOp(op);
        if (WidgetStore.applyPending(data, op)) store.saveSnapshot(data, false);
        TaskWidgetProvider.updateAll(this);
        WidgetSyncJob.schedule(this);
    }

    // ---- pieces ----

    private EditText field(String value, String hint, int inputType) {
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

    private View labelled(String label, View field) {
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

    private TextView caption(String text) {
        TextView c = new TextView(this);
        c.setText(text);
        c.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        c.setTypeface(Typeface.DEFAULT_BOLD);
        c.setTextColor(color(R.color.widget_text_secondary));
        c.setPadding(dp(2), dp(14), 0, dp(6));
        return c;
    }

    private LinearLayout chipRow(LinearLayout parent) {
        HorizontalScrollView scroller = new HorizontalScrollView(this);
        scroller.setHorizontalScrollBarEnabled(false);
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        scroller.addView(row);
        parent.addView(scroller);
        return row;
    }

    private void addChip(LinearLayout row, String label, boolean on, View.OnClickListener click) {
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

    private TextView button(String label, int textColor, int fill) {
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

    private int color(int id) {
        return getResources().getColor(id, getTheme());
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
