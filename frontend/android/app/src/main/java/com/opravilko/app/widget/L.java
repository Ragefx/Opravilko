package com.opravilko.app.widget;

import android.content.Context;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * The app's language on the phone's own screens (widget, quick add,
 * notifications): English or Slovenian, as chosen in the app's Settings
 * (handed over with the widget data). Text is written as
 * L.t("English", "Slovensko") where it's shown.
 */
public final class L {
    private static final String PREFS = "opravilko_widget";
    private static final String KEY = "lang";
    private static volatile Context app;
    private static volatile Boolean sl;

    private L() {}

    /** Remembers the app context; called by WidgetStore (and the plugins). */
    public static void load(Context context) {
        if (app == null && context != null) app = context.getApplicationContext();
    }

    /** Saves the language picked in the app ("en" or "sl"). */
    public static void set(Context context, String lang) {
        load(context);
        boolean next = "sl".equals(lang);
        if (app != null) app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, next ? "sl" : "en").apply();
        sl = next;
    }

    public static boolean sl() {
        if (sl == null && app != null) {
            sl = "sl".equals(app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "en"));
        }
        return sl != null && sl;
    }

    /** The text in the chosen language. */
    public static String t(String en, String slText) {
        return sl() ? slText : en;
    }

    /** Day and month names in the chosen language. */
    public static Locale locale() {
        return sl() ? Locale.forLanguageTag("sl") : Locale.ENGLISH;
    }

    /** A date in the chosen language, with a pattern for each. */
    public static String date(String enPattern, String slPattern, Date d) {
        return new SimpleDateFormat(sl() ? slPattern : enPattern, locale()).format(d);
    }

    /** Slovenian for the strings in res/values (by their name); English comes from the resources. */
    private static final java.util.Map<String, String> SL_RES = new java.util.HashMap<>();
    static {
        SL_RES.put("widget_label", "Opravilko naloge");
        SL_RES.put("widget_description", "Danes, prihajajoče, prejeto ali projekt. Odkljukaj naloge kar na začetnem zaslonu.");
        SL_RES.put("widget_default_title", "Danes");
        SL_RES.put("widget_empty", "Vse opravljeno");
        SL_RES.put("widget_empty_signed_out", "Odpri Opravilko in se prijavi, da vidiš svoje naloge tukaj.");
        SL_RES.put("widget_add_task", "Dodaj nalogo");
        SL_RES.put("widget_complete_task", "Opravi nalogo");
        SL_RES.put("widget_config_title", "Prikaži v tem pripomočku");
        SL_RES.put("widget_config_hint", "Enkrat odpri aplikacijo, da se tukaj prikažejo tudi tvoji projekti.");
        SL_RES.put("widget_switch_view", "Izberi, kaj pripomoček prikazuje");
        SL_RES.put("widget_add_by_voice", "Dodaj nalogo z glasom");
        SL_RES.put("widget_refresh", "Osveži");
        SL_RES.put("widget_reschedule", "Prestavi");
        SL_RES.put("widget_bought", "Kupljeno");
        SL_RES.put("widget_shopping_empty", "Nakupovalni seznam je prazen");
        SL_RES.put("qa_task_hint", "Ime naloge");
        SL_RES.put("qa_shop_hint", "Dodaj: mleko 1 l, 2x jajca");
        SL_RES.put("qa_description_hint", "Opis");
        SL_RES.put("widget_cal_prev", "Prejšnji mesec");
        SL_RES.put("widget_cal_next", "Naslednji mesec");
        SL_RES.put("shortcut_add", "Dodaj nalogo");
        SL_RES.put("shortcut_shopping", "Nakupovalni seznam");
        SL_RES.put("shortcut_shopping_voice", "Dodaj v nakupe");
        SL_RES.put("shortcut_calendar", "Koledar");
    }

    /** A string from res/values in the chosen language. */
    public static String res(Context context, int id) {
        load(context);
        if (sl()) {
            String slText = SL_RES.get(context.getResources().getResourceEntryName(id));
            if (slText != null) return slText;
        }
        return context.getString(id);
    }

    /** "sreda" → "Sreda": Slovenian day and month names are lowercase. */
    public static String cap(String s) {
        return s == null || s.isEmpty() ? s : s.substring(0, 1).toUpperCase(locale()) + s.substring(1);
    }
}
