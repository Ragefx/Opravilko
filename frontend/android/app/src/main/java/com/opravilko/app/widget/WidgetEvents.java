package com.opravilko.app.widget;

/**
 * Lets the running app hear that the widget changed the Dropbox file (so it
 * reloads instead of later hitting a save conflict), without the widget code
 * depending on the app's plugin classes.
 */
public final class WidgetEvents {
    public interface Listener {
        void onWidgetDataChanged();
    }

    private static volatile Listener listener;

    private WidgetEvents() {}

    public static void setListener(Listener l) {
        listener = l;
    }

    static void notifyDataChanged() {
        Listener l = listener;
        if (l != null) l.onWidgetDataChanged();
    }
}
