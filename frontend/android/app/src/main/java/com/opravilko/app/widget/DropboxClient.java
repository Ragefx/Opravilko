package com.opravilko.app.widget;

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

/**
 * Just enough of the Dropbox HTTP API for the widget: refresh an access token
 * (PKCE apps refresh with only the app key), download the data file with its
 * revision, and upload it back only if that revision is still current.
 */
final class DropboxClient {
    /** Someone else wrote the file since we downloaded it. */
    static final class ConflictException extends IOException {
        ConflictException() { super("Dropbox file changed meanwhile"); }
    }

    /** The saved sign-in no longer works (revoked or disconnected). */
    static final class AuthException extends IOException {
        AuthException(String message) { super(message); }
    }

    static final class Download {
        final String text;
        final String rev;
        Download(String text, String rev) { this.text = text; this.rev = rev; }
    }

    private final WidgetStore store;

    DropboxClient(WidgetStore store) {
        this.store = store;
    }

    private String accessToken() throws IOException {
        String cached = store.getCachedAccessToken();
        if (cached != null) return cached;
        String body = "grant_type=refresh_token"
                + "&refresh_token=" + URLEncoder.encode(store.getRefreshToken(), "UTF-8")
                + "&client_id=" + URLEncoder.encode(store.getAppKey(), "UTF-8");
        HttpURLConnection conn = open("https://api.dropboxapi.com/oauth2/token");
        conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        write(conn, body.getBytes(StandardCharsets.UTF_8));
        int status = conn.getResponseCode();
        String response = read(status < 400 ? conn.getInputStream() : conn.getErrorStream());
        if (status == 400 || status == 401) throw new AuthException("Dropbox sign-in expired");
        if (status >= 300) throw new IOException("Token refresh failed: HTTP " + status);
        try {
            JSONObject json = new JSONObject(response);
            String token = json.getString("access_token");
            long expiresIn = json.optLong("expires_in", 3600);
            store.setAccessToken(token, System.currentTimeMillis() + expiresIn * 1000);
            return token;
        } catch (JSONException e) {
            throw new IOException("Unexpected token response");
        }
    }

    Download download() throws IOException {
        HttpURLConnection conn = open("https://content.dropboxapi.com/2/files/download");
        conn.setRequestProperty("Authorization", "Bearer " + accessToken());
        conn.setRequestProperty("Dropbox-API-Arg", apiArg(pathArg()));
        // Java would default to a form content type, which Dropbox refuses here.
        conn.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
        write(conn, new byte[0]);
        int status = conn.getResponseCode();
        if (status == 401) {
            store.setAccessToken(null, 0);
            throw new IOException("Access token rejected");
        }
        if (status >= 300) throw new IOException("Download failed: HTTP " + status + " " + read(conn.getErrorStream()));
        String rev = null;
        try {
            rev = new JSONObject(conn.getHeaderField("Dropbox-API-Result")).optString("rev", null);
        } catch (JSONException | NullPointerException ignored) {
            // No revision: upload below falls back to overwrite semantics being refused.
        }
        return new Download(read(conn.getInputStream()), rev);
    }

    void upload(String text, String rev) throws IOException {
        try {
            JSONObject arg = pathArg();
            JSONObject mode = new JSONObject();
            mode.put(".tag", "update");
            mode.put("update", rev);
            arg.put("mode", mode);
            arg.put("mute", true);
            HttpURLConnection conn = open("https://content.dropboxapi.com/2/files/upload");
            conn.setRequestProperty("Authorization", "Bearer " + accessToken());
            conn.setRequestProperty("Dropbox-API-Arg", apiArg(arg));
            conn.setRequestProperty("Content-Type", "application/octet-stream");
            write(conn, text.getBytes(StandardCharsets.UTF_8));
            int status = conn.getResponseCode();
            if (status == 409) {
                String err = read(conn.getErrorStream());
                if (err.contains("conflict")) throw new ConflictException();
                throw new IOException("Upload failed: " + err);
            }
            if (status == 401) {
                store.setAccessToken(null, 0);
                throw new IOException("Access token rejected");
            }
            if (status >= 300) throw new IOException("Upload failed: HTTP " + status);
            read(conn.getInputStream());
        } catch (JSONException e) {
            throw new IOException(e.getMessage());
        }
    }

    private JSONObject pathArg() {
        JSONObject arg = new JSONObject();
        try {
            arg.put("path", store.getDataPath());
        } catch (JSONException ignored) {
            // put() only throws for non-finite numbers.
        }
        return arg;
    }

    /** Dropbox-API-Arg is an HTTP header, so anything outside ASCII must be escaped. */
    private static String apiArg(JSONObject arg) {
        String json = arg.toString();
        StringBuilder out = new StringBuilder();
        for (char ch : json.toCharArray()) {
            if (ch < 0x7f) out.append(ch);
            else out.append(String.format("\\u%04x", (int) ch));
        }
        return out.toString();
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(30_000);
        conn.setDoOutput(true);
        return conn;
    }

    private static void write(HttpURLConnection conn, byte[] body) throws IOException {
        conn.setFixedLengthStreamingMode(body.length);
        try (OutputStream out = conn.getOutputStream()) {
            out.write(body);
        }
    }

    private static String read(InputStream in) throws IOException {
        if (in == null) return "";
        try (InputStream stream = in; ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[16 * 1024];
            int n;
            while ((n = stream.read(chunk)) != -1) buf.write(chunk, 0, n);
            return new String(buf.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
