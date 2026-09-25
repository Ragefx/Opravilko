package com.opravilko.app.widget;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * What your partner did since the last look, worked out by comparing the
 * widget's copy of the tasks before and after a sync: tasks (and shopping
 * items) they added, and ones they ticked off. Plain Java, testable off the
 * phone; PartnerNotifier turns it into notifications.
 */
final class PartnerNews {
    private PartnerNews() {}

    static final String ADDED = "added";
    static final String DONE = "done";

    static final class Event {
        final String kind;
        final String taskId;
        final String projectId;
        final String title;
        final boolean shopping;

        Event(String kind, String taskId, String projectId, String title, boolean shopping) {
            this.kind = kind;
            this.taskId = taskId;
            this.projectId = projectId;
            this.title = title;
            this.shopping = shopping;
        }
    }

    /** The partner's uid from the data, or null (no partner, or Dropbox). */
    static String partnerUid(JSONObject data) {
        JSONObject partner = data != null ? data.optJSONObject("partner") : null;
        String uid = partner != null ? partner.optString("uid", "") : "";
        return uid.isEmpty() ? null : uid;
    }

    static String partnerFirstName(JSONObject data) {
        JSONObject partner = data != null ? data.optJSONObject("partner") : null;
        String name = partner != null ? partner.optString("name", "").trim() : "";
        if (name.isEmpty()) return "Your partner";
        int space = name.indexOf(' ');
        return space > 0 ? name.substring(0, space) : name;
    }

    static List<Event> diff(JSONObject before, JSONObject after) {
        List<Event> out = new ArrayList<>();
        String partner = partnerUid(after);
        JSONArray was = before != null ? before.optJSONArray("tasks") : null;
        JSONArray now = after != null ? after.optJSONArray("tasks") : null;
        // Nothing to compare with on the very first sync.
        if (partner == null || was == null || now == null) return out;
        Map<String, JSONObject> old = new HashMap<>();
        for (int i = 0; i < was.length(); i++) {
            JSONObject t = was.optJSONObject(i);
            if (t != null) old.put(t.optString("id"), t);
        }
        for (int i = 0; i < now.length(); i++) {
            JSONObject t = now.optJSONObject(i);
            if (t == null) continue;
            JSONObject prev = old.get(t.optString("id"));
            String kind = null;
            if (prev == null && !t.optBoolean("completed") && partner.equals(t.optString("createdBy"))) kind = ADDED;
            else if (prev != null && !prev.optBoolean("completed") && t.optBoolean("completed")
                    && partner.equals(t.optString("completedBy"))) kind = DONE;
            if (kind == null) continue;
            String projectId = t.optString("projectId", "inbox");
            boolean shopping = isShopping(after, projectId);
            String title = shopping ? ShoppingLogic.parse(t.optString("content"))[0] : t.optString("content");
            out.add(new Event(kind, t.optString("id"), projectId, title, shopping));
        }
        return out;
    }

    static boolean isShopping(JSONObject data, String projectId) {
        JSONObject project = TaskLogic.findProject(data, projectId);
        return project != null && "shopping".equals(project.optString("viewStyle"));
    }

    static String projectName(JSONObject data, String projectId) {
        if ("inbox".equals(projectId)) return "Inbox";
        JSONObject project = TaskLogic.findProject(data, projectId);
        return project != null ? project.optString("name", "the list") : "the list";
    }
}
