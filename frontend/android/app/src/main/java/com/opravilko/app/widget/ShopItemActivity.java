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
public class ShopItemActivity extends WidgetSheetActivity {
    static final String EXTRA_TASK_ID = "com.opravilko.app.widget.EDIT_TASK_ID";

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

        LinearLayout sheet = openSheet();

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

        showSheet();
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
}
