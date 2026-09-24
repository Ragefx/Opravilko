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

    /** The item's category: picked by hand ("kat: dairy" in the notes), else guessed from the name. */
    static String categoryId(JSONObject data, String description, String name) {
        JSONObject guide = data != null ? data.optJSONObject("shoppingGuide") : null;
        String id = null;
        for (String line : description.split("\n")) {
            String l = line.trim();
            if (l.startsWith("kat:")) id = l.substring(4).trim();
        }
        return id != null ? id : guess(guide, name);
    }

    /** Where a category comes on the list (the shop-walk order); unknown ones last. */
    static int categoryRank(JSONObject data, String id) {
        JSONObject guide = data != null ? data.optJSONObject("shoppingGuide") : null;
        JSONArray order = guide != null ? guide.optJSONArray("categoryOrder") : null;
        if (order != null) for (int i = 0; i < order.length(); i++) if (id.equals(order.optString(i))) return i;
        return 999;
    }

    /** The category's emoji. */
    static String emoji(JSONObject data, String description, String name) {
        JSONObject guide = data != null ? data.optJSONObject("shoppingGuide") : null;
        String id = categoryId(data, description, name);
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

    /** Spoken numbers and units as they're written (src/utils/shopping.ts: NUMBER_WORDS). */
    private static final java.util.Map<String, String> NUMBER_WORDS = new java.util.HashMap<>();
    static {
        String[][] words = {
                { "en", "1" }, { "ena", "1" }, { "eno", "1" }, { "enega", "1" }, { "eden", "1" }, { "dva", "2" },
                { "dve", "2" }, { "tri", "3" }, { "štiri", "4" }, { "stiri", "4" }, { "pet", "5" }, { "šest", "6" },
                { "sest", "6" }, { "sedem", "7" }, { "osem", "8" }, { "devet", "9" }, { "deset", "10" },
                { "enajst", "11" }, { "dvanajst", "12" }, { "trije", "3" }, { "štirje", "4" }, { "stirje", "4" },
                { "pol", "0,5" }, { "kila", "kg" }, { "kile", "kg" }, { "kilo", "kg" }, { "kilogram", "kg" },
                { "kilograma", "kg" }, { "kilogramov", "kg" }, { "liter", "l" }, { "litra", "l" }, { "litre", "l" },
                { "litrov", "l" }, { "deci", "dl" }, { "decilitra", "dl" }, { "deka", "dag" }, { "dekagramov", "dag" },
                { "gramov", "g" }, { "grama", "g" }, { "gram", "g" },
        };
        for (String[] w : words) NUMBER_WORDS.put(w[0], w[1]);
    }

    /**
     * What voice input heard ("mleko in kruh in dva jajca", "mleko kruh
     * jajca") as separate list lines, as the app does (splitSpokenItems):
     * "in" / "pa" / "ter" / commas split, and a run of known groceries with
     * no amounts is one item each ("toaletni papir" stays together).
     */
    static List<String> splitSpoken(JSONObject data, String spoken) {
        JSONObject guide = data != null ? data.optJSONObject("shoppingGuide") : null;
        StringBuilder text = new StringBuilder();
        for (String w : spoken.toLowerCase(SL).replaceAll("[.!?]", " ").trim().split("\\s+")) {
            if (w.isEmpty()) continue;
            if (text.length() > 0) text.append(' ');
            String n = NUMBER_WORDS.get(w);
            text.append(n != null ? n : w);
        }
        List<String> out = new ArrayList<>();
        for (String raw : text.toString().split(",(?!\\d)|\\s(?:in|pa|ter|and)\\s")) {
            String part = raw.trim();
            if (part.isEmpty()) continue;
            String[] words = part.split(" ");
            boolean knownPair = false;
            JSONArray phrases = guide != null ? guide.optJSONArray("phrases") : null;
            if (phrases != null) {
                for (int i = 0; i < phrases.length() && !knownPair; i++) {
                    JSONArray p = phrases.optJSONArray(i);
                    if (p != null && part.contains(p.optString(0))) knownPair = true;
                }
            }
            boolean allGroceries = words.length > 1 && !knownPair;
            for (String w : words) {
                if (!allGroceries) break;
                if (w.matches(".*\\d.*") || "other".equals(guess(guide, w))) allGroceries = false;
            }
            if (allGroceries) java.util.Collections.addAll(out, words);
            else out.add(part);
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
        return addLine(guide, tasks, projectId, line, newId, at, null, null);
    }

    /**
     * As above; `meal` (or null) is the meal it's for, noted on the item ("za: Palačinke"),
     * and `store` (or null) the shop to buy it in ("trg: SPAR").
     */
    static JSONObject addLine(JSONObject guide, JSONArray tasks, String projectId, String line, String newId, String at,
            String meal, String store) {
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
                String description = existing.optString("description", "");
                // Marked for a shop now, unless it already was.
                if (store != null && storeOf(description) == null) description = withLine(description, "trg: ", store);
                existing.put("description", withMeal(description, meal));
                existing.put("updatedAt", at);
                return existing;
            }
            JSONObject task = TaskLogic.newTask(newId, itemTitle(item), projectId, 1, null, (long) maxOrder + 1, at);
            String description = meal != null ? "za: " + meal : "";
            if (store != null) description = withLine(description, "trg: ", store);
            if (!description.isEmpty()) task.put("description", description);
            tasks.put(task);
            return task;
        } catch (JSONException e) {
            return null;
        }
    }

    // ---- editing an item (ShoppingView's ItemEditor) ----

    /** An item's own note: the lines of its notes that aren't "za:", "kat:" or "trg:". */
    static String noteOf(String description) {
        StringBuilder out = new StringBuilder();
        for (String line : (description == null ? "" : description).split("\n")) {
            if (line.startsWith("za: ") || line.startsWith("kat: ") || line.startsWith("trg: ")) continue;
            if (out.length() > 0) out.append('\n');
            out.append(line);
        }
        return out.toString().trim();
    }

    /** The meals line ("za: ...") of an item's notes, or null. */
    private static String mealsLine(String description) {
        for (String line : (description == null ? "" : description).split("\n")) if (line.startsWith("za: ")) return line;
        return null;
    }

    /**
     * An edited item's title, as the app saves it: the name (capitalised) and
     * the amount read the way typing it into the list reads it ("1,5 l", "4",
     * "500 g"); an amount it can't read is left out.
     */
    static String editedTitle(JSONObject guide, String name, String amount) {
        String n = capitalize(name.trim());
        if (amount.trim().isEmpty()) return n;
        Item parsed = parseItem(guide, n + " " + amount.trim());
        if (parsed.amount == null) return n;
        return itemTitle(new Item(n, parsed.amount, parsed.unit));
    }

    /**
     * An edited item's notes: your note, the meals it's for (kept), the
     * category when picked by hand (not the one its name suggests), the shop.
     */
    static String editedDescription(JSONObject guide, String oldDescription, String name, String note,
            String categoryId, String store) {
        List<String> lines = new ArrayList<>();
        if (!note.trim().isEmpty()) lines.add(note.trim());
        String meals = mealsLine(oldDescription);
        if (meals != null) lines.add(meals);
        if (categoryId != null && !categoryId.equals(guess(guide, name.trim()))) lines.add("kat: " + categoryId);
        if (store != null && !store.isEmpty()) lines.add("trg: " + store);
        return join("\n", lines);
    }

    // ---- usual items (ShoppingView: countBought) ----

    /** The key an item is counted under in a list's "bought" (its name, lower-case). */
    static String boughtKey(String name) {
        return name.toLowerCase(new java.util.Locale("sl"));
    }

    /**
     * A ticked-off item counts once more in its shopping list's "bought", which
     * the app's "usual items" row is made from. False if it isn't on a shopping list.
     */
    static boolean countBought(JSONObject data, String taskId) {
        try {
            JSONObject task = TaskLogic.findTask(data.optJSONArray("tasks"), taskId);
            if (task == null || !task.optBoolean("completed")) return false;
            JSONObject project = TaskLogic.findProject(data, task.optString("projectId"));
            if (project == null || !"shopping".equals(project.optString("viewStyle"))) return false;
            String name = parse(task.optString("content"))[0];
            JSONObject bought = project.optJSONObject("bought");
            if (bought == null) {
                bought = new JSONObject();
                project.put("bought", bought);
            }
            JSONObject entry = bought.optJSONObject(boughtKey(name));
            int n = entry != null ? entry.optInt("n", 0) : 0;
            bought.put(boughtKey(name), new JSONObject().put("name", name).put("n", n + 1));
            return true;
        } catch (JSONException e) {
            return false;
        }
    }

    // ---- shops (ShoppingView: storeOf / withStore; shopping.ts: storesOf) ----

    static final String[] DEFAULT_STORES = {"SPAR", "Hofer", "Lidl"};

    /** The shops items can be marked for: the list's own, or SPAR, Hofer and Lidl. */
    static List<String> stores(JSONObject data, String projectId) {
        List<String> out = new ArrayList<>();
        JSONObject project = TaskLogic.findProject(data, projectId);
        JSONArray own = project != null ? project.optJSONArray("stores") : null;
        if (own != null) for (int i = 0; i < own.length(); i++) if (!own.optString(i).isEmpty()) out.add(own.optString(i));
        if (out.isEmpty()) java.util.Collections.addAll(out, DEFAULT_STORES);
        return out;
    }

    /** The shop an item is for ("trg: SPAR" in its notes), or null. */
    static String storeOf(String description) {
        if (description == null) return null;
        for (String line : description.split("\n")) if (line.startsWith("trg: ")) return line.substring(5).trim();
        return null;
    }

    /** `description` with its "<key>value" line replaced (or added last). */
    static String withLine(String description, String key, String value) {
        List<String> lines = new ArrayList<>();
        for (String line : description.split("\n")) if (!line.trim().isEmpty() && !line.startsWith(key)) lines.add(line);
        lines.add(key + value);
        return join("\n", lines);
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
