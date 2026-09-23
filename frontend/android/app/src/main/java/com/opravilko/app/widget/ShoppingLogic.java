package com.opravilko.app.widget;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The shopping list as the widget shows it: an item's name and amount from
 * its title ("Moka 500 g", "Jajca 10×") and its category's icon. Mirrors
 * src/utils/shopping.ts (itemTitle, guessCategory); the word lists come from
 * the app with the widget's data ("shoppingGuide"), so both stay in step.
 */
final class ShoppingLogic {
    private static final Locale SL = Locale.forLanguageTag("sl");
    private static final Pattern AMOUNT = Pattern.compile(
            "^(.+?)\\s+(\\d+(?:,\\d+)?(?:×|\\s?(?:kg|g|ml|l|strok|stroka|strokov|glava|pločevinka|žlica|žlička|kocka|paket)))$");

    private ShoppingLogic() {}

    /** A view of a project shown as a shopping list. */
    static boolean isShoppingView(JSONObject data, String view) {
        if (data == null || !view.startsWith(WidgetStore.PROJECT_PREFIX)) return false;
        JSONObject p = TaskLogic.findProject(data, view.substring(WidgetStore.PROJECT_PREFIX.length()));
        return p != null && "shopping".equals(p.optString("viewStyle"));
    }

    /** {name, amount or null} from an item's title. */
    static String[] parse(String title) {
        String t = title.trim();
        Matcher m = AMOUNT.matcher(t);
        if (m.matches()) return new String[] { m.group(1), m.group(2) };
        return new String[] { t, null };
    }

    /** The category's emoji: picked by hand ("kat: dairy" in the notes), else guessed from the name. */
    static String emoji(JSONObject data, String description, String name) {
        JSONObject guide = data != null ? data.optJSONObject("shoppingGuide") : null;
        String id = null;
        for (String line : description.split("\n")) {
            String l = line.trim();
            if (l.startsWith("kat:")) id = l.substring(4).trim();
        }
        if (id == null) id = guess(guide, name);
        JSONObject emoji = guide != null ? guide.optJSONObject("emoji") : null;
        String e = emoji != null ? emoji.optString(id, null) : null;
        return e != null ? e : "🛒"; // 🛒
    }

    static String guess(JSONObject guide, String name) {
        if (guide == null) return "other";
        String lower = name.toLowerCase(SL).trim();
        JSONObject learned = guide.optJSONObject("learned");
        if (learned != null && learned.has(lower)) return learned.optString(lower);
        JSONArray phrases = guide.optJSONArray("phrases");
        if (phrases != null) {
            for (int i = 0; i < phrases.length(); i++) {
                JSONArray p = phrases.optJSONArray(i);
                if (p != null && lower.contains(p.optString(0))) return p.optString(1);
            }
        }
        JSONObject stems = guide.optJSONObject("stems");
        JSONArray order = guide.optJSONArray("order");
        if (stems == null || order == null) return "other";
        for (String word : lower.split("[^\\p{L}-]+")) {
            if (word.isEmpty()) continue;
            for (int i = 0; i < order.length(); i++) {
                String id = order.optString(i);
                JSONArray list = stems.optJSONArray(id);
                if (list == null) continue;
                for (int k = 0; k < list.length(); k++) {
                    if (stemMatches(word, list.optString(k))) return id;
                }
            }
        }
        return "other";
    }

    private static boolean stemMatches(String word, String stem) {
        if (stem.length() <= 3) return word.equals(stem) || (word.startsWith(stem) && word.length() == stem.length() + 1);
        return word.startsWith(stem);
    }
}
