package com.opravilko.app.widget;

import android.app.DatePickerDialog;
import android.content.Intent;
import android.graphics.Typeface;
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
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.opravilko.app.MainActivity;
import com.opravilko.app.R;

import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * A task tapped in the widget, opened right over the home screen instead of
 * in the app: its name, notes, date and priority; Save, Delete, or Open in
 * app for the rest (sub-tasks, comments, files). Changes show in the widget
 * at once and are sent on by WidgetSyncJob, like a tick.
 */
public class TaskItemActivity extends WidgetSheetActivity {
    static final String EXTRA_TASK_ID = "com.opravilko.app.widget.TASK_ID";

    private JSONObject task;
    /** The date picked ("yyyy-MM-dd"), or null for none. */
    private String date;
    private int priority;
    private LinearLayout dateChips;
    private LinearLayout priorityChips;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new WidgetStore(this);
        JSONObject data = store.getSnapshot();
        String taskId = getIntent().getStringExtra(EXTRA_TASK_ID);
        task = data != null && taskId != null ? TaskLogic.findTask(data.optJSONArray("tasks"), taskId) : null;
        if (task == null) {
            Toast.makeText(this, "That task isn't on the list any more.", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }
        JSONObject due = task.optJSONObject("due");
        date = due != null ? due.optString("date", null) : null;
        priority = task.optInt("priority", 1);

        LinearLayout sheet = openSheet();

        // Where it lives, small, above the name.
        String where = projectName(data, task.optString("projectId"));
        if (where != null) {
            TextView w = new TextView(this);
            w.setText(where);
            w.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
            w.setTypeface(Typeface.DEFAULT_BOLD);
            w.setTextColor(color(R.color.widget_text_secondary));
            w.setPadding(dp(2), 0, 0, dp(6));
            sheet.addView(w);
        }

        EditText name = field(task.optString("content"), "Task name",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        sheet.addView(name, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        String html = task.optString("description", "");
        String shownNotes = plain(html);
        EditText notes = field(shownNotes, "Description",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        notes.setMinLines(2);
        notes.setGravity(Gravity.TOP | Gravity.START);
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        nlp.topMargin = dp(10);
        sheet.addView(notes, nlp);

        sheet.addView(caption("Date"));
        dateChips = chipRow(sheet);
        buildDateChips();

        sheet.addView(caption("Priority"));
        priorityChips = chipRow(sheet);
        buildPriorityChips();

        // Delete on the left; Open in app and Save on the right.
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
        actions.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
        TextView open = button("Open in app", color(R.color.widget_text_secondary), 0);
        open.setOnClickListener(v -> openInApp());
        actions.addView(open);
        TextView save = button("Save", color(R.color.widget_on_accent), color(R.color.widget_accent));
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        slp.setMarginStart(dp(8));
        actions.addView(save, slp);
        save.setOnClickListener(v -> save(name.getText().toString(), notes.getText().toString(), html, shownNotes));

        showSheet();
    }

    // ---- date ----

    private void buildDateChips() {
        dateChips.removeAllViews();
        String today = TaskLogic.todayStr();
        String tomorrow = TaskLogic.addDaysStr(today, 1);
        String nextWeek = TaskLogic.addDaysStr(today, 7);
        addChip(dateChips, "No date", date == null, v -> pickDate(null));
        addChip(dateChips, "Today", today.equals(date), v -> pickDate(today));
        addChip(dateChips, "Tomorrow", tomorrow.equals(date), v -> pickDate(tomorrow));
        addChip(dateChips, "Next week", nextWeek.equals(date), v -> pickDate(nextWeek));
        boolean other = date != null && !date.equals(today) && !date.equals(tomorrow) && !date.equals(nextWeek);
        addChip(dateChips, other ? dayLabel(date) : "Pick a day…", other, v -> showCalendar());
    }

    private void pickDate(String day) {
        date = day;
        buildDateChips();
    }

    private void showCalendar() {
        Calendar c = date != null ? TaskLogic.calendarFor(date) : null;
        if (c == null) c = Calendar.getInstance();
        new DatePickerDialog(this, (view, y, m, d) -> {
            Calendar picked = Calendar.getInstance();
            picked.set(y, m, d);
            pickDate(TaskLogic.dayFormat().format(picked.getTime()));
        }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show();
    }

    /** "Thu 2 Oct". */
    private static String dayLabel(String day) {
        Calendar c = TaskLogic.calendarFor(day);
        return c != null ? new SimpleDateFormat("EEE d MMM", Locale.getDefault()).format(c.getTime()) : day;
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

    private void buildPriorityChips() {
        priorityChips.removeAllViews();
        // Stored 4..1, shown as P1..P4 (as in the app).
        for (int stored = 4; stored >= 1; stored--) {
            final int p = stored;
            addChip(priorityChips, "P" + (5 - stored), priority == stored, v -> {
                priority = p;
                buildPriorityChips();
            });
        }
    }

    // ---- saving ----

    private void save(String name, String notes, String html, String shownNotes) {
        if (name.trim().isEmpty()) {
            Toast.makeText(this, "The task needs a name.", Toast.LENGTH_SHORT).show();
            return;
        }
        JSONObject data = store.getSnapshot();
        if (data == null) return;
        try {
            String at = TaskLogic.nowIso();
            // Notes left as they were keep their formatting from the app.
            String description = notes.trim().equals(shownNotes.trim()) ? html : toHtml(notes.trim());
            JSONObject op = new JSONObject().put("id", "edit@" + task.optString("id") + "@" + at)
                    .put("op", WidgetStore.OP_EDIT).put("taskId", task.optString("id"))
                    .put("content", name.trim().replace('\n', ' '))
                    .put("description", description)
                    .put("at", at);
            if (priority != task.optInt("priority", 1)) op.put("priority", priority);
            JSONObject oldDue = task.optJSONObject("due");
            String oldDate = oldDue != null ? oldDue.optString("date", null) : null;
            if (!TextUtils.equals(oldDate, date)) {
                JSONObject due = newDue();
                op.put("dueSet", true).put("due", due != null ? due : JSONObject.NULL);
            }
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
            Toast.makeText(this, "Deleted " + task.optString("content"), Toast.LENGTH_SHORT).show();
            finish();
        } catch (JSONException e) {
            Toast.makeText(this, "Couldn't delete that.", Toast.LENGTH_SHORT).show();
        }
    }

    private void openInApp() {
        Uri uri = Uri.parse("opravilko://open?task=" + Uri.encode(task.optString("id"))
                + "&project=" + Uri.encode(task.optString("projectId", "inbox")));
        Intent open = new Intent(Intent.ACTION_VIEW, uri, this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(open);
        finish();
    }

    // ---- helpers ----

    private static String projectName(JSONObject data, String projectId) {
        if (projectId == null || "inbox".equals(projectId)) return "Inbox";
        JSONObject p = TaskLogic.findProject(data, projectId);
        if (p == null) return null;
        return p.optBoolean("isInboxProject") ? "Inbox" : "# " + p.optString("name");
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
