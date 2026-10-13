package com.opravilko.app.widget;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * Slovenian public holidays for the widget's month view (src/utils/holidays.ts):
 * the work-free days and the other holidays, in Slovenian, with Easter and
 * Pentecost worked out for the year.
 */
final class Holidays {
    private Holidays() {}

    static final class Holiday {
        final String date;
        final String name;
        final boolean free;

        Holiday(String date, String name, boolean free) {
            this.date = date;
            this.name = name;
            this.free = free;
        }
    }

    private static final Object[][] FIXED = {
        {1, 1, "Novo leto", true},
        {1, 2, "Novo leto", true},
        {2, 8, "Prešernov dan", true},
        {4, 27, "Dan upora proti okupatorju", true},
        {5, 1, "Praznik dela", true},
        {5, 2, "Praznik dela", true},
        {6, 8, "Dan Primoža Trubarja", false},
        {6, 25, "Dan državnosti", true},
        {8, 15, "Marijino vnebovzetje", true},
        {8, 17, "Združitev prekmurskih Slovencev", false},
        {9, 15, "Vrnitev Primorske", false},
        {9, 23, "Dan slovenskega športa", false},
        {10, 25, "Dan suverenosti", false},
        {10, 31, "Dan reformacije", true},
        {11, 1, "Dan spomina na mrtve", true},
        {11, 23, "Dan Rudolfa Maistra", false},
        {12, 25, "Božič", true},
        {12, 26, "Dan samostojnosti in enotnosti", true},
    };

    /** Easter Sunday (Gregorian): {month 1-12, day}. */
    static int[] easter(int year) {
        int a = year % 19, b = year / 100, c = year % 100, d = b / 4, e = b % 4;
        int f = (b + 8) / 25, g = (b - f + 1) / 3, h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4, k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = (a + 11 * h + 22 * l) / 451;
        return new int[] {(h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1};
    }

    /** The holidays' names in English, for the app in English. */
    private static final java.util.Map<String, String> EN = new java.util.HashMap<>();
    static {
        EN.put("Novo leto", "New Year's Day");
        EN.put("Prešernov dan", "Prešeren Day");
        EN.put("Dan upora proti okupatorju", "Day of Uprising Against Occupation");
        EN.put("Praznik dela", "Labour Day");
        EN.put("Dan Primoža Trubarja", "Primož Trubar Day");
        EN.put("Dan državnosti", "Statehood Day");
        EN.put("Marijino vnebovzetje", "Assumption Day");
        EN.put("Združitev prekmurskih Slovencev", "Unification of Prekmurje Slovenes");
        EN.put("Vrnitev Primorske", "Return of Primorska");
        EN.put("Dan slovenskega športa", "Slovenian Sports Day");
        EN.put("Dan suverenosti", "Sovereignty Day");
        EN.put("Dan reformacije", "Reformation Day");
        EN.put("Dan spomina na mrtve", "Remembrance Day");
        EN.put("Dan Rudolfa Maistra", "Rudolf Maister Day");
        EN.put("Božič", "Christmas Day");
        EN.put("Dan samostojnosti in enotnosti", "Independence and Unity Day");
        EN.put("Velika noč", "Easter Sunday");
        EN.put("Velikonočni ponedeljek", "Easter Monday");
        EN.put("Binkošti", "Whit Sunday");
    }

    private static String name(String sl) {
        if (L.sl()) return sl;
        String en = EN.get(sl);
        return en != null ? en : sl;
    }

    static List<Holiday> of(int year) {
        List<Holiday> out = new ArrayList<>();
        for (Object[] f : FIXED) {
            out.add(new Holiday(String.format(Locale.US, "%04d-%02d-%02d", year, (int) f[0], (int) f[1]),
                    name((String) f[2]), (boolean) f[3]));
        }
        int[] e = easter(year);
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(year, e[0] - 1, e[1]);
        String[] names = {name("Velika noč"), name("Velikonočni ponedeljek"), name("Binkošti")};
        int[] offsets = {0, 1, 49};
        for (int n = 0; n < 3; n++) {
            Calendar x = (Calendar) c.clone();
            x.add(Calendar.DAY_OF_MONTH, offsets[n]);
            out.add(new Holiday(TaskLogic.dayFormat().format(x.getTime()), names[n], true));
        }
        return out;
    }
}
