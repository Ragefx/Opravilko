package com.opravilko.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;

import com.opravilko.app.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Ticking a task off in the widget, the way the app does it: the circle
 * fills with a tick and a line strikes through the name, the row fades, and
 * only then is the task done and gone from the list. A widget can't animate
 * smoothly, so these are steps, each a redraw of the list. A repeating task
 * stays (with its next date), so it only gets the tick and the line.
 */
final class CompleteAnimation {
    static final int NONE = 0;
    static final int TICKED = 1;
    static final int FADING = 2;

    private static final long FADE_AT = 450;
    private static final long DONE_AT = 800;
    private static final long REPEAT_DONE_AT = 650;
    /** How faded a row is on its way out. */
    static final float FADED_ALPHA = 0.35f;

    private static final Map<String, Integer> PHASES = new ConcurrentHashMap<>();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private CompleteAnimation() {}

    static int phase(String taskId) {
        Integer p = taskId != null ? PHASES.get(taskId) : null;
        return p != null ? p : NONE;
    }

    static void start(Context context, String taskId, String dueDate) {
        Context app = context.getApplicationContext();
        if (PHASES.containsKey(taskId)) return; // a second tap mid-way
        boolean repeating = isRepeating(new WidgetStore(app).getSnapshot(), taskId);
        PHASES.put(taskId, TICKED);
        refresh(app);
        if (!repeating) {
            MAIN.postDelayed(() -> {
                if (PHASES.containsKey(taskId)) {
                    PHASES.put(taskId, FADING);
                    refresh(app);
                }
            }, FADE_AT);
        }
        MAIN.postDelayed(() -> {
            PHASES.remove(taskId);
            // Redraws the widget without it (or with its next date).
            WidgetActionActivity.completeTask(app, taskId, dueDate);
        }, repeating ? REPEAT_DONE_AT : DONE_AT);
    }

    /** The name with a line through it. */
    static CharSequence struck(String text) {
        SpannableString s = new SpannableString(text != null ? text : "");
        s.setSpan(new StrikethroughSpan(), 0, s.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return s;
    }

    /** The filled, ticked circle for a priority (stored 4..1). */
    static int doneDrawable(int priority) {
        switch (priority) {
            case 4: return R.drawable.widget_check_done_4;
            case 3: return R.drawable.widget_check_done_3;
            case 2: return R.drawable.widget_check_done_2;
            default: return R.drawable.widget_check_done_1;
        }
    }

    private static boolean isRepeating(JSONObject data, String taskId) {
        JSONArray tasks = data != null ? data.optJSONArray("tasks") : null;
        JSONObject task = tasks != null ? TaskLogic.findTask(tasks, taskId) : null;
        JSONObject due = task != null ? task.optJSONObject("due") : null;
        return due != null && due.optBoolean("isRecurring");
    }

    /** Just the lists, redrawn with each row's step. */
    private static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TaskWidgetProvider.class));
        if (ids != null && ids.length > 0) manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }
}
