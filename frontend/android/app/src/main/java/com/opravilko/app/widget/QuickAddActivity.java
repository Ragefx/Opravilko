package com.opravilko.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.opravilko.app.R;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The widget's + (and mic): an Add task sheet over the home screen, without
 * opening the app. Tasks: a name ("Pokliči zobarja jutri ob 9h p1" is read
 * like the app's quick add), a project and a date chip. On the shopping list:
 * items ("mleko 1 l, 2x jajca", amounts count up) and your usual items as
 * chips. What's added shows in the widget at once and is synced like a tick.
 */
public class QuickAddActivity extends AppCompatActivity {
    static final String EXTRA_VIEW = "com.opravilko.app.widget.VIEW";
    static final String EXTRA_VOICE = "com.opravilko.app.widget.VOICE";
    private static final int REQUEST_VOICE = 7;

    private WidgetStore store;
    private EditText text;
    private ImageButton send;
    /** What's set (tap to change, × to clear), the row of icons, and where it goes. */
    private LinearLayout tokens, tools;
    private View tokensScroll;
    private TextView where;
    private TextView added;

    private boolean shopping;
    /** On the shopping list: the shop what's added now is for (null for any). */
    private String shopStore;
    private String projectId = "inbox";
    /** The section within the project ("Inbox / To-do"), or null for the project itself. */
    private String sectionId;
    /** The date chip: a day, or null for none. Typed dates win over it. */
    private String day;
    /** From the chips and the + menu, for the next task. */
    private int priority;
    private final List<String> labels = new ArrayList<>();
    private JSONObject location;
    private java.io.File attachment;
    private String attachmentName, attachmentType, attachmentId;
    private EditText description;
    private TextView preview;
    private static final int REQUEST_FILE = 8;
    private static final int REQUEST_LOCATION = 9;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.widget_quick_add);
        keepAboveKeyboard();
        store = new WidgetStore(this);
        text = findViewById(R.id.qa_text);
        send = findViewById(R.id.qa_send);
        tokens = findViewById(R.id.qa_tokens);
        tokensScroll = findViewById(R.id.qa_tokens_scroll);
        tools = findViewById(R.id.qa_tools);
        where = findViewById(R.id.qa_where);
        added = findViewById(R.id.qa_added);
        description = findViewById(R.id.qa_description);
        preview = findViewById(R.id.qa_preview);

        findViewById(R.id.qa_scrim).setOnClickListener(v -> finish());
        text.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) {
                updateSendButton();
                updatePreview();
            }
        });
        text.setOnEditorActionListener((v, actionId, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN;
            if (actionId == EditorInfo.IME_ACTION_SEND || enter) {
                submit();
                return true;
            }
            return false;
        });
        send.setOnClickListener(v -> {
            if (text.getText().toString().trim().isEmpty()) listen();
            else submit();
        });
        setUp(getIntent());
        animateIn();
    }

    /** The card rises from the bottom with a small bounce while the page behind dims. */
    private void animateIn() {
        View card = findViewById(R.id.qa_card);
        Drawable dim = findViewById(R.id.qa_scrim).getBackground();
        if (dim != null) {
            dim.setAlpha(0);
            android.animation.ValueAnimator fade = android.animation.ValueAnimator.ofInt(0, 255);
            fade.setDuration(200);
            fade.addUpdateListener(a -> dim.setAlpha((int) a.getAnimatedValue()));
            fade.start();
        }
        card.setTranslationY(dp(420));
        card.animate().translationY(0).setDuration(300)
                .setInterpolator(new android.view.animation.OvershootInterpolator(0.9f)).start();
    }

    /**
     * The sheet sits right on top of the keyboard (and above the navigation bar
     * when the keyboard is down). Android draws apps edge to edge now and no
     * longer lifts a window for the keyboard by itself, so the sheet reads the
     * keyboard's and the bars' heights and pads itself by them.
     */
    private void keepAboveKeyboard() {
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View scrim = findViewById(R.id.qa_scrim);
        View sheet = findViewById(R.id.qa_sheet);
        final int baseBottom = sheet.getPaddingBottom();
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(scrim, (v, insets) -> {
            int keyboard = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.ime()).bottom;
            int bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()).bottom;
            sheet.setPadding(sheet.getPaddingLeft(), sheet.getPaddingTop(), sheet.getPaddingRight(),
                    baseBottom + Math.max(keyboard, bars));
            return androidx.core.view.WindowInsetsCompat.CONSUMED;
        });
    }

    @Override
    protected void onDestroy() {
        // A file picked but never added goes; one handed to the sync job stays until it's stored.
        if (attachment != null) attachment.delete();
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        setUp(intent);
    }

    private void setUp(Intent intent) {
        JSONObject data = store.getSnapshot();
        if (data == null || !store.hasAuth()) {
            Toast.makeText(this, R.string.widget_empty_signed_out, Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        // Opening the card fetches the latest too (e.g. what your partner just
        // added to the shopping list), so the widget behind it is current.
        if (System.currentTimeMillis() - store.getLastRefresh() > 60_000) WidgetSyncJob.schedule(this);
        String view = intent.getStringExtra(EXTRA_VIEW);
        if (view == null) view = WidgetStore.VIEW_TODAY;
        shopping = ShoppingLogic.isShoppingView(data, view);
        projectId = TaskLogic.viewProjectId(view);
        if (!shopping && TaskLogic.findProject(data, projectId) == null) projectId = "inbox";
        // Start in the view's project itself; a section is picked from its chip.
        sectionId = null;
        day = WidgetStore.VIEW_TODAY.equals(view) ? TaskLogic.todayStr() : null;
        resetExtras();
        text.setText("");
        text.setHint(shopping ? R.string.qa_shop_hint : R.string.qa_task_hint);
        added.setVisibility(View.GONE);
        buildChips();
        updateSendButton();
        text.requestFocus();
        if (intent.getBooleanExtra(EXTRA_VOICE, false)) {
            intent.removeExtra(EXTRA_VOICE);
            listen();
        }
    }

    /**
     * Shopping list: what the typed text will do, line by line -- the icon, the
     * name and amount as it'll read, and "(onto …)" when it adds to an item
     * already on the list.
     */
    private void updatePreview() {
        if (!shopping) {
            preview.setVisibility(View.GONE);
            return;
        }
        String typed = text.getText().toString().trim();
        JSONObject data = store.getSnapshot();
        if (typed.isEmpty() || data == null) {
            preview.setVisibility(View.GONE);
            return;
        }
        JSONObject guide = data.optJSONObject("shoppingGuide");
        JSONArray copy;
        try {
            JSONArray tasks = data.optJSONArray("tasks");
            copy = new JSONArray(tasks != null ? tasks.toString() : "[]");
        } catch (JSONException e) {
            return;
        }
        StringBuilder b = new StringBuilder();
        List<String> known = ShoppingLogic.stores(data, projectId);
        for (String typedLine : ShoppingLogic.splitItems(typed)) {
            String[] split = ShoppingLogic.takeStore(typedLine, known);
            String line = split[0];
            String before = null;
            String id = "preview-" + b.length();
            ShoppingLogic.Item item = ShoppingLogic.parseItem(guide, line);
            // Which item it lands on, and how that reads afterwards.
            for (int i = 0; i < copy.length(); i++) {
                JSONObject t = copy.optJSONObject(i);
                if (t != null && projectId.equals(t.optString("projectId")) && !t.optBoolean("completed")
                        && t.isNull("parentId")) {
                    ShoppingLogic.Item have = ShoppingLogic.parseItem(guide, t.optString("content"));
                    if (ShoppingLogic.sameItem(have, item) || ShoppingLogic.countsWith(have, item)) {
                        before = t.optString("content");
                        break;
                    }
                }
            }
            JSONObject result = ShoppingLogic.addLine(guide, copy, projectId, line, id, TaskLogic.nowIso());
            if (result == null) continue;
            if (b.length() > 0) b.append("\n");
            String name = ShoppingLogic.parse(result.optString("content"))[0];
            b.append(ShoppingLogic.emoji(data, result.optString("description", ""), name)).append("  ")
                    .append(result.optString("content"));
            if (before != null && !id.equals(result.optString("id"))) b.append("   (onto ").append(before).append(")");
            if (split[1] != null) b.append("   \uD83C\uDFEA ").append(split[1]);
        }
        preview.setText(b);
        preview.setVisibility(b.length() > 0 ? View.VISIBLE : View.GONE);
    }

    private void updateSendButton() {
        boolean empty = text.getText().toString().trim().isEmpty();
        send.setImageResource(empty ? R.drawable.ic_qa_mic : R.drawable.ic_qa_send);
        send.setContentDescription(getString(empty ? R.string.widget_add_by_voice : R.string.widget_add_task));
    }

    // ---- chips ----

    private void buildChips() {
        tokens.removeAllViews();
        tools.removeAllViews();
        JSONObject data = store.getSnapshot();
        if (shopping) {
            // Left: the shop what's added now is for.
            setWhere("\uD83C\uDFEA " + (shopStore != null ? shopStore : "Any shop"), null,
                    shopStore != null ? R.color.widget_accent : R.color.widget_text_secondary);
            where.setOnClickListener(v -> pickStore());
            // A meal: its ingredients, for so many servings, like the app's Meal button.
            TextView meal = toolText("\uD83C\uDF73 Meal");
            meal.setOnClickListener(v -> pickMeal());
            tools.addView(meal);
            // Your usual items, one tap each.
            for (String name : usualItems(data)) {
                View t = token("+ " + name, R.color.widget_text_secondary, null);
                t.setOnClickListener(v -> {
                    addShopLines(java.util.Collections.singletonList(name));
                    tokens.removeView(v);
                    tokensScroll.setVisibility(tokens.getChildCount() > 0 ? View.VISIBLE : View.GONE);
                });
                tokens.addView(t);
            }
            tokensScroll.setVisibility(tokens.getChildCount() > 0 ? View.VISIBLE : View.GONE);
            return;
        }

        JSONObject project = TaskLogic.findProject(data, projectId);
        boolean inbox = "inbox".equals(projectId) || project == null || project.optBoolean("isInboxProject");
        setWhere(projectName(data), inbox ? R.drawable.ic_w_inbox : R.drawable.ic_w_hash, R.color.widget_text_secondary);
        where.setOnClickListener(this::pickProject);

        // One row of same-size icons, tinted when that thing is set, in the
        // order they were dragged into (hold one, then slide it).
        java.util.Map<String, View> byId = new java.util.HashMap<>();
        byId.put("date", tool(R.drawable.ic_w_calendar, "Date", day != null, dayColor(day), this::pickDay));
        byId.put("priority", tool(R.drawable.ic_qa_flag, "Priority", priority > 0,
                priority > 0 ? priorityColor(priority) : R.color.widget_text_secondary, this::pickPriority));
        byId.put("labels", tool(R.drawable.ic_qa_label, "Labels", !labels.isEmpty(), R.color.widget_accent, v -> pickLabels()));
        byId.put("location", tool(R.drawable.ic_qa_pin, "Location", location != null, R.color.widget_accent, v -> pickLocation()));
        // Attachments live in Firebase, so only with Google sign-in (as in the app).
        if (store.isFirebase()) {
            byId.put("attach", tool(R.drawable.ic_qa_attach, "Attachment", attachment != null, R.color.widget_accent, v -> pickFile()));
        }
        for (String id : toolOrder()) {
            View v = byId.get(id);
            if (v == null) continue;
            v.setTag(id);
            v.setOnLongClickListener(this::startToolDrag);
            tools.addView(v);
        }
        tools.setOnDragListener(this::onToolDrag);

        // What's set, as tokens: tap to change, × to clear.
        if (day != null) {
            View t = token(dayLabel(day), dayColor(day), () -> day = null);
            t.setOnClickListener(this::pickDay);
            tokens.addView(t);
        }
        if (priority > 0) {
            View t = token("P" + (5 - priority), priorityColor(priority), () -> priority = 0);
            t.setOnClickListener(this::pickPriority);
            tokens.addView(t);
        }
        if (!labels.isEmpty()) {
            View t = token("@" + android.text.TextUtils.join(" @", labels), R.color.widget_accent, labels::clear);
            t.setOnClickListener(v -> pickLabels());
            tokens.addView(t);
        }
        if (location != null) {
            View t = token("\uD83D\uDCCD " + location.optString("name"), R.color.widget_accent, () -> location = null);
            t.setOnClickListener(v -> pickLocation());
            tokens.addView(t);
        }
        if (attachment != null) {
            View t = token("\uD83D\uDCCE " + attachmentName, R.color.widget_accent, () -> {
                attachment.delete();
                attachment = null;
            });
            t.setOnClickListener(v -> pickFile());
            tokens.addView(t);
        }
        tokensScroll.setVisibility(tokens.getChildCount() > 0 ? View.VISIBLE : View.GONE);
    }

    private static final String[] TOOLS = { "date", "priority", "labels", "location", "attach" };

    /** The icons' order: as last dragged (kept on this phone), new ones at the end. */
    private List<String> toolOrder() {
        List<String> out = new ArrayList<>();
        String saved = getSharedPreferences("quick_add", MODE_PRIVATE).getString("toolOrder", "");
        for (String id : saved.split(",")) if (java.util.Arrays.asList(TOOLS).contains(id) && !out.contains(id)) out.add(id);
        for (String id : TOOLS) if (!out.contains(id)) out.add(id);
        return out;
    }

    private boolean startToolDrag(View v) {
        v.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
        v.startDragAndDrop(null, new View.DragShadowBuilder(v), v, 0);
        v.setAlpha(0.3f);
        return true;
    }

    /** While an icon is dragged, it moves into the slot under the finger; dropped, the order is kept. */
    private boolean onToolDrag(View row, android.view.DragEvent ev) {
        Object state = ev.getLocalState();
        if (!(state instanceof View) || ((View) state).getParent() != tools) return false;
        View dragged = (View) state;
        switch (ev.getAction()) {
            case android.view.DragEvent.ACTION_DRAG_LOCATION: {
                int x = (int) ev.getX();
                for (int i = 0; i < tools.getChildCount(); i++) {
                    View c = tools.getChildAt(i);
                    if (c != dragged && x >= c.getLeft() && x < c.getRight()) {
                        tools.removeView(dragged);
                        tools.addView(dragged, i);
                        break;
                    }
                }
                return true;
            }
            case android.view.DragEvent.ACTION_DRAG_ENDED: {
                dragged.setAlpha(1f);
                List<String> order = new ArrayList<>();
                for (int i = 0; i < tools.getChildCount(); i++) {
                    Object tag = tools.getChildAt(i).getTag();
                    if (tag != null) order.add(tag.toString());
                }
                for (String id : toolOrder()) if (!order.contains(id)) order.add(id);
                getSharedPreferences("quick_add", MODE_PRIVATE).edit()
                        .putString("toolOrder", android.text.TextUtils.join(",", order)).apply();
                return true;
            }
            default:
                return true;
        }
    }

    private void setWhere(String label, Integer icon, int colorRes) {
        where.setText(label);
        int color = getColor(colorRes);
        where.setTextColor(color);
        Drawable d = icon != null ? getDrawable(icon) : null;
        if (d != null) {
            d.setBounds(0, 0, dp(17), dp(17));
            d.setTintList(ColorStateList.valueOf(color));
        }
        where.setCompoundDrawables(d, null, null, null);
    }

    /** A soft rounded background: the colour at a light tint, or clear. */
    private android.graphics.drawable.GradientDrawable soft(int color, boolean on, int radiusDp) {
        android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
        g.setCornerRadius(dp(radiusDp));
        g.setColor(on ? (color & 0x00FFFFFF) | 0x22000000 : android.graphics.Color.TRANSPARENT);
        return g;
    }

    /** One of the row's icons, 38 dp, tinted and softly filled when set. */
    private ImageButton tool(int icon, String label, boolean on, int colorRes, View.OnClickListener click) {
        ImageButton b = new ImageButton(this);
        int color = getColor(on ? colorRes : R.color.widget_text_secondary);
        b.setImageResource(icon);
        b.setImageTintList(ColorStateList.valueOf(color));
        b.setScaleType(android.widget.ImageView.ScaleType.CENTER_INSIDE);
        b.setPadding(dp(9), dp(9), dp(9), dp(9));
        b.setBackground(soft(color, on, 10));
        b.setContentDescription(label);
        b.setOnClickListener(click);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(38), dp(38));
        lp.setMarginEnd(dp(2));
        b.setLayoutParams(lp);
        return b;
    }

    /** A worded button in the icon row (the shopping card's Meal). */
    private TextView toolText(String label) {
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        t.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
        t.setTextColor(getColor(R.color.widget_accent));
        t.setGravity(Gravity.CENTER_VERTICAL);
        t.setPadding(dp(10), 0, dp(12), 0);
        t.setBackground(soft(getColor(R.color.widget_accent), true, 10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(38));
        lp.setMarginEnd(dp(4));
        t.setLayoutParams(lp);
        return t;
    }

    /** A token: its label (tap: change it), and × to clear it when `clear` is given. */
    private LinearLayout token(String label, int colorRes, Runnable clear) {
        int color = getColor(colorRes);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.HORIZONTAL);
        box.setGravity(Gravity.CENTER_VERTICAL);
        box.setBackground(soft(color, true, 9));
        box.setMinimumHeight(dp(30));
        TextView name = new TextView(this);
        name.setText(label);
        name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        name.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
        name.setTextColor(color);
        name.setSingleLine(true);
        name.setPadding(dp(10), dp(5), clear != null ? dp(2) : dp(10), dp(5));
        box.addView(name);
        if (clear != null) {
            TextView x = new TextView(this);
            x.setText("\u00D7");
            x.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            x.setTextColor(color);
            x.setAlpha(0.6f);
            x.setPadding(dp(5), 0, dp(9), 0);
            x.setContentDescription("Clear " + label);
            x.setOnClickListener(v -> {
                clear.run();
                buildChips();
            });
            box.addView(x);
        }
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMarginEnd(dp(6));
        box.setLayoutParams(lp);
        return box;
    }

    private void resetExtras() {
        priority = 0;
        labels.clear();
        location = null;
        if (attachment != null) attachment.delete();
        attachment = null;
        description.setText("");
        description.setVisibility(shopping ? View.GONE : View.VISIBLE);
    }

    private static int priorityColor(int stored) {
        switch (stored) {
            case 4: return R.color.widget_due_overdue;
            case 3: return R.color.widget_due_tomorrow;
            case 2: return R.color.widget_accent;
            default: return R.color.widget_text;
        }
    }

    // ---- the + menu: description, labels, location ----

    private void showMore(View anchor) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundResource(R.drawable.qa_menu_bg);
        box.setElevation(dp(10));
        box.setPadding(0, dp(8), 0, dp(8));
        android.widget.PopupWindow popup = new android.widget.PopupWindow(box,
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT, true);
        popup.setElevation(dp(10));
        popup.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(android.graphics.Color.TRANSPARENT));
        Object[][] rows = {
                { "Description", R.drawable.ic_qa_notes, (Runnable) this::showDescription },
                { "Labels", R.drawable.ic_qa_label, (Runnable) this::pickLabels },
                { "Location", R.drawable.ic_qa_pin, (Runnable) this::pickLocation },
        };
        for (Object[] r : rows) {
            TextView row = new TextView(this);
            row.setText((String) r[0]);
            row.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            row.setTextColor(getColor(R.color.widget_text));
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setMinHeight(dp(48));
            row.setMinWidth(dp(200));
            row.setPadding(dp(20), 0, dp(28), 0);
            Drawable d = getDrawable((Integer) r[1]);
            if (d != null) {
                d.setBounds(0, 0, dp(22), dp(22));
                row.setCompoundDrawables(d, null, null, null);
                row.setCompoundDrawablePadding(dp(16));
                row.setCompoundDrawableTintList(ColorStateList.valueOf(getColor(R.color.widget_text_secondary)));
            }
            row.setOnClickListener(v -> {
                popup.dismiss();
                ((Runnable) r[2]).run();
            });
            box.addView(row);
        }
        box.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED);
        popup.showAsDropDown(anchor, 0, -anchor.getHeight() - box.getMeasuredHeight() - dp(8));
    }

    private void showDescription() {
        description.setVisibility(View.VISIBLE);
        description.requestFocus();
    }

    private void pickLabels() {
        JSONObject data = store.getSnapshot();
        JSONArray all = data != null ? data.optJSONArray("labels") : null;
        List<JSONObject> list = new ArrayList<>();
        if (all != null) for (int i = 0; i < all.length(); i++) if (all.optJSONObject(i) != null) list.add(all.optJSONObject(i));
        if (list.isEmpty()) {
            Toast.makeText(this, "No labels yet: make them in the app.", Toast.LENGTH_SHORT).show();
            return;
        }
        list.sort((a, b) -> Double.compare(a.optDouble("order", 0), b.optDouble("order", 0)));
        String[] names = new String[list.size()];
        boolean[] checked = new boolean[list.size()];
        for (int i = 0; i < list.size(); i++) {
            names[i] = list.get(i).optString("name");
            checked[i] = labels.contains(names[i]);
        }
        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Labels")
                .setMultiChoiceItems(names, checked, (d, which, on) -> checked[which] = on)
                .setPositiveButton("Done", (d, w) -> {
                    labels.clear();
                    for (int i = 0; i < names.length; i++) if (checked[i]) labels.add(names[i]);
                    buildChips();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    /** Current location, or a place used on another task. */
    private void pickLocation() {
        List<JSONObject> places = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        JSONObject data = store.getSnapshot();
        JSONArray tasks = data != null ? data.optJSONArray("tasks") : null;
        if (tasks != null) {
            for (int i = tasks.length() - 1; i >= 0 && places.size() < 8; i--) {
                JSONObject t = tasks.optJSONObject(i);
                JSONObject loc = t != null ? t.optJSONObject("location") : null;
                if (loc != null && loc.has("lat") && seen.add(loc.optString("name"))) places.add(loc);
            }
        }
        List<String> labelsList = new ArrayList<>();
        labelsList.add("\uD83D\uDCCD Current location");
        for (JSONObject p : places) labelsList.add(p.optString("name"));
        if (location != null) labelsList.add("No location");
        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Location")
                .setItems(labelsList.toArray(new String[0]), (d, which) -> {
                    if (which == 0) {
                        currentLocation();
                    } else if (which <= places.size()) {
                        try {
                            JSONObject p = places.get(which - 1);
                            location = new JSONObject().put("name", p.optString("name")).put("lat", p.optDouble("lat"))
                                    .put("lng", p.optDouble("lng"));
                            if (p.has("address")) location.put("address", p.optString("address"));
                        } catch (JSONException ignored) {
                            location = null;
                        }
                        buildChips();
                    } else {
                        location = null;
                        buildChips();
                    }
                })
                .show();
    }

    private void currentLocation() {
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION,
                    android.Manifest.permission.ACCESS_COARSE_LOCATION }, REQUEST_LOCATION);
            return;
        }
        Toast.makeText(this, "Finding where you are\u2026", Toast.LENGTH_SHORT).show();
        try {
            com.google.android.gms.location.LocationServices.getFusedLocationProviderClient(this)
                    .getCurrentLocation(com.google.android.gms.location.Priority.PRIORITY_BALANCED_POWER_ACCURACY, null)
                    .addOnSuccessListener(loc -> {
                        if (loc == null) {
                            Toast.makeText(this, "Couldn't find your location.", Toast.LENGTH_SHORT).show();
                            return;
                        }
                        nameLocation(loc.getLatitude(), loc.getLongitude());
                    });
        } catch (SecurityException e) {
            Toast.makeText(this, "Location access is off.", Toast.LENGTH_SHORT).show();
        }
    }

    /** "Slovenska cesta 10" (or the town) for a spot, looked up in the background. */
    private void nameLocation(double lat, double lng) {
        new Thread(() -> {
            String name = String.format(java.util.Locale.US, "%.5f, %.5f", lat, lng);
            String address = null;
            try {
                List<android.location.Address> found = new android.location.Geocoder(this).getFromLocation(lat, lng, 1);
                if (found != null && !found.isEmpty()) {
                    android.location.Address a = found.get(0);
                    String street = a.getThoroughfare();
                    if (street != null) name = a.getSubThoroughfare() != null ? street + " " + a.getSubThoroughfare() : street;
                    else if (a.getLocality() != null) name = a.getLocality();
                    address = a.getAddressLine(0);
                }
            } catch (java.io.IOException | IllegalArgumentException ignored) {
                // Keep the coordinates as the name.
            }
            final String n = name, addr = address;
            runOnUiThread(() -> {
                try {
                    location = new JSONObject().put("name", n).put("lat", lat).put("lng", lng);
                    if (addr != null && !addr.equals(n)) location.put("address", addr);
                } catch (JSONException ignored) {
                    location = null;
                }
                buildChips();
            });
        }).start();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQUEST_LOCATION) return;
        for (int r : results) {
            if (r == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                currentLocation();
                return;
            }
        }
        Toast.makeText(this, "Location access is needed for that.", Toast.LENGTH_SHORT).show();
    }

    // ---- priority and attachment ----

    private void pickPriority(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        String[] names = { "Priority 1", "Priority 2", "Priority 3", "Priority 4" };
        int[] colors = { R.color.widget_due_overdue, R.color.widget_due_tomorrow, R.color.widget_accent, R.color.widget_text };
        for (int i = 0; i < 4; i++) {
            android.text.SpannableString s = new android.text.SpannableString("\u2691  " + names[i]);
            s.setSpan(new android.text.style.ForegroundColorSpan(getColor(colors[i])), 0, 1, 0);
            menu.getMenu().add(0, i, i, s);
        }
        menu.setOnMenuItemClickListener(item -> {
            priority = 4 - item.getItemId(); // P1 is stored as 4
            buildChips();
            return true;
        });
        menu.show();
    }

    private void pickFile() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "image/*", "application/pdf", "*/*" });
        try {
            startActivityForResult(intent, REQUEST_FILE);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No file picker on this phone.", Toast.LENGTH_SHORT).show();
        }
    }

    /** Keeps a copy of the picked file until the sync job has stored it. */
    private void keepFile(android.net.Uri uri) {
        new Thread(() -> {
            try {
                android.content.ContentResolver resolver = getContentResolver();
                String type = resolver.getType(uri);
                String name = "file";
                try (android.database.Cursor c = resolver.query(uri,
                        new String[] { android.provider.OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                    if (c != null && c.moveToFirst() && c.getString(0) != null) name = c.getString(0);
                }
                String id = TaskLogic.newId();
                java.io.File dir = new java.io.File(getFilesDir(), "widget_uploads");
                dir.mkdirs();
                java.io.File out = new java.io.File(dir, id);
                try (java.io.InputStream in = resolver.openInputStream(uri);
                     java.io.OutputStream os = new java.io.FileOutputStream(out)) {
                    if (in == null) throw new java.io.IOException("unreadable");
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    long total = 0;
                    while ((n = in.read(buf)) != -1) {
                        total += n;
                        if (total > 25L * 1024 * 1024) throw new java.io.IOException("too big");
                        os.write(buf, 0, n);
                    }
                }
                final String fname = name, ftype = type != null ? type : "application/octet-stream";
                runOnUiThread(() -> {
                    if (attachment != null) attachment.delete();
                    attachment = out;
                    attachmentId = id;
                    attachmentName = fname;
                    attachmentType = ftype;
                    buildChips();
                });
            } catch (java.io.IOException | SecurityException e) {
                runOnUiThread(() -> Toast.makeText(this, "Couldn't attach that file (up to 10 MB).", Toast.LENGTH_SHORT).show());
            }
        }).start();
    }

    private TextView chip(String label, Integer icon, int colorRes) {
        TextView chip = new TextView(this);
        chip.setText(label);
        chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        int color = getColor(colorRes);
        chip.setTextColor(color);
        chip.setGravity(Gravity.CENTER_VERTICAL);
        chip.setBackgroundResource(R.drawable.qa_chip_bg);
        // Tall, easy targets (like Todoist's card), level with the send button.
        chip.setMinHeight(dp(40));
        chip.setPadding(dp(14), 0, label.isEmpty() ? dp(6) : dp(16), 0);
        chip.setSingleLine(true);
        if (icon != null) {
            Drawable d = getDrawable(icon);
            if (d != null) {
                d.setBounds(0, 0, dp(22), dp(22));
                chip.setCompoundDrawables(d, null, null, null);
                chip.setCompoundDrawablePadding(label.isEmpty() ? 0 : dp(8));
                chip.setCompoundDrawableTintList(ColorStateList.valueOf(color));
            }
        }
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMarginEnd(dp(8));
        chip.setLayoutParams(lp);
        return chip;
    }

    /**
     * Every place a task can go: each project, then its sections; the Inbox
     * first, the shopping list left out. Each entry is {projectId, sectionId or
     * null, full label ("Inbox / To-do"), the name shown in the list}.
     */
    private static List<String[]> targets(JSONObject data) {
        List<String[]> out = new ArrayList<>();
        JSONArray projects = data != null ? data.optJSONArray("projects") : null;
        JSONArray sections = data != null ? data.optJSONArray("sections") : null;
        List<JSONObject> list = new ArrayList<>();
        if (projects != null) {
            for (int i = 0; i < projects.length(); i++) {
                JSONObject p = projects.optJSONObject(i);
                if (p != null && !"shopping".equals(p.optString("viewStyle"))) list.add(p);
            }
        }
        list.sort((a, b) -> {
            boolean ia = a.optBoolean("isInboxProject") || "inbox".equals(a.optString("id"));
            boolean ib = b.optBoolean("isInboxProject") || "inbox".equals(b.optString("id"));
            if (ia != ib) return ia ? -1 : 1;
            return Double.compare(a.optDouble("order", 0), b.optDouble("order", 0));
        });
        for (JSONObject p : list) {
            String pid = p.optString("id");
            boolean inbox = p.optBoolean("isInboxProject") || "inbox".equals(pid);
            String name = inbox ? "Inbox" : p.optString("name");
            List<JSONObject> secs = new ArrayList<>();
            if (sections != null) {
                for (int i = 0; i < sections.length(); i++) {
                    JSONObject s = sections.optJSONObject(i);
                    if (s != null && pid.equals(s.optString("projectId")) && !s.optBoolean("archived")) secs.add(s);
                }
            }
            secs.sort((a, b) -> Double.compare(a.optDouble("order", 0), b.optDouble("order", 0)));
            out.add(new String[] { pid, null, name, name });
            for (JSONObject s : secs) {
                out.add(new String[] { pid, s.optString("id"), name + " / " + s.optString("name"), s.optString("name") });
            }
        }
        if (out.isEmpty()) out.add(new String[] { "inbox", null, "Inbox", "Inbox" });
        return out;
    }

    private String targetLabel(JSONObject data) {
        for (String[] t : targets(data)) {
            if (t[0].equals(projectId) && (t[1] == null ? sectionId == null : t[1].equals(sectionId))) return t[2];
        }
        JSONObject project = TaskLogic.findProject(data, projectId);
        return project == null || project.optBoolean("isInboxProject") ? "Inbox" : project.optString("name");
    }

    /** The chip shows just the project; its section is in the list it opens. */
    private String projectName(JSONObject data) {
        JSONObject project = TaskLogic.findProject(data, projectId);
        return project == null || project.optBoolean("isInboxProject") ? "Inbox" : project.optString("name");
    }

    /** Where it goes: each project with its sections under it, over the card like the + menu. */
    private void pickProject(View anchor) {
        JSONObject data = store.getSnapshot();
        List<String[]> targets = targets(data);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(0, dp(8), 0, dp(8));
        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        scroll.setBackgroundResource(R.drawable.qa_menu_bg);
        scroll.setElevation(dp(10));
        scroll.setClipToOutline(true);
        scroll.addView(box);
        int width = Math.round(getResources().getDisplayMetrics().widthPixels - dp(40));
        android.widget.PopupWindow popup = new android.widget.PopupWindow(scroll, width,
                LinearLayout.LayoutParams.WRAP_CONTENT, true);
        popup.setElevation(dp(10));
        popup.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(android.graphics.Color.TRANSPARENT));
        for (String[] t : targets) {
            boolean section = t[1] != null;
            boolean current = t[0].equals(projectId) && (section ? t[1].equals(sectionId) : sectionId == null);
            JSONObject project = TaskLogic.findProject(data, t[0]);
            boolean inbox = "inbox".equals(t[0]) || (project != null && project.optBoolean("isInboxProject"));
            int icon = section ? R.drawable.ic_qa_section : inbox ? R.drawable.ic_w_inbox : R.drawable.ic_w_hash;
            int color = getColor(current ? R.color.widget_accent : R.color.widget_text);
            TextView row = new TextView(this);
            row.setText(t[3]);
            row.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            row.setTextColor(color);
            if (current) row.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setSingleLine(true);
            row.setEllipsize(android.text.TextUtils.TruncateAt.END);
            row.setMinHeight(dp(50));
            row.setPadding(section ? dp(44) : dp(20), 0, dp(20), 0);
            row.setBackgroundResource(selectableBackground());
            Drawable d = getDrawable(icon);
            if (d != null) {
                d.setBounds(0, 0, dp(22), dp(22));
                row.setCompoundDrawables(d, null, null, null);
                row.setCompoundDrawablePadding(dp(18));
                row.setCompoundDrawableTintList(ColorStateList.valueOf(
                        current ? color : getColor(R.color.widget_text_secondary)));
            }
            row.setOnClickListener(v -> {
                popup.dismiss();
                projectId = t[0];
                sectionId = t[1];
                buildChips();
            });
            box.addView(row);
        }
        // Above the card, at most about half the screen tall (it scrolls past that).
        int[] at = new int[2];
        anchor.getLocationOnScreen(at);
        int room = Math.max(dp(160), Math.min(at[1] - dp(40), getResources().getDisplayMetrics().heightPixels / 2));
        box.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.UNSPECIFIED);
        int height = Math.min(box.getMeasuredHeight(), room);
        popup.setHeight(height);
        popup.showAtLocation(anchor, Gravity.TOP | Gravity.START, dp(20), Math.max(dp(8), at[1] - height - dp(24)));
    }

    private int selectableBackground() {
        TypedValue out = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackground, out, true);
        return out.resourceId;
    }


    private void pickDay(View anchor) {
        String today = TaskLogic.todayStr();
        Calendar c = TaskLogic.calendarFor(today);
        int dow = c.get(Calendar.DAY_OF_WEEK);
        int toSaturday = (Calendar.SATURDAY - dow + 7) % 7;
        int toMonday = (Calendar.MONDAY - dow + 7) % 7;
        final String[] days = {
                today,
                TaskLogic.addDaysStr(today, 1),
                TaskLogic.addDaysStr(today, toSaturday == 0 ? 7 : toSaturday),
                TaskLogic.addDaysStr(today, toMonday == 0 ? 7 : toMonday),
                null,
        };
        String[] labels = { "Today", "Tomorrow", "This weekend", "Next week", "No date" };
        PopupMenu menu = new PopupMenu(this, anchor);
        for (int i = 0; i < labels.length; i++) menu.getMenu().add(0, i, i, labels[i]);
        menu.setOnMenuItemClickListener(item -> {
            day = days[item.getItemId()];
            buildChips();
            return true;
        });
        menu.show();
    }

    private String dayLabel(String d) {
        if (d == null) return "Date";
        TaskLogic.Row row = rowFor(d);
        return TaskLogic.dueLabel(row);
    }

    private int dayColor(String d) {
        if (d == null) return R.color.widget_text_secondary;
        switch (TaskLogic.dueKind(d)) {
            case TODAY: return R.color.widget_due_today;
            case TOMORROW: return R.color.widget_due_tomorrow;
            case OVERDUE: return R.color.widget_due_overdue;
            default: return R.color.widget_due_later;
        }
    }

    private static TaskLogic.Row rowFor(String d) {
        try {
            JSONObject t = new JSONObject().put("id", "").put("projectId", "").put("content", "")
                    .put("due", new JSONObject().put("date", d));
            return new TaskLogic.Row(t, null);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The things most often bought that aren't on the list now. */
    private List<String> usualItems(JSONObject data) {
        List<String> out = new ArrayList<>();
        JSONObject project = TaskLogic.findProject(data, projectId);
        JSONObject bought = project != null ? project.optJSONObject("bought") : null;
        if (bought == null) return out;
        JSONObject guide = data.optJSONObject("shoppingGuide");
        Set<String> onList = new HashSet<>();
        JSONArray tasks = data.optJSONArray("tasks");
        if (tasks != null) {
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject t = tasks.optJSONObject(i);
                if (t != null && projectId.equals(t.optString("projectId")) && !t.optBoolean("completed")) {
                    onList.add(ShoppingLogic.parseItem(guide, t.optString("content")).name.toLowerCase());
                }
            }
        }
        List<JSONObject> entries = new ArrayList<>();
        java.util.Iterator<String> keys = bought.keys();
        while (keys.hasNext()) {
            JSONObject e = bought.optJSONObject(keys.next());
            if (e != null && !onList.contains(e.optString("name").toLowerCase())) entries.add(e);
        }
        entries.sort((a, b) -> Integer.compare(b.optInt("n"), a.optInt("n")));
        for (int i = 0; i < entries.size() && out.size() < 10; i++) out.add(entries.get(i).optString("name"));
        return out;
    }

    // ---- shops ----

    private void pickStore() {
        List<String> stores = ShoppingLogic.stores(store.getSnapshot(), projectId);
        String[] names = new String[stores.size() + 1];
        names[0] = "Any shop";
        int checked = 0;
        for (int i = 0; i < stores.size(); i++) {
            names[i + 1] = stores.get(i);
            if (stores.get(i).equals(shopStore)) checked = i + 1;
        }
        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Buy in")
                .setSingleChoiceItems(names, checked, (d, which) -> {
                    shopStore = which == 0 ? null : stores.get(which - 1);
                    d.dismiss();
                    buildChips();
                })
                .show();
    }

    // ---- meals ----

    private void pickMeal() {
        List<JSONObject> meals = ShoppingLogic.meals(store.getSnapshot(), projectId);
        if (meals.isEmpty()) {
            Toast.makeText(this, "Open the app once to load the meals.", Toast.LENGTH_SHORT).show();
            return;
        }
        String[] names = new String[meals.size()];
        for (int i = 0; i < meals.size(); i++) {
            JSONObject m = meals.get(i);
            names[i] = m.optString("emoji", "\uD83C\uDF7D") + "  " + m.optString("name");
        }
        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Add a meal")
                .setItems(names, (d, which) -> pickServings(meals.get(which)))
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void pickServings(JSONObject meal) {
        final int[] servings = { 2 };
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(24), dp(8), dp(24), 0);

        LinearLayout stepper = new LinearLayout(this);
        stepper.setGravity(Gravity.CENTER_VERTICAL);
        TextView minus = chip("\u2212", null, R.color.widget_text);
        TextView count = new TextView(this);
        count.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        count.setTextColor(getColor(R.color.widget_text));
        count.setPadding(dp(8), 0, dp(16), 0);
        TextView plus = chip("+", null, R.color.widget_text);
        stepper.addView(minus);
        stepper.addView(count);
        stepper.addView(plus);
        body.addView(stepper);

        TextView hint = new TextView(this);
        hint.setText("Untick what you already have at home.");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        hint.setTextColor(getColor(R.color.widget_text_secondary));
        hint.setPadding(0, dp(10), 0, dp(2));
        body.addView(hint);

        // One tick box per ingredient: ticked ones go on the list.
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        android.widget.ScrollView listScroll = new android.widget.ScrollView(this);
        listScroll.addView(list);
        body.addView(listScroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, Math.round(getResources().getDisplayMetrics().heightPixels * 0.4f)));
        JSONArray ings = meal.optJSONArray("ingredients");
        final boolean[] skip = new boolean[ings != null ? ings.length() : 0];

        Runnable refresh = () -> {
            count.setText(servings[0] + (servings[0] == 1 ? " serving" : " servings"));
            list.removeAllViews();
            List<ShoppingLogic.Item> items = ingredients(meal, servings[0]);
            for (int i = 0; i < items.size() && i < skip.length; i++) {
                final int n = i;
                android.widget.CheckBox box = new android.widget.CheckBox(this);
                box.setText(ShoppingLogic.itemTitle(items.get(i)));
                box.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
                box.setTextColor(getColor(R.color.widget_text));
                box.setButtonTintList(android.content.res.ColorStateList.valueOf(getColor(R.color.widget_accent)));
                box.setChecked(!skip[n]);
                box.setOnCheckedChangeListener((b, checked) -> skip[n] = !checked);
                list.addView(box);
            }
        };
        minus.setOnClickListener(v -> {
            if (servings[0] > 1) servings[0]--;
            refresh.run();
        });
        plus.setOnClickListener(v -> {
            if (servings[0] < 20) servings[0]++;
            refresh.run();
        });
        refresh.run();

        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle(meal.optString("emoji", "") + "  " + meal.optString("name"))
                .setView(body)
                .setPositiveButton("Add to list", (d, w) -> addMeal(meal, servings[0], skip))
                .setNegativeButton("Back", (d, w) -> pickMeal())
                .show();
    }

    private static List<ShoppingLogic.Item> ingredients(JSONObject meal, int servings) {
        List<ShoppingLogic.Item> out = new ArrayList<>();
        JSONArray ings = meal.optJSONArray("ingredients");
        if (ings != null) {
            for (int i = 0; i < ings.length(); i++) {
                JSONObject ing = ings.optJSONObject(i);
                if (ing != null) out.add(ShoppingLogic.scaled(ing, servings));
            }
        }
        return out;
    }

    private void addMeal(JSONObject meal, int servings, boolean[] skip) {
        JSONObject data = store.getSnapshot();
        if (data == null) return;
        String name = meal.optString("name");
        try {
            String at = TaskLogic.nowIso();
            List<ShoppingLogic.Item> all = ingredients(meal, servings);
            JSONArray ings = meal.optJSONArray("ingredients");
            int added = 0;
            for (int i = 0; i < all.size(); i++) {
                // Leave out what's already at home.
                if (i < skip.length && skip[i]) continue;
                // An ingredient bought at its own shop ("@Hofer" in the app) keeps it.
                JSONObject ing = ings != null ? ings.optJSONObject(i) : null;
                String own = ing != null ? ing.optString("store", "") : "";
                String id = TaskLogic.newId();
                queue(data, new JSONObject().put("id", "shop@" + id).put("op", WidgetStore.OP_SHOP)
                        .put("projectId", projectId).put("line", ShoppingLogic.itemTitle(all.get(i))).put("meal", name)
                        .put("newId", id).put("at", at).putOpt("store", own.isEmpty() ? shopStore : own));
                added++;
            }
            confirm("\u2713 " + name + " (" + servings + "): " + added + " ingredients");
        } catch (JSONException e) {
            Toast.makeText(this, "Couldn't add that meal.", Toast.LENGTH_SHORT).show();
        }
    }

    // ---- adding ----

    private void submit() {
        String typed = text.getText().toString().trim();
        if (typed.isEmpty()) return;
        if (shopping) {
            addShopLines(ShoppingLogic.splitItems(typed));
        } else {
            addTask(typed);
        }
        text.setText("");
    }

    private void addTask(String typed) {
        QuickParse parsed = QuickParse.parse(typed);
        if (parsed.content.isEmpty()) return;
        JSONObject data = store.getSnapshot();
        if (data == null) return;
        try {
            String at = TaskLogic.nowIso();
            String taskDay = parsed.day != null ? parsed.day : day;
            JSONObject due = taskDay != null ? TaskLogic.makeDue(taskDay, parsed.time) : null;
            int prio = parsed.priority > 0 ? parsed.priority : priority > 0 ? priority : 1;
            JSONObject task = TaskLogic.newTask(TaskLogic.newId(), parsed.content, projectId, prio, due,
                    TaskLogic.nextOrder(data, projectId, sectionId), at);
            if (sectionId != null) task.put("sectionId", sectionId);
            String notes = description.getText().toString().trim();
            if (!notes.isEmpty()) task.put("description", notes);
            if (!labels.isEmpty()) task.put("labels", new JSONArray(labels));
            if (location != null) task.put("location", location);
            queue(data, new JSONObject().put("id", "create@" + task.getString("id")).put("op", WidgetStore.OP_CREATE)
                    .put("task", task).put("at", at));
            if (attachment != null) {
                store.addPendingOp(new JSONObject().put("id", "attach@" + attachmentId).put("op", WidgetStore.OP_ATTACH)
                        .put("taskId", task.getString("id")).put("attId", attachmentId)
                        .put("path", attachment.getPath()).put("name", attachmentName).put("type", attachmentType)
                        .put("at", at));
                attachment = null; // the sync job has it now
                WidgetSyncJob.schedule(this);
            }
            resetExtras();
            buildChips();
            JSONObject project = TaskLogic.findProject(data, projectId);
            String where = targetLabel(data);
            confirm("✓ " + parsed.content + " → " + where);
        } catch (JSONException e) {
            Toast.makeText(this, "Couldn't add that task.", Toast.LENGTH_SHORT).show();
        }
    }

    private void addShopLines(List<String> lines) {
        JSONObject data = store.getSnapshot();
        if (data == null || lines.isEmpty()) return;
        try {
            String at = TaskLogic.nowIso();
            List<String> names = new ArrayList<>();
            List<String> known = ShoppingLogic.stores(data, projectId);
            for (String typed : lines) {
                // "hrenovke 2 @spar": that item for that shop (else the Shop chip's).
                String[] split = ShoppingLogic.takeStore(typed, known);
                String line = split[0];
                String id = TaskLogic.newId();
                queue(data, new JSONObject().put("id", "shop@" + id).put("op", WidgetStore.OP_SHOP)
                        .put("projectId", projectId).put("line", line).put("newId", id).put("at", at)
                        .putOpt("store", split[1] != null ? split[1] : shopStore));
                names.add(ShoppingLogic.parseItem(data.optJSONObject("shoppingGuide"), line).name);
            }
            confirm("✓ " + android.text.TextUtils.join(", ", names));
        } catch (JSONException e) {
            Toast.makeText(this, "Couldn't add that.", Toast.LENGTH_SHORT).show();
        }
    }

    /** Queued for the sync job, shown in the widget straight away. */
    private void queue(JSONObject data, JSONObject entry) {
        store.addPendingOp(entry);
        if (WidgetStore.applyPending(data, entry)) store.saveSnapshot(data, false);
        TaskWidgetProvider.updateAll(this);
        WidgetSyncJob.schedule(this);
    }

    private void confirm(String message) {
        added.setText(message);
        added.setVisibility(View.VISIBLE);
    }

    // ---- voice ----

    private void listen() {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "sl-SI");
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "sl-SI");
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, shopping ? "Kaj dodam na seznam?" : "Kaj je treba narediti?");
        try {
            startActivityForResult(intent, REQUEST_VOICE);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "This phone has no voice input.", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) keepFile(data.getData());
            return;
        }
        if (requestCode != REQUEST_VOICE || resultCode != RESULT_OK || data == null) return;
        ArrayList<String> heard = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (heard == null || heard.isEmpty()) return;
        String said = heard.get(0).trim();
        if (said.isEmpty()) return;
        // On the shopping list what's said is added straight away as its
        // items. A task only goes into the field (after anything already
        // typed), to check and send.
        if (shopping) {
            addShopLines(ShoppingLogic.splitSpoken(store.getSnapshot(), said));
            return;
        }
        String now = text.getText().toString().trim();
        text.setText(now.isEmpty() ? said : now + " " + said);
        text.setSelection(text.getText().length());
        text.requestFocus();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
