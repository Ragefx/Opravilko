package com.opravilko.app.widget;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

/**
 * A file attached in the widget's Add task card, stored the way the app
 * stores attachments (src/firebase/attachments.ts): photos shrunk to at most
 * 1600px with a small thumbnail, the bytes in chunks under
 * attachments/{id}/chunks, marked ready together with the storage counter,
 * then listed on the task. Each step can be repeated safely, so a sync that
 * stops half-way just carries on next time.
 */
final class AttachmentUploader {
    private static final int MAX_FILE = 10 * 1024 * 1024;
    private static final int CHUNK = 900_000;

    private AttachmentUploader() {}

    /** True when this pending attachment is finished with (stored, or it can never be). */
    static boolean upload(FirestoreClient firestore, JSONObject p, String uid) throws IOException, JSONException {
        File file = new File(p.getString("path"));
        if (!file.exists() || uid == null) return true;
        String taskId = p.getString("taskId");
        String id = p.getString("attId");

        Prepared prepared = prepare(file, p.optString("name", file.getName()), p.optString("type", "application/octet-stream"));
        if (prepared.bytes.length > MAX_FILE) {
            file.delete();
            return true;
        }
        int size = prepared.bytes.length;
        int chunkCount = Math.max(1, (size + CHUNK - 1) / CHUNK);

        JSONObject existing = firestore.getDocument("attachments/" + id);
        if (existing == null || !"ready".equals(existing.optString("status"))) {
            firestore.createDocument("attachments", id, FirestoreClient.toFields(new JSONObject()
                    .put("taskId", taskId)
                    .put("ownerUid", uid)
                    .put("name", prepared.name)
                    .put("type", prepared.type)
                    .put("size", size)
                    .put("chunkCount", chunkCount)
                    .put("status", "uploading")
                    .put("createdAt", p.optString("at", TaskLogic.nowIso()))));
            for (int i = 0; i < chunkCount; i++) {
                int from = i * CHUNK;
                int len = Math.min(CHUNK, size - from);
                String data = Base64.encodeToString(prepared.bytes, from, len, Base64.NO_WRAP);
                firestore.createDocument("attachments/" + id + "/chunks", String.format(Locale.US, "%03d", i),
                        new JSONObject().put("data", new JSONObject().put("bytesValue", data)));
            }
            // Ready, and counted in the storage budget, in one go.
            JSONArray writes = new JSONArray()
                    .put(new JSONObject()
                            .put("update", new JSONObject()
                                    .put("name", firestore.docName("attachments/" + id))
                                    .put("fields", new JSONObject().put("status", new JSONObject().put("stringValue", "ready"))))
                            .put("updateMask", new JSONObject().put("fieldPaths", new JSONArray().put("status"))))
                    .put(new JSONObject()
                            .put("transform", new JSONObject()
                                    .put("document", firestore.docName("meta/storage"))
                                    .put("fieldTransforms", new JSONArray().put(new JSONObject()
                                            .put("fieldPath", "bytes")
                                            .put("increment", new JSONObject().put("integerValue", String.valueOf(size)))))));
            if (!firestore.commit(writes)) {
                file.delete(); // over the attachments budget: nothing more to do from here
                return true;
            }
        }

        // Listed on the task (once).
        JSONObject task = firestore.getTask(taskId);
        if (task == null) {
            file.delete();
            return true;
        }
        JSONArray list = task.optJSONArray("attachments");
        if (list == null) list = new JSONArray();
        for (int i = 0; i < list.length(); i++) {
            if (id.equals(list.optJSONObject(i) != null ? list.optJSONObject(i).optString("id") : null)) {
                file.delete();
                return true;
            }
        }
        JSONObject att = new JSONObject()
                .put("id", id)
                .put("name", prepared.name)
                .put("type", prepared.type)
                .put("size", size)
                .put("addedBy", uid)
                .put("addedAt", p.optString("at", TaskLogic.nowIso()));
        if (prepared.thumb != null) att.put("thumb", prepared.thumb);
        list.put(att);
        firestore.updateTask(taskId, new JSONObject().put("attachments", list).put("updatedAt", TaskLogic.nowIso()));
        file.delete();
        return true;
    }

    private static final class Prepared {
        byte[] bytes;
        String name;
        String type;
        String thumb;
    }

    /** Photos: at most 1600px as JPEG (unless that isn't smaller) and a 240px thumbnail. */
    private static Prepared prepare(File file, String name, String type) throws IOException {
        Prepared out = new Prepared();
        out.bytes = readAll(file);
        out.name = name;
        out.type = type;
        if (!type.startsWith("image/")) return out;
        try {
            Bitmap full = decode(file, 1600);
            if (full == null) return out;
            Bitmap rotated = rotateByExif(file, full);
            Bitmap big = scale(rotated, 1600);
            ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
            big.compress(Bitmap.CompressFormat.JPEG, 82, jpeg);
            if (jpeg.size() < out.bytes.length) {
                out.bytes = jpeg.toByteArray();
                out.name = name.replaceAll("(?i)\\.(png|webp|bmp|jpe?g|heic|heif)$", "") + ".jpg";
                out.type = "image/jpeg";
            }
            ByteArrayOutputStream small = new ByteArrayOutputStream();
            scale(rotated, 240).compress(Bitmap.CompressFormat.JPEG, 60, small);
            out.thumb = "data:image/jpeg;base64," + Base64.encodeToString(small.toByteArray(), Base64.NO_WRAP);
        } catch (RuntimeException | OutOfMemoryError e) {
            // Keep the original file as it is.
        }
        return out;
    }

    private static Bitmap decode(File file, int target) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getPath(), bounds);
        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= target) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        return BitmapFactory.decodeFile(file.getPath(), opts);
    }

    private static Bitmap rotateByExif(File file, Bitmap bitmap) {
        try {
            int o = new ExifInterface(file.getPath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            int degrees = o == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : o == ExifInterface.ORIENTATION_ROTATE_180 ? 180
                    : o == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
            if (degrees == 0) return bitmap;
            Matrix m = new Matrix();
            m.postRotate(degrees);
            return Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), m, true);
        } catch (IOException e) {
            return bitmap;
        }
    }

    private static Bitmap scale(Bitmap b, int max) {
        int w = b.getWidth(), h = b.getHeight();
        if (Math.max(w, h) <= max) return b;
        float f = (float) max / Math.max(w, h);
        return Bitmap.createScaledBitmap(b, Math.round(w * f), Math.round(h * f), true);
    }

    private static byte[] readAll(File file) throws IOException {
        try (InputStream in = new FileInputStream(file)) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[64 * 1024];
            int n;
            while ((n = in.read(chunk)) != -1) buf.write(chunk, 0, n);
            return buf.toByteArray();
        }
    }
}
