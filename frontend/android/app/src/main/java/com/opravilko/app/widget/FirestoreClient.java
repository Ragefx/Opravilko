package com.opravilko.app.widget;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

/**
 * Just enough of Firebase's REST APIs for the widget, when the app signs in
 * with Google: turn the refresh token the app shares into an ID token, then
 * read a task and write the fields a completion changes. The security rules
 * apply exactly as they do to the app.
 */
final class FirestoreClient {
    static final class AuthException extends IOException {
        AuthException(String message) { super(message); }
    }

    private final WidgetStore store;

    FirestoreClient(WidgetStore store) {
        this.store = store;
    }

    // ---- auth ----

    private String idToken() throws IOException {
        String cached = store.getCachedFirebaseIdToken();
        if (cached != null) return cached;
        HttpURLConnection conn = open("https://securetoken.googleapis.com/v1/token?key="
                + enc(store.getFirebaseApiKey()), "POST");
        conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        write(conn, "grant_type=refresh_token&refresh_token=" + enc(store.getFirebaseRefreshToken()));
        int status = conn.getResponseCode();
        if (status == 400 || status == 401 || status == 403) throw new AuthException("Firebase sign-in expired");
        if (status != 200) throw new IOException("Token refresh failed (HTTP " + status + ")");
        try {
            JSONObject json = new JSONObject(read(conn.getInputStream()));
            String token = json.getString("id_token");
            long expiresIn = Long.parseLong(json.optString("expires_in", "3600"));
            store.setFirebaseIdToken(token, System.currentTimeMillis() + expiresIn * 1000);
            String rotated = json.optString("refresh_token", null);
            if (rotated != null && !rotated.isEmpty()) store.setFirebaseRefreshToken(rotated);
            return token;
        } catch (JSONException | NumberFormatException e) {
            throw new IOException("Unexpected token response");
        }
    }

    private String docUrl(String taskId) throws IOException {
        return "https://firestore.googleapis.com/v1/projects/" + enc(store.getFirebaseProjectId())
                + "/databases/(default)/documents/tasks/" + enc(taskId);
    }

    // ---- tasks ----

    /** The task as the app stores it (with "id"), or null if it's gone or not ours to see. */
    JSONObject getTask(String taskId) throws IOException {
        HttpURLConnection conn = open(docUrl(taskId), "GET");
        conn.setRequestProperty("Authorization", "Bearer " + idToken());
        int status = conn.getResponseCode();
        if (status == 404 || status == 403) return null;
        if (status == 401) {
            store.setFirebaseIdToken(null, 0);
            throw new IOException("ID token rejected");
        }
        if (status != 200) throw new IOException("Reading the task failed (HTTP " + status + ")");
        try {
            JSONObject doc = new JSONObject(read(conn.getInputStream()));
            JSONObject task = fromFields(doc.optJSONObject("fields"));
            task.put("id", taskId);
            return task;
        } catch (JSONException e) {
            throw new IOException("Unexpected task response");
        }
    }

    /** Writes just these fields of an existing task; a task deleted meanwhile is skipped. */
    void updateTask(String taskId, JSONObject fields) throws IOException {
        StringBuilder url = new StringBuilder(docUrl(taskId)).append("?currentDocument.exists=true");
        Iterator<String> keys = fields.keys();
        while (keys.hasNext()) url.append("&updateMask.fieldPaths=").append(enc(keys.next()));
        HttpURLConnection conn = open(url.toString(), "PATCH");
        conn.setRequestProperty("Authorization", "Bearer " + idToken());
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        try {
            write(conn, new JSONObject().put("fields", toFields(fields)).toString());
        } catch (JSONException e) {
            throw new IOException(e.getMessage());
        }
        int status = conn.getResponseCode();
        if (status == 200) return;
        if (status == 404 || status == 400 || status == 403) return; // gone, or no longer ours
        if (status == 401) store.setFirebaseIdToken(null, 0);
        throw new IOException("Saving the task failed (HTTP " + status + ")");
    }

    /** Makes a new task document; one with this id already there (a retry) is fine. */
    void createTask(String taskId, JSONObject task) throws IOException {
        JSONObject fields;
        try {
            JSONObject copy = new JSONObject(task.toString());
            fields = toFields(copy);
        } catch (JSONException e) {
            throw new IOException(e.getMessage());
        }
        HttpURLConnection conn = open("https://firestore.googleapis.com/v1/projects/" + enc(store.getFirebaseProjectId())
                + "/databases/(default)/documents/tasks?documentId=" + enc(taskId), "POST");
        conn.setRequestProperty("Authorization", "Bearer " + idToken());
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        try {
            write(conn, new JSONObject().put("fields", fields).toString());
        } catch (JSONException e) {
            throw new IOException(e.getMessage());
        }
        int status = conn.getResponseCode();
        if (status == 200 || status == 409) return; // made (409: already made by an earlier try)
        if (status == 403) return; // not ours to add to any more
        if (status == 401) {
            store.setFirebaseIdToken(null, 0);
            throw new IOException("ID token rejected");
        }
        throw new IOException("Adding the task failed (HTTP " + status + ")");
    }

    // ---- general writes (attachments from the widget) ----

    /** The full resource name of a document, e.g. "attachments/abc". */
    String docName(String path) {
        return "projects/" + store.getFirebaseProjectId() + "/databases/(default)/documents/" + path;
    }

    /** Creates collection/docId with these fields (already in Firestore's typed form). */
    void createDocument(String collection, String docId, JSONObject typedFields) throws IOException {
        HttpURLConnection conn = open("https://firestore.googleapis.com/v1/projects/" + enc(store.getFirebaseProjectId())
                + "/databases/(default)/documents/" + collection + "?documentId=" + enc(docId), "POST");
        conn.setRequestProperty("Authorization", "Bearer " + idToken());
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        try {
            write(conn, new JSONObject().put("fields", typedFields).toString());
        } catch (JSONException e) {
            throw new IOException(e.getMessage());
        }
        int status = conn.getResponseCode();
        if (status == 200 || status == 409) return;
        if (status == 401) store.setFirebaseIdToken(null, 0);
        throw new IOException("Saving " + collection + " failed (HTTP " + status + ")");
    }

    /** A document's fields as plain JSON, or null if it isn't there (or isn't ours to see). */
    JSONObject getDocument(String path) throws IOException {
        HttpURLConnection conn = open("https://firestore.googleapis.com/v1/projects/" + enc(store.getFirebaseProjectId())
                + "/databases/(default)/documents/" + path, "GET");
        conn.setRequestProperty("Authorization", "Bearer " + idToken());
        int status = conn.getResponseCode();
        if (status == 404 || status == 403) return null;
        if (status == 401) {
            store.setFirebaseIdToken(null, 0);
            throw new IOException("ID token rejected");
        }
        if (status != 200) throw new IOException("Reading " + path + " failed (HTTP " + status + ")");
        try {
            return fromFields(new JSONObject(read(conn.getInputStream())).optJSONObject("fields"));
        } catch (JSONException e) {
            throw new IOException("Unexpected response");
        }
    }

    /** Several writes at once, all or nothing (Firestore's commit). False if refused (e.g. over the storage budget). */
    boolean commit(JSONArray writes) throws IOException {
        HttpURLConnection conn = open("https://firestore.googleapis.com/v1/projects/" + enc(store.getFirebaseProjectId())
                + "/databases/(default)/documents:commit", "POST");
        conn.setRequestProperty("Authorization", "Bearer " + idToken());
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        try {
            write(conn, new JSONObject().put("writes", writes).toString());
        } catch (JSONException e) {
            throw new IOException(e.getMessage());
        }
        int status = conn.getResponseCode();
        if (status == 200) return true;
        if (status == 403) return false;
        if (status == 401) store.setFirebaseIdToken(null, 0);
        throw new IOException("Saving failed (HTTP " + status + ")");
    }

    // ---- queries (the widget's own refresh) ----

    /** Documents where `field` == `value` (and, if given, `archived` == false), each with its "id". */
    JSONArray whereEquals(String collection, String field, String value, boolean openOnly) throws IOException {
        return query(collection, filter(field, "EQUAL", value), openOnly);
    }

    /** Documents whose array `field` contains `value`. */
    JSONArray whereContains(String collection, String field, String value) throws IOException {
        return query(collection, filter(field, "ARRAY_CONTAINS", value), false);
    }

    private static JSONObject filter(String field, String op, Object value) throws IOException {
        try {
            return new JSONObject().put("fieldFilter", new JSONObject()
                    .put("field", new JSONObject().put("fieldPath", field))
                    .put("op", op)
                    .put("value", toValue(value)));
        } catch (JSONException e) {
            throw new IOException(e.getMessage());
        }
    }

    private JSONArray query(String collection, JSONObject where, boolean openOnly) throws IOException {
        JSONObject body;
        try {
            if (openOnly) {
                where = new JSONObject().put("compositeFilter", new JSONObject()
                        .put("op", "AND")
                        .put("filters", new JSONArray().put(where).put(filter("archived", "EQUAL", false))));
            }
            body = new JSONObject().put("structuredQuery", new JSONObject()
                    .put("from", new JSONArray().put(new JSONObject().put("collectionId", collection)))
                    .put("where", where));
        } catch (JSONException e) {
            throw new IOException(e.getMessage());
        }
        HttpURLConnection conn = open("https://firestore.googleapis.com/v1/projects/" + enc(store.getFirebaseProjectId())
                + "/databases/(default)/documents:runQuery", "POST");
        conn.setRequestProperty("Authorization", "Bearer " + idToken());
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        write(conn, body.toString());
        int status = conn.getResponseCode();
        if (status == 401) {
            store.setFirebaseIdToken(null, 0);
            throw new IOException("ID token rejected");
        }
        if (status != 200) throw new IOException("Query on " + collection + " failed (HTTP " + status + ")");
        try {
            JSONArray rows = new JSONArray(read(conn.getInputStream()));
            JSONArray out = new JSONArray();
            for (int i = 0; i < rows.length(); i++) {
                JSONObject doc = rows.getJSONObject(i).optJSONObject("document");
                if (doc == null) continue; // progress-only rows carry no document
                String name = doc.getString("name");
                JSONObject item = fromFields(doc.optJSONObject("fields"));
                item.put("id", name.substring(name.lastIndexOf('/') + 1));
                out.put(item);
            }
            return out;
        } catch (JSONException e) {
            throw new IOException("Unexpected query response");
        }
    }

    // ---- Firestore's typed values <-> plain JSON ----

    static JSONObject fromFields(JSONObject fields) throws JSONException {
        JSONObject out = new JSONObject();
        if (fields == null) return out;
        Iterator<String> keys = fields.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            out.put(k, fromValue(fields.getJSONObject(k)));
        }
        return out;
    }

    static Object fromValue(JSONObject v) throws JSONException {
        if (v.has("stringValue")) return v.getString("stringValue");
        if (v.has("booleanValue")) return v.getBoolean("booleanValue");
        if (v.has("integerValue")) return Long.parseLong(v.getString("integerValue"));
        if (v.has("doubleValue")) return v.getDouble("doubleValue");
        if (v.has("timestampValue")) return v.getString("timestampValue");
        if (v.has("mapValue")) return fromFields(v.getJSONObject("mapValue").optJSONObject("fields"));
        if (v.has("arrayValue")) {
            JSONArray out = new JSONArray();
            JSONArray values = v.getJSONObject("arrayValue").optJSONArray("values");
            if (values != null) for (int i = 0; i < values.length(); i++) out.put(fromValue(values.getJSONObject(i)));
            return out;
        }
        return JSONObject.NULL;
    }

    static JSONObject toFields(JSONObject obj) throws JSONException {
        JSONObject fields = new JSONObject();
        Iterator<String> keys = obj.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            fields.put(k, toValue(obj.get(k)));
        }
        return fields;
    }

    static JSONObject toValue(Object o) throws JSONException {
        JSONObject v = new JSONObject();
        if (o == null || o == JSONObject.NULL) v.put("nullValue", JSONObject.NULL);
        else if (o instanceof Boolean) v.put("booleanValue", o);
        else if (o instanceof Integer || o instanceof Long) v.put("integerValue", String.valueOf(o));
        else if (o instanceof Number) v.put("doubleValue", ((Number) o).doubleValue());
        else if (o instanceof JSONObject) v.put("mapValue", new JSONObject().put("fields", toFields((JSONObject) o)));
        else if (o instanceof JSONArray) {
            JSONArray arr = (JSONArray) o;
            JSONArray values = new JSONArray();
            for (int i = 0; i < arr.length(); i++) values.put(toValue(arr.get(i)));
            v.put("arrayValue", new JSONObject().put("values", values));
        } else v.put("stringValue", String.valueOf(o));
        return v;
    }

    // ---- HTTP ----

    private static HttpURLConnection open(String url, String method) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(20_000);
        if ("PATCH".equals(method)) {
            // HttpURLConnection has no PATCH; Google's APIs accept this override.
            conn.setRequestMethod("POST");
            conn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
        } else {
            conn.setRequestMethod(method);
        }
        return conn;
    }

    private static void write(HttpURLConnection conn, String body) throws IOException {
        conn.setDoOutput(true);
        try (OutputStream out = conn.getOutputStream()) {
            out.write(body.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static String read(InputStream in) throws IOException {
        try (InputStream is = in) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = is.read(chunk)) != -1) buf.write(chunk, 0, n);
            return buf.toString("UTF-8");
        }
    }

    private static String enc(String s) {
        try {
            return URLEncoder.encode(s == null ? "" : s, "UTF-8").replace("+", "%20");
        } catch (java.io.UnsupportedEncodingException e) {
            return "";
        }
    }
}
