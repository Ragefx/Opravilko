package com.opravilko.app.widget;

import android.appwidget.AppWidgetManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.opravilko.app.R;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The widget's + (and mic): an Add task sheet over the home screen, without
 * opening the app. Tasks: a name ("Pokliči zobarja jutri ob 9h p1" is read
 * like the app's quick add), a project and a date chip. On the shopping list:
 * items ("mleko 1 l, 2x jajca", amounts count up) and your usual items as
 * chips. What's added shows in the widget at once and is synced like a tick.
 */
public class QuickAddActivity extends AppCompatActivity {
    static final String EXTRA_VIEW = "com.opravilko.app.widget.VIEW";
    static final String EXTRA_VOICE = "com.opravilko.app.widget.VOICE";
    private static final int REQUEST_VOICE = 7;

    private WidgetStore store;
    private EditText text;
    private ImageButton send;
    private LinearLayout chips;
    private TextView added;

    private boolean shopping;
    private String projectId = "inbox";
    /** The date chip: a day, or null for none. Typed dates win over it. */
    private String day;
    /** From the chips and the + menu, for the next task. */
    private int priority;
    private final List<String> labels = new ArrayList<>();
    private JSONObject location;
    private java.io.File attachment;
    private String attachmentName, attachmentType, attachmentId;
    private EditText description;
    private static final int REQUEST_FILE = 8;
    private static final int REQUEST_LOCATION = 9;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.widget_quick_add);
        keepAboveKeyboard();
        store = new WidgetStore(this);
        text = findViewById(R.id.qa_text);
        send = findViewById(R.id.qa_send);
        chips = findViewById(R.id.qa_chips);
        added = findViewById(R.id.qa_added);
        description = findViewById(R.id.qa_description);

        findViewById(R.id.qa_scrim).setOnClickListener(v -> finish());
        text.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) { updateSendButton(); }
        });
        text.setOnEditorActionListener((v, actionId, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN;
            if (actionId == EditorInfo.IME_ACTION_SEND || enter) {
                submit();
                return true;
            }
            return false;
        });
        send.setOnClickListener(v -> {
            if (text.getText().toString().trim().isEmpty()) listen();
            else submit();
        });
        setUp(getIntent());
    }

    /**
     * The sheet sits right on top of the keyboard (and above the navigation bar
     * when the keyboard is down). Android draws apps edge to edge now and no
     * longer lifts a window for the keyboard by itself, so the sheet reads the
     * keyboard's and the bars' heights and pads itself by them.
     */
    private void keepAboveKeyboard() {
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View scrim = findViewById(R.id.qa_scrim);
        View sheet = findViewById(R.id.qa_sheet);
        final int baseBottom = sheet.getPaddingBottom();
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(scrim, (v, insets) -> {
            int keyboard = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.ime()).bottom;
            int bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()).bottom;
            sheet.setPadding(sheet.getPaddingLeft(), sheet.getPaddingTop(), sheet.getPaddingRight(),
                    baseBottom + Math.max(keyboard, bars));
            return androidx.core.view.WindowInsetsCompat.CONSUMED;
        });
    }

    @Override
    protected void onDestroy() {
        // A file picked but never added goes; one handed to the sync job stays until it's stored.
        if (attachment != null) attachment.delete();
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        setUp(intent);
    }

    private void setUp(Intent intent) {
        JSONObject data = store.getSnapshot();
        if (data == null || !store.hasAuth()) {
            Toast.makeText(this, R.string.widget_empty_signed_out, Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        String view = intent.getStringExtra(EXTRA_VIEW);
        if (view == null) view = WidgetStore.VIEW_TODAY;
        shopping = ShoppingLogic.isShoppingView(data, view);
        projectId = TaskLogic.viewProjectId(view);
        if (!shopping && TaskLogic.findProject(data, projectId) == null) projectId = "inbox";
        day = WidgetStore.VIEW_TODAY.equals(view) ? TaskLogic.todayStr() : null;
        resetExtras();
        text.setText("");
        text.setHint(shopping ? R.string.qa_shop_hint : R.string.qa_task_hint);
        added.setVisibility(View.GONE);
        buildChips();
        updateSendButton();
        text.requestFocus();
        if (intent.getBooleanExtra(EXTRA_VOICE, false)) {
            intent.removeExtra(EXTRA_VOICE);
            listen();
        }
    }

    private void updateSendButton() {
        boolean empty = text.getText().toString().trim().isEmpty();
        send.setImageResource(empty ? R.drawable.ic_qa_mic : R.drawable.ic_qa_send);
        send.setContentDescription(getString(empty ? R.string.widget_add_by_voice : R.string.widget_add_task));
    }

    // ---- chips ----

    private void buildChips() {
        chips.removeAllViews();
        JSONObject data = store.getSnapshot();
        if (shopping) {
            // A meal: its ingredients, for so many servings, like the app's Meal button.
            TextView mealChip = chip("\uD83C\uDF73 Meal", null, R.color.widget_accent);
            mealChip.setOnClickListener(v -> pickMeal());
            chips.addView(mealChip);
            for (String name : usualItems(data)) {
                TextView chip = chip("+ " + name, null, R.color.widget_text);
                chip.setOnClickListener(v -> {
                    addShopLines(java.util.Collections.singletonList(name));
                    chips.removeView(v);
                });
                chips.addView(chip);
            }
            return;
        }
        TextView more = chip("", R.drawable.ic_qa_plus, R.color.widget_text);
        more.setContentDescription("More");
        more.setOnClickListener(this::showMore);
        chips.addView(more);

        JSONObject project = TaskLogic.findProject(data, projectId);
        boolean inbox = "inbox".equals(projectId) || project == null || project.optBoolean("isInboxProject");
        TextView projectChip = chip(inbox ? "Inbox" : project.optString("name"),
                inbox ? R.drawable.ic_w_inbox : R.drawable.ic_w_hash, R.color.widget_text);
        projectChip.setOnClickListener(this::pickProject);
        chips.addView(projectChip);

        TextView dateChip = chip(dayLabel(day), R.drawable.ic_w_calendar, dayColor(day));
        dateChip.setOnClickListener(this::pickDay);
        chips.addView(dateChip);

        // Attachments live in Firebase, so only with Google sign-in (as in the app).
        if (store.isFirebase()) {
            TextView attach = chip(attachment != null ? attachmentName : "Attachment", R.drawable.ic_qa_attach,
                    attachment != null ? R.color.widget_accent : R.color.widget_text);
            attach.setOnClickListener(v -> {
                if (attachment != null) {
                    attachment.delete();
                    attachment = null;
                    buildChips();
                } else {
                    pickFile();
                }
            });
            chips.addView(attach);
        }

        TextView prio = chip(priority > 0 ? "P" + (5 - priority) : "Priority", R.drawable.ic_qa_flag,
                priority > 0 ? priorityColor(priority) : R.color.widget_text);
        prio.setOnClickListener(this::pickPriority);
        chips.addView(prio);

        if (!labels.isEmpty()) {
            TextView l = chip("@" + android.text.TextUtils.join(" @", labels), R.drawable.ic_qa_label, R.color.widget_accent);
            l.setOnClickListener(v -> pickLabels());
            chips.addView(l);
        }
        if (location != null) {
            TextView loc = chip(location.optString("name"), R.drawable.ic_qa_pin, R.color.widget_accent);
            loc.setOnClickListener(v -> pickLocation());
            chips.addView(loc);
        }
    }

    private void resetExtras() {
        priority = 0;
        labels.clear();
        location = null;
        if (attachment != null) attachment.delete();
        attachment = null;
        description.setText("");
        description.setVisibility(View.GONE);
    }

    private static int priorityColor(int stored) {
        switch (stored) {
            case 4: return R.color.widget_due_overdue;
            case 3: return R.color.widget_due_tomorrow;
            case 2: return R.color.widget_accent;
            default: return R.color.widget_text;
        }
    }

    // ---- the + menu: description, labels, location ----

    private void showMore(View anchor) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundResource(R.drawable.qa_menu_bg);
        box.setElevation(dp(10));
        box.setPadding(0, dp(8), 0, dp(8));
        android.widget.PopupWindow popup = new android.widget.PopupWindow(box,
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT, true);
        popup.setElevation(dp(10));
        popup.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(android.graphics.Color.TRANSPARENT));
        Object[][] rows = {
                { "Description", R.drawable.ic_qa_notes, (Runnable) this::showDescription },
                { "Labels", R.drawable.ic_qa_label, (Runnable) this::pickLabels },
                { "Location", R.drawable.ic_qa_pin, (Runnable) this::pickLocation },
        };
        for (Object[] r : rows) {
            TextView row = new TextView(this);
            row.setText((String) r[0]);
            row.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
            row.setTextColor(getColor(R.color.widget_text));
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setMinHeight(dp(56));
            row.setMinWidth(dp(220));
            row.setPadding(dp(20), 0, dp(28), 0);
            Drawable d = getDrawable((Integer) r[1]);
            if (d != null) {
                d.setBounds(0, 0, dp(24), dp(24));
                row.setCompoundDrawables(d, null, null, null);
                row.setCompoundDrawablePadding(dp(18));
                row.setCompoundDrawableTintList(ColorStateList.valueOf(getColor(R.color.widget_text_secondary)));
            }
            row.setOnClickListener(v -> {
                popup.dismiss();
                ((Runnable) r[2]).run();
            });
            box.addView(row);
        }
        box.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED);
        popup.showAsDropDown(anchor, 0, -anchor.getHeight() - box.getMeasuredHeight() - dp(8));
    }

    private void showDescription() {
        description.setVisibility(View.VISIBLE);
        description.requestFocus();
    }

    private void pickLabels() {
        JSONObject data = store.getSnapshot();
        JSONArray all = data != null ? data.optJSONArray("labels") : null;
        List<JSONObject> list = new ArrayList<>();
        if (all != null) for (int i = 0; i < all.length(); i++) if (all.optJSONObject(i) != null) list.add(all.optJSONObject(i));
        if (list.isEmpty()) {
            Toast.makeText(this, "No labels yet: make them in the app.", Toast.LENGTH_SHORT).show();
            return;
        }
        list.sort((a, b) -> Double.compare(a.optDouble("order", 0), b.optDouble("order", 0)));
        String[] names = new String[list.size()];
        boolean[] checked = new boolean[list.size()];
        for (int i = 0; i < list.size(); i++) {
            names[i] = list.get(i).optString("name");
            checked[i] = labels.contains(names[i]);
        }
        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Labels")
                .setMultiChoiceItems(names, checked, (d, which, on) -> checked[which] = on)
                .setPositiveButton("Done", (d, w) -> {
                    labels.clear();
                    for (int i = 0; i < names.length; i++) if (checked[i]) labels.add(names[i]);
                    buildChips();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    /** Current location, or a place used on another task. */
    private void pickLocation() {
        List<JSONObject> places = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        JSONObject data = store.getSnapshot();
        JSONArray tasks = data != null ? data.optJSONArray("tasks") : null;
        if (tasks != null) {
            for (int i = tasks.length() - 1; i >= 0 && places.size() < 8; i--) {
                JSONObject t = tasks.optJSONObject(i);
                JSONObject loc = t != null ? t.optJSONObject("location") : null;
                if (loc != null && loc.has("lat") && seen.add(loc.optString("name"))) places.add(loc);
            }
        }
        List<String> labelsList = new ArrayList<>();
        labelsList.add("\uD83D\uDCCD Current location");
        for (JSONObject p : places) labelsList.add(p.optString("name"));
        if (location != null) labelsList.add("No location");
        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Location")
                .setItems(labelsList.toArray(new String[0]), (d, which) -> {
                    if (which == 0) {
                        currentLocation();
                    } else if (which <= places.size()) {
                        try {
                            JSONObject p = places.get(which - 1);
                            location = new JSONObject().put("name", p.optString("name")).put("lat", p.optDouble("lat"))
                                    .put("lng", p.optDouble("lng"));
                            if (p.has("address")) location.put("address", p.optString("address"));
                        } catch (JSONException ignored) {
                            location = null;
                        }
                        buildChips();
                    } else {
                        location = null;
                        buildChips();
                    }
                })
                .show();
    }

    private void currentLocation() {
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION,
                    android.Manifest.permission.ACCESS_COARSE_LOCATION }, REQUEST_LOCATION);
            return;
        }
        Toast.makeText(this, "Finding where you are\u2026", Toast.LENGTH_SHORT).show();
        try {
            com.google.android.gms.location.LocationServices.getFusedLocationProviderClient(this)
                    .getCurrentLocation(com.google.android.gms.location.Priority.PRIORITY_BALANCED_POWER_ACCURACY, null)
                    .addOnSuccessListener(loc -> {
                        if (loc == null) {
                            Toast.makeText(this, "Couldn't find your location.", Toast.LENGTH_SHORT).show();
                            return;
                        }
                        nameLocation(loc.getLatitude(), loc.getLongitude());
                    });
        } catch (SecurityException e) {
            Toast.makeText(this, "Location access is off.", Toast.LENGTH_SHORT).show();
        }
    }

    /** "Slovenska cesta 10" (or the town) for a spot, looked up in the background. */
    private void nameLocation(double lat, double lng) {
        new Thread(() -> {
            String name = String.format(java.util.Locale.US, "%.5f, %.5f", lat, lng);
            String address = null;
            try {
                List<android.location.Address> found = new android.location.Geocoder(this).getFromLocation(lat, lng, 1);
                if (found != null && !found.isEmpty()) {
                    android.location.Address a = found.get(0);
                    String street = a.getThoroughfare();
                    if (street != null) name = a.getSubThoroughfare() != null ? street + " " + a.getSubThoroughfare() : street;
                    else if (a.getLocality() != null) name = a.getLocality();
                    address = a.getAddressLine(0);
                }
            } catch (java.io.IOException | IllegalArgumentException ignored) {
                // Keep the coordinates as the name.
            }
            final String n = name, addr = address;
            runOnUiThread(() -> {
                try {
                    location = new JSONObject().put("name", n).put("lat", lat).put("lng", lng);
                    if (addr != null && !addr.equals(n)) location.put("address", addr);
                } catch (JSONException ignored) {
                    location = null;
                }
                buildChips();
            });
        }).start();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQUEST_LOCATION) return;
        for (int r : results) {
            if (r == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                currentLocation();
                return;
            }
        }
        Toast.makeText(this, "Location access is needed for that.", Toast.LENGTH_SHORT).show();
    }

    // ---- priority and attachment ----

    private void pickPriority(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        String[] names = { "Priority 1", "Priority 2", "Priority 3", "Priority 4" };
        int[] colors = { R.color.widget_due_overdue, R.color.widget_due_tomorrow, R.color.widget_accent, R.color.widget_text };
        for (int i = 0; i < 4; i++) {
            android.text.SpannableString s = new android.text.SpannableString("\u2691  " + names[i]);
            s.setSpan(new android.text.style.ForegroundColorSpan(getColor(colors[i])), 0, 1, 0);
            menu.getMenu().add(0, i, i, s);
        }
        menu.setOnMenuItemClickListener(item -> {
            priority = 4 - item.getItemId(); // P1 is stored as 4
            buildChips();
            return true;
        });
        menu.show();
    }

    private void pickFile() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "image/*", "application/pdf", "*/*" });
        try {
            startActivityForResult(intent, REQUEST_FILE);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No file picker on this phone.", Toast.LENGTH_SHORT).show();
        }
    }

    /** Keeps a copy of the picked file until the sync job has stored it. */
    private void keepFile(android.net.Uri uri) {
        new Thread(() -> {
            try {
                android.content.ContentResolver resolver = getContentResolver();
                String type = resolver.getType(uri);
                String name = "file";
                try (android.database.Cursor c = resolver.query(uri,
                        new String[] { android.provider.OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                    if (c != null && c.moveToFirst() && c.getString(0) != null) name = c.getString(0);
                }
                String id = TaskLogic.newId();
                java.io.File dir = new java.io.File(getFilesDir(), "widget_uploads");
                dir.mkdirs();
                java.io.File out = new java.io.File(dir, id);
                try (java.io.InputStream in = resolver.openInputStream(uri);
                     java.io.OutputStream os = new java.io.FileOutputStream(out)) {
                    if (in == null) throw new java.io.IOException("unreadable");
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    long total = 0;
                    while ((n = in.read(buf)) != -1) {
                        total += n;
                        if (total > 25L * 1024 * 1024) throw new java.io.IOException("too big");
                        os.write(buf, 0, n);
                    }
                }
                final String fname = name, ftype = type != null ? type : "application/octet-stream";
                runOnUiThread(() -> {
                    if (attachment != null) attachment.delete();
                    attachment = out;
                    attachmentId = id;
                    attachmentName = fname;
                    attachmentType = ftype;
                    buildChips();
                });
            } catch (java.io.IOException | SecurityException e) {
                runOnUiThread(() -> Toast.makeText(this, "Couldn't attach that file (up to 10 MB).", Toast.LENGTH_SHORT).show());
            }
        }).start();
    }

    private TextView chip(String label, Integer icon, int colorRes) {
        TextView chip = new TextView(this);
        chip.setText(label);
        chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        int color = getColor(colorRes);
        chip.setTextColor(color);
        chip.setGravity(Gravity.CENTER_VERTICAL);
        chip.setBackgroundResource(R.drawable.qa_chip_bg);
        chip.setMinHeight(dp(50));
        chip.setPadding(dp(14), 0, label.isEmpty() ? dp(6) : dp(16), 0);
        chip.setSingleLine(true);
        if (icon != null) {
            Drawable d = getDrawable(icon);
            if (d != null) {
                d.setBounds(0, 0, dp(22), dp(22));
                chip.setCompoundDrawables(d, null, null, null);
                chip.setCompoundDrawablePadding(label.isEmpty() ? 0 : dp(8));
                chip.setCompoundDrawableTintList(ColorStateList.valueOf(color));
            }
        }
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMarginEnd(dp(8));
        chip.setLayoutParams(lp);
        return chip;
    }

    private void pickProject(View anchor) {
        JSONObject data = store.getSnapshot();
        PopupMenu menu = new PopupMenu(this, anchor);
        List<String> ids = new ArrayList<>();
        menu.getMenu().add(0, 0, 0, "Inbox");
        ids.add("inbox");
        JSONArray projects = data != null ? data.optJSONArray("projects") : null;
        if (projects != null) {
            List<JSONObject> list = new ArrayList<>();
            for (int i = 0; i < projects.length(); i++) {
                JSONObject p = projects.optJSONObject(i);
                if (p == null || p.optBoolean("isInboxProject") || "inbox".equals(p.optString("id"))) continue;
                if ("shopping".equals(p.optString("viewStyle"))) continue;
                list.add(p);
            }
            list.sort((a, b) -> Double.compare(a.optDouble("order", 0), b.optDouble("order", 0)));
            for (JSONObject p : list) {
                menu.getMenu().add(0, ids.size(), ids.size(), "# " + p.optString("name"));
                ids.add(p.optString("id"));
            }
        }
        menu.setOnMenuItemClickListener(item -> {
            projectId = ids.get(item.getItemId());
            buildChips();
            return true;
        });
        menu.show();
    }

    private void pickDay(View anchor) {
        String today = TaskLogic.todayStr();
        Calendar c = TaskLogic.calendarFor(today);
        int dow = c.get(Calendar.DAY_OF_WEEK);
        int toSaturday = (Calendar.SATURDAY - dow + 7) % 7;
        int toMonday = (Calendar.MONDAY - dow + 7) % 7;
        final String[] days = {
                today,
                TaskLogic.addDaysStr(today, 1),
                TaskLogic.addDaysStr(today, toSaturday == 0 ? 7 : toSaturday),
                TaskLogic.addDaysStr(today, toMonday == 0 ? 7 : toMonday),
                null,
        };
        String[] labels = { "Today", "Tomorrow", "This weekend", "Next week", "No date" };
        PopupMenu menu = new PopupMenu(this, anchor);
        for (int i = 0; i < labels.length; i++) menu.getMenu().add(0, i, i, labels[i]);
        menu.setOnMenuItemClickListener(item -> {
            day = days[item.getItemId()];
            buildChips();
            return true;
        });
        menu.show();
    }

    private String dayLabel(String d) {
        if (d == null) return "Date";
        TaskLogic.Row row = rowFor(d);
        return TaskLogic.dueLabel(row);
    }

    private int dayColor(String d) {
        if (d == null) return R.color.widget_text_secondary;
        switch (TaskLogic.dueKind(d)) {
            case TODAY: return R.color.widget_due_today;
            case TOMORROW: return R.color.widget_due_tomorrow;
            case OVERDUE: return R.color.widget_due_overdue;
            default: return R.color.widget_due_later;
        }
    }

    private static TaskLogic.Row rowFor(String d) {
        try {
            JSONObject t = new JSONObject().put("id", "").put("projectId", "").put("content", "")
                    .put("due", new JSONObject().put("date", d));
            return new TaskLogic.Row(t, null);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The things most often bought that aren't on the list now. */
    private List<String> usualItems(JSONObject data) {
        List<String> out = new ArrayList<>();
        JSONObject project = TaskLogic.findProject(data, projectId);
        JSONObject bought = project != null ? project.optJSONObject("bought") : null;
        if (bought == null) return out;
        JSONObject guide = data.optJSONObject("shoppingGuide");
        Set<String> onList = new HashSet<>();
        JSONArray tasks = data.optJSONArray("tasks");
        if (tasks != null) {
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject t = tasks.optJSONObject(i);
                if (t != null && projectId.equals(t.optString("projectId")) && !t.optBoolean("completed")) {
                    onList.add(ShoppingLogic.parseItem(guide, t.optString("content")).name.toLowerCase());
                }
            }
        }
        List<JSONObject> entries = new ArrayList<>();
        java.util.Iterator<String> keys = bought.keys();
        while (keys.hasNext()) {
            JSONObject e = bought.optJSONObject(keys.next());
            if (e != null && !onList.contains(e.optString("name").toLowerCase())) entries.add(e);
        }
        entries.sort((a, b) -> Integer.compare(b.optInt("n"), a.optInt("n")));
        for (int i = 0; i < entries.size() && out.size() < 10; i++) out.add(entries.get(i).optString("name"));
        return out;
    }

    // ---- meals ----

    private void pickMeal() {
        List<JSONObject> meals = ShoppingLogic.meals(store.getSnapshot(), projectId);
        if (meals.isEmpty()) {
            Toast.makeText(this, "Open the app once to load the meals.", Toast.LENGTH_SHORT).show();
            return;
        }
        String[] names = new String[meals.size()];
        for (int i = 0; i < meals.size(); i++) {
            JSONObject m = meals.get(i);
            names[i] = m.optString("emoji", "\uD83C\uDF7D") + "  " + m.optString("name");
        }
        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Add a meal")
                .setItems(names, (d, which) -> pickServings(meals.get(which)))
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void pickServings(JSONObject meal) {
        final int[] servings = { 2 };
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(24), dp(8), dp(24), 0);

        LinearLayout stepper = new LinearLayout(this);
        stepper.setGravity(Gravity.CENTER_VERTICAL);
        TextView minus = chip("\u2212", null, R.color.widget_text);
        TextView count = new TextView(this);
        count.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        count.setTextColor(getColor(R.color.widget_text));
        count.setPadding(dp(8), 0, dp(16), 0);
        TextView plus = chip("+", null, R.color.widget_text);
        stepper.addView(minus);
        stepper.addView(count);
        stepper.addView(plus);
        body.addView(stepper);

        TextView list = new TextView(this);
        list.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        list.setTextColor(getColor(R.color.widget_text_secondary));
        list.setPadding(0, dp(12), 0, 0);
        list.setLineSpacing(dp(3), 1f);
        body.addView(list);

        Runnable refresh = () -> {
            count.setText(servings[0] + (servings[0] == 1 ? " serving" : " servings"));
            StringBuilder b = new StringBuilder();
            for (ShoppingLogic.Item item : ingredients(meal, servings[0])) {
                if (b.length() > 0) b.append("\n");
                b.append("\u2022 ").append(ShoppingLogic.itemTitle(item));
            }
            list.setText(b);
        };
        minus.setOnClickListener(v -> {
            if (servings[0] > 1) servings[0]--;
            refresh.run();
        });
        plus.setOnClickListener(v -> {
            if (servings[0] < 20) servings[0]++;
            refresh.run();
        });
        refresh.run();

        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle(meal.optString("emoji", "") + "  " + meal.optString("name"))
                .setView(body)
                .setPositiveButton("Add to list", (d, w) -> addMeal(meal, servings[0]))
                .setNegativeButton("Back", (d, w) -> pickMeal())
                .show();
    }

    private static List<ShoppingLogic.Item> ingredients(JSONObject meal, int servings) {
        List<ShoppingLogic.Item> out = new ArrayList<>();
        JSONArray ings = meal.optJSONArray("ingredients");
        if (ings != null) {
            for (int i = 0; i < ings.length(); i++) {
                JSONObject ing = ings.optJSONObject(i);
                if (ing != null) out.add(ShoppingLogic.scaled(ing, servings));
            }
        }
        return out;
    }

    private void addMeal(JSONObject meal, int servings) {
        JSONObject data = store.getSnapshot();
        if (data == null) return;
        String name = meal.optString("name");
        try {
            String at = TaskLogic.nowIso();
            List<ShoppingLogic.Item> items = ingredients(meal, servings);
            for (ShoppingLogic.Item item : items) {
                String id = TaskLogic.newId();
                queue(data, new JSONObject().put("id", "shop@" + id).put("op", WidgetStore.OP_SHOP)
                        .put("projectId", projectId).put("line", ShoppingLogic.itemTitle(item)).put("meal", name)
                        .put("newId", id).put("at", at));
            }
            confirm("\u2713 " + name + " (" + servings + "): " + items.size() + " ingredients");
        } catch (JSONException e) {
            Toast.makeText(this, "Couldn't add that meal.", Toast.LENGTH_SHORT).show();
        }
    }

    // ---- adding ----

    private void submit() {
        String typed = text.getText().toString().trim();
        if (typed.isEmpty()) return;
        if (shopping) {
            addShopLines(ShoppingLogic.splitItems(typed));
        } else {
            addTask(typed);
        }
        text.setText("");
    }

    private void addTask(String typed) {
        QuickParse parsed = QuickParse.parse(typed);
        if (parsed.content.isEmpty()) return;
        JSONObject data = store.getSnapshot();
        if (data == null) return;
        try {
            String at = TaskLogic.nowIso();
            String taskDay = parsed.day != null ? parsed.day : day;
            JSONObject due = taskDay != null ? TaskLogic.makeDue(taskDay, parsed.time) : null;
            int prio = parsed.priority > 0 ? parsed.priority : priority > 0 ? priority : 1;
            JSONObject task = TaskLogic.newTask(TaskLogic.newId(), parsed.content, projectId, prio, due,
                    TaskLogic.nextOrder(data, projectId), at);
            String notes = description.getText().toString().trim();
            if (!notes.isEmpty()) task.put("description", notes);
            if (!labels.isEmpty()) task.put("labels", new JSONArray(labels));
            if (location != null) task.put("location", location);
            queue(data, new JSONObject().put("id", "create@" + task.getString("id")).put("op", WidgetStore.OP_CREATE)
                    .put("task", task).put("at", at));
            if (attachment != null) {
                store.addPendingOp(new JSONObject().put("id", "attach@" + attachmentId).put("op", WidgetStore.OP_ATTACH)
                        .put("taskId", task.getString("id")).put("attId", attachmentId)
                        .put("path", attachment.getPath()).put("name", attachmentName).put("type", attachmentType)
                        .put("at", at));
                attachment = null; // the sync job has it now
                WidgetSyncJob.schedule(this);
            }
            resetExtras();
            buildChips();
            JSONObject project = TaskLogic.findProject(data, projectId);
            String where = project == null || project.optBoolean("isInboxProject") ? "Inbox" : project.optString("name");
            confirm("✓ " + parsed.content + " → " + where);
        } catch (JSONException e) {
            Toast.makeText(this, "Couldn't add that task.", Toast.LENGTH_SHORT).show();
        }
    }

    private void addShopLines(List<String> lines) {
        JSONObject data = store.getSnapshot();
        if (data == null || lines.isEmpty()) return;
        try {
            String at = TaskLogic.nowIso();
            List<String> names = new ArrayList<>();
            for (String line : lines) {
                String id = TaskLogic.newId();
                queue(data, new JSONObject().put("id", "shop@" + id).put("op", WidgetStore.OP_SHOP)
                        .put("projectId", projectId).put("line", line).put("newId", id).put("at", at));
                names.add(ShoppingLogic.parseItem(data.optJSONObject("shoppingGuide"), line).name);
            }
            confirm("✓ " + android.text.TextUtils.join(", ", names));
        } catch (JSONException e) {
            Toast.makeText(this, "Couldn't add that.", Toast.LENGTH_SHORT).show();
        }
    }

    /** Queued for the sync job, shown in the widget straight away. */
    private void queue(JSONObject data, JSONObject entry) {
        store.addPendingOp(entry);
        if (WidgetStore.applyPending(data, entry)) store.saveSnapshot(data, false);
        TaskWidgetProvider.updateAll(this);
        WidgetSyncJob.schedule(this);
    }

    private void confirm(String message) {
        added.setText(message);
        added.setVisibility(View.VISIBLE);
    }

    // ---- voice ----

    private void listen() {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "sl-SI");
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "sl-SI");
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, shopping ? "Kaj dodam na seznam?" : "Kaj je treba narediti?");
        try {
            startActivityForResult(intent, REQUEST_VOICE);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "This phone has no voice input.", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_FILE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) keepFile(data.getData());
            return;
        }
        if (requestCode != REQUEST_VOICE || resultCode != RESULT_OK || data == null) return;
        ArrayList<String> heard = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (heard == null || heard.isEmpty()) return;
        String said = heard.get(0).trim();
        String now = text.getText().toString().trim();
        text.setText(now.isEmpty() ? said : now + " " + said);
        text.setSelection(text.getText().length());
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
