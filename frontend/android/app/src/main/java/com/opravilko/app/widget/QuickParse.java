package com.opravilko.app.widget;

import java.util.Calendar;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The widget's Add task box reads a few things from what you type, like the
 * app's quick add (src/utils/quickAddParse.ts) does: a day ("danes", "jutri",
 * "pojutrišnjem", "v petek", "today", "friday"), a time ("ob 9h", "ob 9:30",
 * "14:00") and a priority ("p1".."p3"). Everything else is the task's name.
 */
final class QuickParse {
    private static final Locale SL = Locale.forLanguageTag("sl");

    final String content;
    /** "yyyy-MM-dd" or null. */
    final String day;
    /** "HH:mm" or null. */
    final String time;
    /** Stored priority 2..4 (p3..p1), or 0 if none typed. */
    final int priority;

    private QuickParse(String content, String day, String time, int priority) {
        this.content = content;
        this.day = day;
        this.time = time;
        this.priority = priority;
    }

    private static final String[][] WEEKDAYS = {
            // Calendar.MONDAY.. with Slovenian (and accusative) and English names.
            { "ponedeljek", "monday", "mon" },
            { "torek", "tuesday", "tue" },
            { "sreda", "sredo", "wednesday", "wed" },
            { "četrtek", "cetrtek", "thursday", "thu" },
            { "petek", "friday", "fri" },
            { "sobota", "soboto", "saturday", "sat" },
            { "nedelja", "nedeljo", "sunday", "sun" },
    };

    static QuickParse parse(String input) {
        String text = " " + input.trim().replaceAll("\\s+", " ") + " ";
        String today = TaskLogic.todayStr();
        String day = null;
        String time = null;
        int priority = 0;

        Matcher p = Pattern.compile("(?i)\\s[pP]([1-3])(?=\\s)").matcher(text);
        if (p.find()) {
            priority = 5 - Integer.parseInt(p.group(1));
            text = text.substring(0, p.start()) + text.substring(p.end());
        }

        Matcher t = Pattern.compile("(?iu)\\s(?:ob\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s?h(?=\\s)|\\s(?:ob\\s+)(\\d{1,2})(?:[:.](\\d{2}))?(?=\\s)|\\s(\\d{1,2})[:.](\\d{2})(?=\\s)").matcher(text);
        if (t.find()) {
            String h = t.group(1) != null ? t.group(1) : t.group(3) != null ? t.group(3) : t.group(5);
            String m = t.group(1) != null ? t.group(2) : t.group(3) != null ? t.group(4) : t.group(6);
            int hour = Integer.parseInt(h);
            int min = m != null ? Integer.parseInt(m) : 0;
            if (hour < 24 && min < 60) {
                time = String.format(Locale.US, "%02d:%02d", hour, min);
                text = text.substring(0, t.start()) + text.substring(t.end());
            }
        }

        String lower = text.toLowerCase(SL);
        String[][] words = {
                { "danes", "0" }, { "today", "0" }, { "jutri", "1" }, { "tomorrow", "1" },
                { "pojutrišnjem", "2" }, { "pojutri", "2" },
        };
        for (String[] w : words) {
            Matcher d = Pattern.compile("(?iu)\\s" + w[0] + "(?=\\s)").matcher(lower);
            if (d.find()) {
                day = TaskLogic.addDaysStr(today, Integer.parseInt(w[1]));
                text = text.substring(0, d.start()) + text.substring(d.end());
                lower = text.toLowerCase(SL);
                break;
            }
        }
        if (day == null) {
            outer:
            for (int i = 0; i < WEEKDAYS.length; i++) {
                for (String name : WEEKDAYS[i]) {
                    Matcher d = Pattern.compile("(?iu)\\s(?:(?:v|na|on|this)\\s+)?" + name + "(?=\\s)").matcher(lower);
                    if (!d.find()) continue;
                    Calendar c = TaskLogic.calendarFor(today);
                    int target = i == 6 ? Calendar.SUNDAY : Calendar.MONDAY + i;
                    int shift = (target - c.get(Calendar.DAY_OF_WEEK) + 7) % 7;
                    day = TaskLogic.addDaysStr(today, shift);
                    text = text.substring(0, d.start()) + text.substring(d.end());
                    break outer;
                }
            }
        }
        if (time != null && day == null) day = today;
        return new QuickParse(text.trim().replaceAll("\\s+", " "), day, time, priority);
    }
}
