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
