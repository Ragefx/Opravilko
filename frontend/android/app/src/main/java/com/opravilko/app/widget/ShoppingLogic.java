package com.opravilko.app.widget;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

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

    // ---- adding items from the widget (src/utils/shopping.ts: parseItem, itemTitle, splitItems;
    //      src/components/ShoppingView.tsx: addItems, countsWith, combined) ----

    static final class Item {
        final String name;
        final Double amount;
        final String unit;

        Item(String name, Double amount, String unit) {
            this.name = name;
            this.amount = amount;
            this.unit = unit;
        }
    }

    private static final String UNIT_RE =
            "kg|dag|g|ml|dl|l|kos(?:ov|a)?|x|×|strok(?:a|ov)?|glav(?:a|e|i)?|ploč(?:evink[aei]?)?|žlic(?:a|e|o)?|žličk(?:a|e|i|o)?|kock(?:a|e|i)?|paket(?:a|ov|i)?";
    private static final Pattern ITEM = Pattern.compile(
            "(?<![\\p{L}\\p{N}.,])(\\d+(?:[.,]\\d+)?)(?![.,]?\\d)\\s*(" + UNIT_RE + ")?(?![\\p{L}\\p{N}])(?!\\s*%)"
                    + "|(?<![\\p{L}\\p{N}])(x|×)\\s*(\\d+)(?![\\p{L}\\p{N}])",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /** "mleko 1,5 l, kruh; 2x jajca" -> the separate lines (the comma in "1,5" stays). */
    static List<String> splitItems(String text) {
        List<String> out = new ArrayList<>();
        for (String part : text.split(",(?!\\d)|\\n|;|\\s(?:in|pa|ter)\\s")) {
            String t = part.trim();
            if (!t.isEmpty()) out.add(t);
        }
        return out;
    }

    /** "mleko 1,5 l", "2x jajca", "500 g moke", "kruh" */
    static Item parseItem(JSONObject guide, String text) {
        String raw = text.trim().replaceAll("\\s+", " ");
        Matcher m = ITEM.matcher(raw);
        if (!m.find()) return new Item(capitalize(raw), null, null);
        String number = m.group(1) != null ? m.group(1) : m.group(4);
        double value = Double.parseDouble(number.replace(",", "."));
        String unitWord = m.group(2) != null ? m.group(2).toLowerCase(SL) : (m.group(3) != null ? "x" : "");
        String rest = (raw.substring(0, m.start()) + " " + raw.substring(m.end())).replaceAll("\\s+", " ").trim();
        String name = capitalize(plainName(guide, rest));
        if (name.isEmpty()) return new Item(capitalize(raw), null, null);
        return toBase(name, value, unitWord);
    }

    private static Item toBase(String name, double v, String u) {
        if (u.equals("kg")) return new Item(name, v * 1000, "g");
        if (u.equals("dag")) return new Item(name, v * 10, "g");
        if (u.equals("g")) return new Item(name, v, "g");
        if (u.equals("l")) return new Item(name, v * 1000, "ml");
        if (u.equals("dl")) return new Item(name, v * 100, "ml");
        if (u.equals("ml")) return new Item(name, v, "ml");
        if (u.startsWith("strok")) return new Item(name, v, "strok");
        if (u.startsWith("glav")) return new Item(name, v, "glava");
        if (u.startsWith("ploč")) return new Item(name, v, "pločevinka");
        if (u.startsWith("žličk")) return new Item(name, v, "žlička");
        if (u.startsWith("žlic")) return new Item(name, v, "žlica");
        if (u.startsWith("kock")) return new Item(name, v, "kocka");
        if (u.startsWith("paket")) return new Item(name, v, "paket");
        return new Item(name, v, "kos");
    }

    private static String plainName(JSONObject guide, String name) {
        JSONObject plain = guide != null ? guide.optJSONObject("plain") : null;
        if (plain == null || name.isEmpty()) return name;
        int end = 0;
        while (end < name.length() && Character.isLetter(name.charAt(end))) end++;
        String first = name.substring(0, end).toLowerCase(SL);
        String mapped = plain.optString(first, null);
        return mapped != null ? mapped + name.substring(end) : name;
    }

    private static String capitalize(String s) {
        return s.isEmpty() ? s : s.substring(0, 1).toUpperCase(SL) + s.substring(1);
    }

    private static String num(double n) {
        double r = Math.round(n * 100) / 100.0;
        String s = r == Math.floor(r) ? String.valueOf((long) r) : String.valueOf(r);
        return s.replace(".", ",");
    }

    /** "4×", "120 g", "1,2 kg", "250 ml", "0,5 l", "2 stroka" */
    static String formatAmount(Double amount, String unit) {
        if (amount == null || unit == null) return "";
        switch (unit) {
            case "kos": return num(amount) + "×";
            case "g": return amount >= 1000 ? num(amount / 1000) + " kg" : num(amount) + " g";
            case "ml": return amount >= 500 ? num(amount / 1000) + " l" : num(amount) + " ml";
            case "strok": return num(amount) + " " + (amount == 1 ? "strok" : amount == 2 ? "stroka" : "strokov");
            default: return num(amount) + " " + unit;
        }
    }

    static String itemTitle(Item item) {
        String a = formatAmount(item.amount, item.unit);
        return a.isEmpty() ? item.name : item.name + " " + a;
    }

    private static boolean sameName(Item a, Item b) {
        return a.name.toLowerCase(SL).equals(b.name.toLowerCase(SL));
    }

    static boolean sameItem(Item a, Item b) {
        return sameName(a, b) && (a.unit == null ? b.unit == null : a.unit.equals(b.unit));
    }

    static boolean countsWith(Item have, Item add) {
        return sameName(have, add) && (have.amount == null || "kos".equals(have.unit))
                && (add.amount == null || "kos".equals(add.unit));
    }

    /**
     * Amounts in the same unit add up. Typed by hand, a thing without an amount
     * also counts as one; from a meal, salt-and-pepper things don't pile up.
     */
    static Item combined(Item have, Item add, boolean byHand) {
        if (have.amount != null && add.amount != null && have.unit != null && have.unit.equals(add.unit)) {
            return new Item(have.name, have.amount + add.amount, have.unit);
        }
        if (!byHand) return have;
        boolean havePieces = have.amount == null || "kos".equals(have.unit);
        boolean addPieces = add.amount == null || "kos".equals(add.unit);
        if (havePieces && addPieces) {
            double n = (have.amount == null ? 1 : have.amount) + (add.amount == null ? 1 : add.amount);
            return new Item(have.name, n, "kos");
        }
        return have;
    }

    /**
     * Adds one typed line to the list in `tasks`: onto the same thing already
     * there (the amount counts up), or as a new item with the id given.
     * Returns the task that was changed or made, or null.
     */
    static JSONObject addLine(JSONObject guide, JSONArray tasks, String projectId, String line, String newId, String at) {
        return addLine(guide, tasks, projectId, line, newId, at, null);
    }

    /** As above; `meal` (or null) is the meal it's for, noted on the item ("za: Palačinke"). */
    static JSONObject addLine(JSONObject guide, JSONArray tasks, String projectId, String line, String newId, String at,
            String meal) {
        try {
            Item item = parseItem(guide, line);
            JSONObject match = null;
            JSONObject counting = null;
            double maxOrder = -1;
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject t = tasks.optJSONObject(i);
                if (t == null || !projectId.equals(t.optString("projectId"))) continue;
                if (t.isNull("sectionId") && t.isNull("parentId")) maxOrder = Math.max(maxOrder, t.optDouble("order", 0));
                if (t.optBoolean("completed") || !t.isNull("parentId")) continue;
                Item have = parseItem(guide, t.optString("content"));
                if (match == null && sameItem(have, item)) match = t;
                if (counting == null && countsWith(have, item)) counting = t;
            }
            JSONObject existing = match != null ? match : meal == null ? counting : null;
            if (existing != null) {
                Item next = combined(parseItem(guide, existing.optString("content")), item, meal == null);
                existing.put("content", itemTitle(next));
                existing.put("description", withMeal(existing.optString("description", ""), meal));
                existing.put("updatedAt", at);
                return existing;
            }
            JSONObject task = TaskLogic.newTask(newId, itemTitle(item), projectId, 1, null, (long) maxOrder + 1, at);
            if (meal != null) task.put("description", "za: " + meal);
            tasks.put(task);
            return task;
        } catch (JSONException e) {
            return null;
        }
    }

    // ---- meals (src/utils/shopping.ts: BUILTIN_MEALS, scaled; ShoppingView's MealPicker) ----

    /** Adds "za: <meal>" to an item's notes, next to any other meals it's already for. */
    static String withMeal(String description, String meal) {
        if (meal == null) return description;
        List<String> others = new ArrayList<>();
        String current = null;
        for (String line : description.split("\n")) {
            if (line.startsWith("za: ")) current = line.substring(4);
            else if (!line.trim().isEmpty()) others.add(line);
        }
        List<String> meals = new ArrayList<>();
        if (current != null) for (String m : current.split(", ")) if (!m.isEmpty()) meals.add(m);
        if (meals.contains(meal)) return description;
        meals.add(meal);
        others.add("za: " + join(", ", meals));
        return join("\n", others);
    }

    /**
     * The meals to pick from, as the app lists them: your own first, then the
     * built-in ones (an edited built-in one in place of the original).
     */
    static List<JSONObject> meals(JSONObject data, String projectId) {
        JSONObject guide = data != null ? data.optJSONObject("shoppingGuide") : null;
        JSONObject project = TaskLogic.findProject(data, projectId);
        JSONArray mine = project != null && project.has("meals") ? project.optJSONArray("meals")
                : guide != null ? guide.optJSONArray("localMeals") : null;
        JSONArray builtin = guide != null ? guide.optJSONArray("meals") : null;
        List<JSONObject> out = new ArrayList<>();
        Set<String> builtinIds = new HashSet<>();
        if (builtin != null) for (int i = 0; i < builtin.length(); i++) builtinIds.add(builtin.optJSONObject(i).optString("id"));
        if (mine != null) {
            for (int i = 0; i < mine.length(); i++) {
                JSONObject m = mine.optJSONObject(i);
                if (m != null && !builtinIds.contains(m.optString("id"))) out.add(m);
            }
        }
        if (builtin != null) {
            for (int i = 0; i < builtin.length(); i++) {
                JSONObject b = builtin.optJSONObject(i);
                JSONObject edited = null;
                if (mine != null) {
                    for (int k = 0; k < mine.length(); k++) {
                        JSONObject m = mine.optJSONObject(k);
                        if (m != null && b.optString("id").equals(m.optString("id"))) edited = m;
                    }
                }
                out.add(edited != null ? edited : b);
            }
        }
        return out;
    }

    private static String join(String sep, List<String> parts) {
        StringBuilder b = new StringBuilder();
        for (String p : parts) {
            if (b.length() > 0) b.append(sep);
            b.append(p);
        }
        return b.toString();
    }

    /** An ingredient for this many servings, rounded like the app does. */
    static Item scaled(JSONObject ing, int servings) {
        String name = ing.optString("name");
        if (!ing.has("amount") || ing.isNull("amount") || !ing.has("unit") || ing.isNull("unit")) return new Item(name, null, null);
        String unit = ing.optString("unit");
        double x = ing.optDouble("amount") * servings;
        double amount;
        if (unit.equals("g")) amount = x < 50 ? Math.max(5, Math.round(x / 5) * 5) : Math.round(x / 10) * 10;
        else if (unit.equals("ml")) amount = x < 100 ? Math.max(10, Math.round(x / 10) * 10) : Math.round(x / 50) * 50;
        else amount = Math.ceil(x - 1e-9);
        return new Item(name, amount, unit);
    }
}
