package com.opravilko.app.widget;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collection;

/**
 * Opravilko's helper on Cloudflare (worker/ in the repo, and HELPER_URL in
 * src/utils/helper.ts): here, asking it to wake your partner's phone after
 * the widget changed something shared. Empty URL: not set up, nothing sent.
 */
final class HelperClient {
    static final String HELPER_URL = "https://opravilko.cloudsan-29b.workers.dev";

    private HelperClient() {}

    /** Wakes these people's phones (they fetch what changed themselves). Best effort. */
    static void ping(WidgetStore store, Collection<String> to, String project) {
        if (HELPER_URL.isEmpty() || to.isEmpty()) return;
        try {
            String token = new FirestoreClient(store).bearer();
            JSONObject body = new JSONObject().put("to", new JSONArray(to));
            if (project != null) body.put("project", project);
            HttpURLConnection conn = (HttpURLConnection) new URL(HELPER_URL + "/ping").openConnection();
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(15_000);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("Content-Type", "application/json");
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            conn.getResponseCode();
            conn.disconnect();
        } catch (IOException | org.json.JSONException | RuntimeException e) {
            // Offline or not set up: the other phone's regular check catches up.
        }
    }
}
