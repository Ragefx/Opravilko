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
    private LinearLayout chips;
    private TextView added;

    private boolean shopping;
    private String projectId = "inbox";
    /** The date chip: a day, or null for none. Typed dates win over it. */
    private String day;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.widget_quick_add);
        store = new WidgetStore(this);
        text = findViewById(R.id.qa_text);
        send = findViewById(R.id.qa_send);
        chips = findViewById(R.id.qa_chips);
        added = findViewById(R.id.qa_added);

        findViewById(R.id.qa_scrim).setOnClickListener(v -> finish());
        text.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) { updateSendButton(); }
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
        String view = intent.getStringExtra(EXTRA_VIEW);
        if (view == null) view = WidgetStore.VIEW_TODAY;
        shopping = ShoppingLogic.isShoppingView(data, view);
        projectId = TaskLogic.viewProjectId(view);
        if (!shopping && TaskLogic.findProject(data, projectId) == null) projectId = "inbox";
        day = WidgetStore.VIEW_TODAY.equals(view) ? TaskLogic.todayStr() : null;
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

    private void updateSendButton() {
        boolean empty = text.getText().toString().trim().isEmpty();
        send.setImageResource(empty ? R.drawable.ic_qa_mic : R.drawable.ic_qa_send);
        send.setContentDescription(getString(empty ? R.string.widget_add_by_voice : R.string.widget_add_task));
    }

    // ---- chips ----

    private void buildChips() {
        chips.removeAllViews();
        JSONObject data = store.getSnapshot();
        if (shopping) {
            for (String name : usualItems(data)) {
                TextView chip = chip("+ " + name, null, R.color.widget_text);
                chip.setOnClickListener(v -> {
                    addShopLines(java.util.Collections.singletonList(name));
                    chips.removeView(v);
                });
                chips.addView(chip);
            }
            return;
        }
        JSONObject project = TaskLogic.findProject(data, projectId);
        boolean inbox = "inbox".equals(projectId) || project == null || project.optBoolean("isInboxProject");
        TextView projectChip = chip(inbox ? "Inbox" : project.optString("name"),
                inbox ? R.drawable.ic_w_inbox : R.drawable.ic_w_hash, R.color.widget_text);
        projectChip.setOnClickListener(this::pickProject);
        chips.addView(projectChip);

        TextView dateChip = chip(dayLabel(day), R.drawable.ic_w_calendar, dayColor(day));
        dateChip.setOnClickListener(this::pickDay);
        chips.addView(dateChip);
    }

    private TextView chip(String label, Integer icon, int colorRes) {
        TextView chip = new TextView(this);
        chip.setText(label);
        chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        int color = getColor(colorRes);
        chip.setTextColor(color);
        chip.setGravity(Gravity.CENTER_VERTICAL);
        chip.setBackgroundResource(R.drawable.qa_chip_bg);
        chip.setMinHeight(dp(46));
        chip.setPadding(dp(14), 0, dp(16), 0);
        chip.setSingleLine(true);
        if (icon != null) {
            Drawable d = getDrawable(icon);
            if (d != null) {
                d.setBounds(0, 0, dp(20), dp(20));
                chip.setCompoundDrawables(d, null, null, null);
                chip.setCompoundDrawablePadding(dp(8));
                chip.setCompoundDrawableTintList(ColorStateList.valueOf(color));
            }
        }
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMarginEnd(dp(8));
        chip.setLayoutParams(lp);
        return chip;
    }

    private void pickProject(View anchor) {
        JSONObject data = store.getSnapshot();
        PopupMenu menu = new PopupMenu(this, anchor);
        List<String> ids = new ArrayList<>();
        menu.getMenu().add(0, 0, 0, "Inbox");
        ids.add("inbox");
        JSONArray projects = data != null ? data.optJSONArray("projects") : null;
        if (projects != null) {
            List<JSONObject> list = new ArrayList<>();
            for (int i = 0; i < projects.length(); i++) {
                JSONObject p = projects.optJSONObject(i);
                if (p == null || p.optBoolean("isInboxProject") || "inbox".equals(p.optString("id"))) continue;
                if ("shopping".equals(p.optString("viewStyle"))) continue;
                list.add(p);
            }
            list.sort((a, b) -> Double.compare(a.optDouble("order", 0), b.optDouble("order", 0)));
            for (JSONObject p : list) {
                menu.getMenu().add(0, ids.size(), ids.size(), "# " + p.optString("name"));
                ids.add(p.optString("id"));
            }
        }
        menu.setOnMenuItemClickListener(item -> {
            projectId = ids.get(item.getItemId());
            buildChips();
            return true;
        });
        menu.show();
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
            JSONObject task = TaskLogic.newTask(TaskLogic.newId(), parsed.content, projectId,
                    parsed.priority > 0 ? parsed.priority : 1, due, TaskLogic.nextOrder(data, projectId), at);
            queue(data, new JSONObject().put("id", "create@" + task.getString("id")).put("op", WidgetStore.OP_CREATE)
                    .put("task", task).put("at", at));
            JSONObject project = TaskLogic.findProject(data, projectId);
            String where = project == null || project.optBoolean("isInboxProject") ? "Inbox" : project.optString("name");
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
            for (String line : lines) {
                String id = TaskLogic.newId();
                queue(data, new JSONObject().put("id", "shop@" + id).put("op", WidgetStore.OP_SHOP)
                        .put("projectId", projectId).put("line", line).put("newId", id).put("at", at));
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
        if (requestCode != REQUEST_VOICE || resultCode != RESULT_OK || data == null) return;
        ArrayList<String> heard = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (heard == null || heard.isEmpty()) return;
        String said = heard.get(0).trim();
        String now = text.getText().toString().trim();
        text.setText(now.isEmpty() ? said : now + " " + said);
        text.setSelection(text.getText().length());
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
