package com.opravilko.app.widget;

import android.app.DatePickerDialog;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.Html;
import android.text.InputType;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.TextView;
import android.widget.Toast;

import com.opravilko.app.MainActivity;
import com.opravilko.app.R;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * A task tapped in the widget, opened right over the home screen (not in the
 * app) and laid out like the app's task window: the name with its tick
 * circle, the description, a card of Project / Date / Repeat / Priority (and
 * who it's shared with), then its sub-tasks. Changes are kept when it closes
 * (×, Back, or a tap beside it); ⋯ has Open in app and Delete. Saved changes
 * show in the widget at once and are sent on by WidgetSyncJob, like a tick.
 */
public class TaskItemActivity extends WidgetSheetActivity {
    static final String EXTRA_TASK_ID = "com.opravilko.app.widget.TASK_ID";

    private JSONObject task;
    /** The date picked ("yyyy-MM-dd"), or null for none. */
    private String date;
    private int priority;
    private EditText name;
    private EditText notes;
    private String html;
    private String shownNotes;
    private TextView dateValue;
    private TextView priorityValue;
    private ImageView circle;
    /** Saved (or dropped) once, whichever way the card closes. */
    private boolean done;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new WidgetStore(this);
        JSONObject data = store.getSnapshot();
        String taskId = getIntent().getStringExtra(EXTRA_TASK_ID);
        task = data != null && taskId != null ? TaskLogic.findTask(data.optJSONArray("tasks"), taskId) : null;
        if (task == null) {
            done = true;
            Toast.makeText(this, "That task isn't on the list any more.", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }
        JSONObject due = task.optJSONObject("due");
        date = due != null ? due.optString("date", null) : null;
        priority = task.optInt("priority", 1);
        boolean event = TaskLogic.isEvent(task);

        LinearLayout sheet = openSheet();

        // × · where it lives · ⋯ (as at the top of the app's task window)
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView close = iconText("✕", 20);
        close.setOnClickListener(v -> finish());
        top.addView(close);
        TextView where = new TextView(this);
        where.setText(projectName(data, task.optString("projectId")));
        where.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        where.setTypeface(Typeface.DEFAULT_BOLD);
        where.setTextColor(color(R.color.widget_text_secondary));
        where.setGravity(Gravity.CENTER);
        where.setSingleLine(true);
        where.setEllipsize(TextUtils.TruncateAt.END);
        top.addView(where, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView more = iconText("⋯", 22);
        more.setOnClickListener(this::showMore);
        top.addView(more);
        sheet.addView(top, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // The tick circle (an event's mark) and the name.
        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setOrientation(LinearLayout.HORIZONTAL);
        titleRow.setGravity(Gravity.TOP);
        circle = new ImageView(this);
        circle.setImageResource(event ? R.drawable.widget_event_mark : checkDrawable(priority));
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(dp(26), dp(26));
        clp.topMargin = dp(7);
        clp.setMarginEnd(dp(10));
        circle.setPadding(dp(2), dp(2), dp(2), dp(2));
        if (!event) circle.setOnClickListener(v -> completeIt());
        titleRow.addView(circle, clp);
        name = bare(task.optString("content"), "Task name", 21, true);
        titleRow.addView(name, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tlp.topMargin = dp(10);
        sheet.addView(titleRow, tlp);

        html = task.optString("description", "");
        shownNotes = plain(html);
        notes = bare(shownNotes, "Description", 15, false);
        notes.setTextColor(color(R.color.widget_text_secondary));
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        nlp.setMarginStart(dp(36));
        sheet.addView(notes, nlp);

        // The card of properties.
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable cbg = new GradientDrawable();
        cbg.setColor(color(R.color.widget_bg));
        cbg.setStroke(dp(1), color(R.color.widget_divider));
        cbg.setCornerRadius(dp(16));
        card.setBackground(cbg);
        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardLp.topMargin = dp(16);
        sheet.addView(card, cardLp);

        String projectId = task.optString("projectId");
        boolean inbox = "inbox".equals(projectId) || projectId.startsWith("inbox");
        addRow(card, inbox ? R.drawable.ic_w_inbox : R.drawable.ic_w_hash, "Project",
                projectName(data, projectId), null, false);
        dateValue = addRow(card, R.drawable.ic_w_calendar, "Date", "", v -> showCalendar(), true);
        showDate();
        if (due != null && due.optBoolean("isRecurring")) {
            addRow(card, R.drawable.ic_w_repeat, "Repeat", due.optString("string", "Repeats"), null, true);
        }
        priorityValue = addRow(card, R.drawable.ic_qa_flag, "Priority", "", this::pickPriority, true);
        showPriority();
        JSONArray shared = task.optJSONArray("sharedWith");
        if (shared != null && shared.length() > 0) {
            addRow(card, R.drawable.ic_w_tick, "Midva", "Shared", null, true);
        }

        // Its open sub-tasks, to tick off here too.
        JSONArray tasks = data.optJSONArray("tasks");
        LinearLayout subs = null;
        if (tasks != null) {
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject t = tasks.optJSONObject(i);
                if (t == null || t.optBoolean("completed") || !task.optString("id").equals(t.optString("parentId"))) continue;
                if (subs == null) {
                    sheet.addView(caption("SUB-TASKS"));
                    subs = new LinearLayout(this);
                    subs.setOrientation(LinearLayout.VERTICAL);
                    sheet.addView(subs);
                }
                subs.addView(subTaskRow(t));
            }
        }

        TextView open = new TextView(this);
        open.setText("Comments, files and more: open in the app");
        open.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        open.setTextColor(color(R.color.widget_accent));
        open.setPadding(dp(4), dp(18), dp(4), dp(4));
        open.setOnClickListener(v -> openInApp());
        sheet.addView(open);

        showSheet();
    }

    // ---- pieces ----

    private TextView iconText(String glyph, int sp) {
        TextView b = new TextView(this);
        b.setText(glyph);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        b.setTextColor(color(R.color.widget_text));
        b.setGravity(Gravity.CENTER);
        b.setMinWidth(dp(44));
        b.setMinHeight(dp(44));
        return b;
    }

    /** A field without a box, as in the app's task window. */
    private EditText bare(String value, String hint, int sp, boolean bold) {
        EditText e = new EditText(this);
        e.setText(value);
        e.setHint(hint);
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        if (bold) e.setTypeface(Typeface.DEFAULT_BOLD);
        e.setTextColor(color(R.color.widget_text));
        e.setHintTextColor(color(R.color.widget_text_muted));
        e.setBackground(null);
        e.setPadding(0, dp(6), 0, dp(6));
        return e;
    }

    /** A row of the card: icon, caption over the value; returns the value to update. */
    private TextView addRow(LinearLayout card, int icon, String caption, String value, View.OnClickListener click, boolean divider) {
        if (divider && card.getChildCount() > 0) {
            View line = new View(this);
            line.setBackgroundColor(color(R.color.widget_divider));
            card.addView(line, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)));
        }
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(14), dp(10), dp(14), dp(10));
        ImageView i = new ImageView(this);
        i.setImageResource(icon);
        i.setColorFilter(color(R.color.widget_text_secondary));
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(dp(20), dp(20));
        ilp.setMarginEnd(dp(14));
        row.addView(i, ilp);
        LinearLayout text = new LinearLayout(this);
        text.setOrientation(LinearLayout.VERTICAL);
        TextView c = new TextView(this);
        c.setText(caption);
        c.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        c.setTextColor(color(R.color.widget_text_muted));
        text.addView(c);
        TextView v = new TextView(this);
        v.setText(value);
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        v.setTextColor(color(R.color.widget_text));
        text.addView(v);
        row.addView(text, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        if (click != null) {
            TextView chevron = new TextView(this);
            chevron.setText("›");
            chevron.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
            chevron.setTextColor(color(R.color.widget_text_muted));
            row.addView(chevron);
            row.setOnClickListener(click);
        }
        card.addView(row);
        return v;
    }

    private View subTaskRow(JSONObject sub) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(2), dp(6), dp(2), dp(6));
        ImageView c = new ImageView(this);
        c.setImageResource(checkDrawable(sub.optInt("priority", 1)));
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(dp(22), dp(22));
        clp.setMarginEnd(dp(12));
        row.addView(c, clp);
        TextView t = new TextView(this);
        t.setText(sub.optString("content"));
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        t.setTextColor(color(R.color.widget_text));
        row.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        c.setOnClickListener(v -> {
            JSONObject sd = sub.optJSONObject("due");
            WidgetActionActivity.completeTask(this, sub.optString("id"), sd != null ? sd.optString("date", null) : null);
            row.setAlpha(0.4f);
            row.setEnabled(false);
            c.setOnClickListener(null);
        });
        return row;
    }

    private static int checkDrawable(int priority) {
        switch (priority) {
            case 4: return R.drawable.widget_check_4;
            case 3: return R.drawable.widget_check_3;
            case 2: return R.drawable.widget_check_2;
            default: return R.drawable.widget_check_1;
        }
    }

    // ---- date ----

    private void showDate() {
        if (date == null) {
            dateValue.setText("No date");
            dateValue.setTextColor(color(R.color.widget_text_muted));
            return;
        }
        String today = TaskLogic.todayStr();
        String label = date.equals(today) ? "Today"
                : date.equals(TaskLogic.addDaysStr(today, 1)) ? "Tomorrow"
                : dayLabel(date);
        JSONObject due = task.optJSONObject("due");
        if (due != null && date.equals(due.optString("date")) && due.has("datetime") && !due.isNull("datetime")) {
            Date dt = ReminderLogic.parseIso(due.optString("datetime"));
            if (dt != null) label += " · " + new SimpleDateFormat("HH:mm", Locale.US).format(dt);
        }
        dateValue.setText(label);
        boolean late = date.compareTo(today) < 0 && !TaskLogic.isEvent(task);
        dateValue.setTextColor(color(late ? R.color.widget_due_overdue : R.color.widget_accent));
    }

    private void showCalendar() {
        Calendar c = date != null ? TaskLogic.calendarFor(date) : null;
        if (c == null) c = Calendar.getInstance();
        DatePickerDialog dialog = new DatePickerDialog(this, (view, y, m, d) -> {
            Calendar picked = Calendar.getInstance();
            picked.set(y, m, d);
            date = TaskLogic.dayFormat().format(picked.getTime());
            showDate();
        }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH));
        if (date != null) {
            dialog.setButton(DatePickerDialog.BUTTON_NEUTRAL, "No date", (d, which) -> {
                date = null;
                showDate();
            });
        }
        dialog.show();
    }

    /** "Thu 2 Oct". */
    private static String dayLabel(String day) {
        Calendar c = TaskLogic.calendarFor(day);
        return c != null ? new SimpleDateFormat("EEE d MMM", Locale.ENGLISH).format(c.getTime()) : day;
    }

    /** The task's due moved to the picked day: its time and repeat rule stay. */
    private JSONObject newDue() throws JSONException {
        if (date == null) return null;
        JSONObject old = task.optJSONObject("due");
        JSONObject due = old != null ? new JSONObject(old.toString()) : new JSONObject().put("isRecurring", false);
        String was = old != null ? old.optString("date", date) : date;
        due.put("date", date);
        Calendar day = TaskLogic.calendarFor(date);
        String label = day != null ? new SimpleDateFormat("MMM d, yyyy", Locale.ENGLISH).format(day.getTime()) : date;
        if (due.has("datetime") && !due.isNull("datetime")) {
            Date dt = TaskLogic.parseIso(due.optString("datetime"));
            if (dt != null) {
                Calendar c = Calendar.getInstance();
                c.setTime(dt);
                c.add(Calendar.DAY_OF_MONTH, TaskLogic.daysBetween(was, date));
                due.put("datetime", TaskLogic.isoFormat().format(c.getTime()));
                label += " at " + new SimpleDateFormat("HH:mm", Locale.US).format(c.getTime());
            }
        }
        if (!due.optBoolean("isRecurring")) due.put("string", label);
        return due;
    }

    // ---- priority ----

    private void pickPriority(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor, Gravity.END);
        // Stored 4..2, shown as P1..P3, and 1 as no priority (as in the app).
        for (int stored = 4; stored >= 1; stored--) {
            menu.getMenu().add(0, stored, 5 - stored, stored == 1 ? "No priority" : "Priority " + (5 - stored));
        }
        menu.setOnMenuItemClickListener(item -> {
            priority = item.getItemId();
            showPriority();
            if (!TaskLogic.isEvent(task)) circle.setImageResource(checkDrawable(priority));
            return true;
        });
        menu.show();
    }

    private void showPriority() {
        priorityValue.setText(priority == 1 ? "No priority" : "Priority " + (5 - priority));
        priorityValue.setTextColor(color(priority == 1 ? R.color.widget_text_muted : R.color.widget_text));
    }

    // ---- ⋯ ----

    private void showMore(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor, Gravity.END);
        menu.getMenu().add(0, 1, 0, "Open in app");
        menu.getMenu().add(0, 2, 1, "Delete");
        menu.setOnMenuItemClickListener(item -> {
            if (item.getItemId() == 1) openInApp();
            else delete();
            return true;
        });
        menu.show();
    }

    // ---- saving ----

    /** Closing (×, Back, a tap beside it) keeps what was changed, as in the app. */
    @Override
    public void finish() {
        if (!done) {
            done = true;
            saveChanges();
        }
        super.finish();
    }

    private void completeIt() {
        saveChanges();
        done = true;
        JSONObject due = task.optJSONObject("due");
        WidgetActionActivity.completeTask(this, task.optString("id"), due != null ? due.optString("date", null) : null);
        Toast.makeText(this, "✓ " + task.optString("content"), Toast.LENGTH_SHORT).show();
        finish();
    }

    private void saveChanges() {
        if (name == null) return;
        String newName = name.getText().toString().trim().replace('\n', ' ');
        String newNotes = notes.getText().toString().trim();
        JSONObject oldDue = task.optJSONObject("due");
        String oldDate = oldDue != null ? oldDue.optString("date", null) : null;
        boolean nameChanged = !newName.isEmpty() && !newName.equals(task.optString("content"));
        boolean notesChanged = !newNotes.equals(shownNotes.trim());
        boolean dateChanged = !TextUtils.equals(oldDate, date);
        boolean priorityChanged = priority != task.optInt("priority", 1);
        if (!nameChanged && !notesChanged && !dateChanged && !priorityChanged) return;
        JSONObject data = store.getSnapshot();
        if (data == null) return;
        try {
            String at = TaskLogic.nowIso();
            JSONObject op = new JSONObject().put("id", "edit@" + task.optString("id") + "@" + at)
                    .put("op", WidgetStore.OP_EDIT).put("taskId", task.optString("id"))
                    .put("content", newName.isEmpty() ? task.optString("content") : newName)
                    // Notes left as they were keep their formatting from the app.
                    .put("description", notesChanged ? toHtml(newNotes) : html)
                    .put("at", at);
            if (priorityChanged) op.put("priority", priority);
            if (dateChanged) {
                JSONObject due = newDue();
                op.put("dueSet", true).put("due", due != null ? due : JSONObject.NULL);
            }
            queue(data, op);
        } catch (JSONException e) {
            Toast.makeText(this, "Couldn't save that.", Toast.LENGTH_SHORT).show();
        }
    }

    private void delete() {
        done = true;
        JSONObject data = store.getSnapshot();
        if (data != null) {
            try {
                String at = TaskLogic.nowIso();
                queue(data, new JSONObject().put("id", "delete@" + task.optString("id")).put("op", WidgetStore.OP_DELETE)
                        .put("taskId", task.optString("id")).put("at", at));
                Toast.makeText(this, "Deleted " + task.optString("content"), Toast.LENGTH_SHORT).show();
            } catch (JSONException e) {
                Toast.makeText(this, "Couldn't delete that.", Toast.LENGTH_SHORT).show();
            }
        }
        finish();
    }

    private void openInApp() {
        saveChanges();
        done = true;
        Uri uri = Uri.parse("opravilko://open?task=" + Uri.encode(task.optString("id"))
                + "&project=" + Uri.encode(task.optString("projectId", "inbox")));
        Intent open = new Intent(Intent.ACTION_VIEW, uri, this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(open);
        finish();
    }

    // ---- helpers ----

    private static String projectName(JSONObject data, String projectId) {
        if (projectId == null || projectId.isEmpty() || "inbox".equals(projectId) || projectId.startsWith("inbox")) return "Inbox";
        JSONObject p = TaskLogic.findProject(data, projectId);
        if (p == null) return "Midva";
        return p.optBoolean("isInboxProject") ? "Inbox" : p.optString("name");
    }

    /** The app keeps notes as HTML; here they're edited as plain text. */
    private static String plain(String html) {
        if (html == null || html.isEmpty()) return "";
        if (!html.contains("<")) return html;
        return Html.fromHtml(html, Html.FROM_HTML_MODE_COMPACT).toString().trim();
    }

    private static String toHtml(String text) {
        return TextUtils.htmlEncode(text).replace("\n", "<br>");
    }
}
