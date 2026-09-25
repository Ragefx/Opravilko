package com.opravilko.app.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import com.opravilko.app.MainActivity;
import com.opravilko.app.R;

import org.json.JSONObject;

/**
 * The home-screen task list widget: a header (what it shows, a switch for
 * that, voice and add buttons) over a scrolling list of headings and tasks. Rows come from TaskWidgetService;
 * taps on rows go to WidgetActionActivity via one PendingIntent template.
 */
public class TaskWidgetProvider extends AppWidgetProvider {
    static final String EXTRA_ACTION = "com.opravilko.app.widget.ACTION";
    static final String EXTRA_TASK_ID = "com.opravilko.app.widget.TASK_ID";
    static final String EXTRA_PROJECT_ID = "com.opravilko.app.widget.PROJECT_ID";
    static final String EXTRA_DUE_DATE = "com.opravilko.app.widget.DUE_DATE";
    static final String ACTION_COMPLETE = "complete";
    static final String ACTION_OPEN = "open";
    /** A shopping item tapped in the widget: its own editing card, over the home screen. */
    static final String ACTION_EDIT_ITEM = "edit_item";
    /** A task tapped in the widget: opened over the home screen (TaskItemActivity). */
    static final String ACTION_EDIT_TASK = "editTask";
    static final String ACTION_RESCHEDULE = "reschedule";

    /** Refresh from Dropbox on the periodic update if the copy is older than this. */
    private static final long REFRESH_AFTER_MS = 15 * 60 * 1000;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) manager.updateAppWidget(id, buildViews(context, id));
        manager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_list);
        WidgetStore store = new WidgetStore(context);
        if (store.hasAuth()) WidgetSyncJob.schedulePeriodic(context);
        if (store.hasAuth() && System.currentTimeMillis() - store.getLastRefresh() > REFRESH_AFTER_MS) {
            WidgetSyncJob.schedule(context);
        }
    }

    @Override
    public void onDisabled(Context context) {
        // The periodic sync keeps running with no widget: reminders set on the
        // website reach the phone through it.
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        WidgetStore store = new WidgetStore(context);
        for (int id : appWidgetIds) store.removeView(id);
    }

    /** Redraws every Opravilko widget from the stored data. */
    public static void updateAll(Context context) {
        // Every change to the tasks passes here: keep the reminders in step.
        ReminderScheduler.reschedule(context);
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TaskWidgetProvider.class));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) manager.updateAppWidget(id, buildViews(context, id));
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    static RemoteViews buildViews(Context context, int appWidgetId) {
        WidgetStore store = new WidgetStore(context);
        String view = store.getView(appWidgetId);
        JSONObject data = store.getSnapshot();
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_task_list);

        boolean shopping = ShoppingLogic.isShoppingView(data, view);
        views.setTextViewText(R.id.widget_title, shopping ? "Shopping" : TaskLogic.viewTitle(data, view));
        views.setImageViewResource(R.id.widget_logo, shopping ? R.drawable.ic_w_cart : R.drawable.ic_w_logo);
        views.setTextViewText(R.id.widget_empty, data == null
                ? context.getString(R.string.widget_empty_signed_out)
                : context.getString(shopping ? R.string.widget_shopping_empty : R.string.widget_empty));

        // The list's rows are built by TaskWidgetService; a unique data URI
        // per widget keeps Android from sharing one adapter between widgets.
        Intent service = new Intent(context, TaskWidgetService.class);
        service.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        service.setData(Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, service);
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);

        // One template for all row taps (complete / open); rows fill in the details.
        Intent template = new Intent(context, WidgetActionActivity.class);
        template.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        PendingIntent templatePi = PendingIntent.getActivity(context, appWidgetId, template,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        views.setPendingIntentTemplate(R.id.widget_list, templatePi);

        views.setOnClickPendingIntent(R.id.widget_logo, openApp(context, appWidgetId * 8 + 1,
                shopping ? "opravilko://open?view=shopping" : "opravilko://open?view=" + Uri.encode(view)));
        // + and the mic: the Add task sheet over the home screen (items on the shopping list).
        views.setOnClickPendingIntent(R.id.widget_add, quickAdd(context, appWidgetId, view, false));
        views.setOnClickPendingIntent(R.id.widget_voice, quickAdd(context, appWidgetId, view, true));

        // ▾ next to the title: choose what this widget shows.
        Intent pick = new Intent(context, WidgetConfigActivity.class);
        pick.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        pick.setData(Uri.parse("opravilko-widget://config/" + appWidgetId));
        pick.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        views.setOnClickPendingIntent(R.id.widget_switch, PendingIntent.getActivity(context, appWidgetId * 8 + 4, pick,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return views;
    }

    private static PendingIntent quickAdd(Context context, int appWidgetId, String view, boolean voice) {
        Intent intent = new Intent(context, QuickAddActivity.class);
        intent.putExtra(QuickAddActivity.EXTRA_VIEW, view);
        intent.putExtra(QuickAddActivity.EXTRA_VOICE, voice);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        // A distinct data URI per widget and button, so their extras don't get mixed up.
        intent.setData(Uri.parse("opravilko-widget://add/" + appWidgetId + (voice ? "/voice" : "")));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, appWidgetId * 8 + (voice ? 3 : 2), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent openApp(Context context, int requestCode, String uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
