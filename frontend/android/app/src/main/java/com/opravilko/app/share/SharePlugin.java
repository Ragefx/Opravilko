package com.opravilko.app.share;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;

/**
 * "Share to Opravilko": text, links and photos shared from other apps. The
 * share is kept until the app asks for it (it may still be starting up),
 * and a "shared" event tells an already running app that one arrived.
 */
@CapacitorPlugin(name = "OpravilkoShare")
public class SharePlugin extends Plugin {
    private static final int MAX_IMAGES = 6;
    private static final int MAX_BYTES = 15 * 1024 * 1024;

    private Intent pending;

    @Override
    public void load() {
        Intent launch = getActivity().getIntent();
        if (isShare(launch)) pending = launch;
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (!isShare(intent)) return;
        pending = intent;
        notifyListeners("shared", new JSObject(), true);
    }

    /**
     * Opens a task's attachment in the phone's own viewer (photos, PDFs,
     * documents): {name, type, data (base64)} is written to the app's cache
     * and handed over through the FileProvider. Rejects when no app can open it.
     */
    @PluginMethod
    public void openFile(PluginCall call) {
        String name = call.getString("name", "attachment");
        String type = call.getString("type", "application/octet-stream");
        String data = call.getString("data");
        if (data == null) {
            call.reject("data is required");
            return;
        }
        getBridge().execute(() -> {
            try {
                java.io.File dir = new java.io.File(getContext().getCacheDir(), "attachments");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("No cache folder");
                // Keep the name (the viewer shows it), minus anything that isn't a plain file name.
                String safe = name.replaceAll("[\\/:*?\"<>|]", "_");
                java.io.File file = new java.io.File(dir, safe.isEmpty() ? "attachment" : safe);
                try (java.io.FileOutputStream out = new java.io.FileOutputStream(file)) {
                    out.write(Base64.decode(data, Base64.DEFAULT));
                }
                Uri uri = androidx.core.content.FileProvider.getUriForFile(getContext(),
                        getContext().getPackageName() + ".fileprovider", file);
                Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, type)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                Intent chooser = Intent.createChooser(view, name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().runOnUiThread(() -> {
                    try {
                        getContext().startActivity(chooser);
                        call.resolve();
                    } catch (android.content.ActivityNotFoundException e) {
                        call.reject("No app can open this file");
                    }
                });
            } catch (IOException | IllegalArgumentException e) {
                call.reject("Couldn't open the file", e);
            }
        });
    }

    /** The waiting share ({text, subject, images: [{name, type, dataUrl}]}), once; empty if none. */
    @PluginMethod
    public void take(PluginCall call) {
        Intent intent = pending;
        pending = null;
        JSObject ret = new JSObject();
        if (intent == null) {
            call.resolve(ret);
            return;
        }
        // Reading photos can take a moment; keep it off the main thread.
        getBridge().execute(() -> {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (text != null) ret.put("text", text);
            if (subject != null) ret.put("subject", subject);
            JSArray images = new JSArray();
            for (Uri uri : streams(intent)) {
                if (images.length() >= MAX_IMAGES) break;
                JSObject image = readImage(uri);
                if (image != null) images.put(image);
            }
            ret.put("images", images);
            call.resolve(ret);
        });
    }

    private static boolean isShare(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        return Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action);
    }

    @SuppressWarnings("deprecation")
    private static ArrayList<Uri> streams(Intent intent) {
        ArrayList<Uri> out = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> many = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (many != null) out.addAll(many);
        } else {
            Uri one = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (one != null) out.add(one);
        }
        return out;
    }

    private JSObject readImage(Uri uri) {
        ContentResolver resolver = getContext().getContentResolver();
        String type = resolver.getType(uri);
        if (type == null || !type.startsWith("image/")) return null;
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) return null;
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[64 * 1024];
            int n;
            while ((n = in.read(chunk)) != -1) {
                buf.write(chunk, 0, n);
                if (buf.size() > MAX_BYTES) return null;
            }
            JSObject image = new JSObject();
            image.put("name", displayName(resolver, uri, type));
            image.put("type", type);
            image.put("dataUrl", "data:" + type + ";base64," + Base64.encodeToString(buf.toByteArray(), Base64.NO_WRAP));
            return image;
        } catch (IOException | SecurityException e) {
            return null;
        }
    }

    private static String displayName(ContentResolver resolver, Uri uri, String type) {
        try (Cursor c = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String name = c.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (Exception ignored) {
            // Fall through to a made-up name.
        }
        return "photo." + type.substring("image/".length());
    }
}
