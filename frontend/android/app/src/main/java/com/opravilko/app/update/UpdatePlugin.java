package com.opravilko.app.update;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Updates the app from its GitHub releases: downloads the new APK and hands
 * it to Android's installer, which asks "Install?" once. The first time,
 * Android wants Opravilko allowed to install apps (a switch in Settings).
 */
@CapacitorPlugin(name = "OpravilkoUpdate")
public class UpdatePlugin extends Plugin {

    /** Whether Android lets this app start an install (the "install unknown apps" switch). */
    private boolean allowed() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("allowed", allowed());
        call.resolve(ret);
    }

    /** Opens the Settings switch that lets Opravilko install its updates. */
    @PluginMethod
    public void allowInstalls(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    /** Downloads {url} and opens the installer; "progress" events report 0-100. */
    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("url is required");
            return;
        }
        if (!allowed()) {
            call.reject("not-allowed");
            return;
        }
        getBridge().execute(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("No cache folder");
                File apk = new File(dir, "Opravilko.apk");
                download(url, apk);
                Uri uri = FileProvider.getUriForFile(getContext(),
                        getContext().getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(uri, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().runOnUiThread(() -> {
                    try {
                        getContext().startActivity(intent);
                        call.resolve();
                    } catch (android.content.ActivityNotFoundException e) {
                        call.reject("No installer found");
                    }
                });
            } catch (IOException | IllegalArgumentException e) {
                call.reject("Download failed", e);
            }
        });
    }

    private void download(String address, File to) throws IOException {
        // GitHub answers with a redirect to its file storage (another host).
        URL url = new URL(address);
        HttpURLConnection conn = null;
        for (int hops = 0; hops < 5; hops++) {
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(30000);
            int code = conn.getResponseCode();
            if (code >= 300 && code < 400) {
                String next = conn.getHeaderField("Location");
                conn.disconnect();
                if (next == null) throw new IOException("Redirect without a location");
                url = new URL(url, next);
                continue;
            }
            if (code != 200) throw new IOException("HTTP " + code);
            break;
        }
        if (conn == null) throw new IOException("No connection");
        long total = conn.getContentLengthLong();
        long done = 0;
        int lastPercent = -1;
        try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(to)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                done += n;
                if (total > 0) {
                    int percent = (int) (done * 100 / total);
                    if (percent != lastPercent) {
                        lastPercent = percent;
                        JSObject ev = new JSObject();
                        ev.put("percent", percent);
                        notifyListeners("progress", ev);
                    }
                }
            }
        } finally {
            conn.disconnect();
        }
    }
}
