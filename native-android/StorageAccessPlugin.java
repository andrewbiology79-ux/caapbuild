package com.qbcollection.examv2;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.FileObserver;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.util.HashMap;
import java.util.Map;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Helper plugin:
 *  - checks / requests "All files access" (MANAGE_EXTERNAL_STORAGE) on Android 11+
 *  - folder sync: scanTree() lists a whole folder tree in ONE call, watch() reports changes
 *    made outside the app (file manager) as 'storageChanged' events.
 */
@CapacitorPlugin(name = "StorageAccess")
public class StorageAccessPlugin extends Plugin {

    @PluginMethod
    public void check(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("sdk", Build.VERSION.SDK_INT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            ret.put("granted", Environment.isExternalStorageManager());
        } else {
            // Android 10 and below: handled by the normal runtime storage permission (Filesystem plugin)
            ret.put("granted", false);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception e) {
                try {
                    Intent fallback = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(fallback);
                } catch (Exception e2) {
                    call.reject("Unable to open All files access settings");
                    return;
                }
            }
        }
        call.resolve();
    }

    /**
     * Opens the system Downloads screen in the file manager. (Launching some devices' Files app
     * straight into a sub-folder makes that app crash - and such a crash cannot be caught from
     * here - so the standard Downloads screen is used; the PDF folder is one tap away.)
     */
    @PluginMethod
    public void openFolder(PluginCall call) {
        try {
            Intent downloads = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
            downloads.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(downloads);
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to open folder");
        }
    }

    /**
     * Opens a saved file (path relative to the phone's internal storage, e.g.
     * "Download/QbCollection/x.pdf") in another app via a chooser / default app.
     */
    @PluginMethod
    public void openFile(PluginCall call) {
        String path = call.getString("path");
        String mime = call.getString("mimeType", "application/pdf");
        if (path == null || path.trim().isEmpty()) {
            call.reject("No file path");
            return;
        }
        path = path.replaceAll("^/+", "");

        File file = new File(Environment.getExternalStorageDirectory(), path);
        if (!file.exists()) {
            call.reject("File not found");
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );
            Intent view = new Intent(Intent.ACTION_VIEW);
            view.setDataAndType(uri, mime);
            view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(view, "PDF খুলুন");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(chooser);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No app found to open this file");
        } catch (Exception e) {
            call.reject("Unable to open file");
        }
    }

    /* ------------------------------------------------------------------
     * Folder sync
     * ---------------------------------------------------------------- */

    private static final int MAX_SCAN_DEPTH = 6;

    private File resolveRoot(String root) {
        String clean = root == null ? "" : root.replaceAll("^/+", "");
        return new File(Environment.getExternalStorageDirectory(), clean);
    }

    /**
     * Lists every file / folder below `root` (paths relative to root). The text of each
     * ".folder.json" file is included so JS needs no extra round trips.
     */
    /** খালি জায়গা (বাইট) - ফোনের অভ্যন্তরীণ স্টোরেজের আসল ড্রাইভ (ব্যাকআপের আগে জায়গা দেখতে) */
    @PluginMethod
    public void getFreeSpace(PluginCall call) {
        try {
            StatFs st = new StatFs(Environment.getExternalStorageDirectory().getPath());
            JSObject ret = new JSObject();
            ret.put("free", st.getAvailableBytes());
            ret.put("total", st.getTotalBytes());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Free space unavailable: " + e.getMessage());
        }
    }

    @PluginMethod
    public void scanTree(PluginCall call) {
        String root = call.getString("root");
        if (root == null || root.trim().isEmpty()) {
            call.reject("No root");
            return;
        }
        File base = resolveRoot(root);
        JSObject ret = new JSObject();
        JSArray entries = new JSArray();
        if (!base.isDirectory()) {
            ret.put("exists", false);
            ret.put("entries", entries);
            call.resolve(ret);
            return;
        }
        // ধাপ ১.৫: যে ফোল্ডারের তালিকা পড়া যায়নি তার পথ এখানে জমে; JS ওই অংশে কিছু মোছে না
        JSArray unreadable = new JSArray();
        try {
            walk(base, "", entries, 0, unreadable);
        } catch (Exception e) {
            call.reject("Scan failed: " + e.getMessage());
            return;
        }
        ret.put("exists", true);
        ret.put("entries", entries);
        ret.put("complete", unreadable.length() == 0);
        ret.put("unreadable", unreadable);
        call.resolve(ret);
    }

    private void walk(File dir, String rel, JSArray out, int depth, JSArray unreadable) {
        File[] files;
        try {
            files = dir.listFiles();
        } catch (Exception e) {
            files = null;
        }
        if (files == null) {
            // অনুমতি নেই, বা পড়ার মাঝে ফোল্ডারটা মুছে গেছে - "ফাঁকা" নয়, "পড়া যায়নি"
            unreadable.put(rel);
            return;
        }
        for (File f : files) {
            String name = f.getName();
            String p = rel.isEmpty() ? name : rel + "/" + name;
            boolean isDir = f.isDirectory();
            JSObject o = new JSObject();
            o.put("p", p);
            o.put("d", isDir);
            o.put("s", isDir ? 0 : f.length());
            o.put("m", f.lastModified());
            if (!isDir && name.equals(".folder.json")) {
                String text = readSmallText(f);
                if (text != null) o.put("t", text);
            }
            out.put(o);
            if (isDir && depth < MAX_SCAN_DEPTH && !name.startsWith(".")) {
                walk(f, p, out, depth + 1, unreadable);
            }
        }
    }

    private String readSmallText(File f) {
        try (FileInputStream in = new FileInputStream(f)) {
            long len = Math.min(f.length(), 65536);
            byte[] buf = new byte[(int) len];
            int read = 0;
            while (read < len) {
                int n = in.read(buf, read, (int) len - read);
                if (n < 0) break;
                read += n;
            }
            return new String(buf, 0, read, "UTF-8");
        } catch (Exception e) {
            return null;
        }
    }

    private final Map<String, FileObserver> observers = new HashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable notifyRunnable = new Runnable() {
        @Override
        public void run() {
            notifyListeners("storageChanged", new JSObject());
        }
    };

    private void scheduleNotify() {
        // many file events arrive together while the app / file manager writes: report them once
        mainHandler.removeCallbacks(notifyRunnable);
        mainHandler.postDelayed(notifyRunnable, 700);
    }

    private static final int WATCH_MASK = FileObserver.CREATE | FileObserver.DELETE | FileObserver.MOVED_FROM
            | FileObserver.MOVED_TO | FileObserver.CLOSE_WRITE | FileObserver.DELETE_SELF | FileObserver.MOVE_SELF;

    private synchronized void addWatch(final File dir, int depth) {
        if (depth > MAX_SCAN_DEPTH || !dir.isDirectory()) return;
        String name = dir.getName();
        if (name.startsWith(".") || name.equals("media")) return; // pictures change a lot and are not watched
        final String path = dir.getAbsolutePath();
        if (observers.containsKey(path)) return;

        final int d = depth;
        FileObserver obs = new FileObserver(path, WATCH_MASK) {
            @Override
            public void onEvent(int event, String child) {
                int e = event & FileObserver.ALL_EVENTS;
                if ((e & (FileObserver.CREATE | FileObserver.MOVED_TO)) != 0 && child != null) {
                    File f = new File(path, child);
                    if (f.isDirectory()) addWatch(f, d + 1);
                }
                if ((e & (FileObserver.DELETE_SELF | FileObserver.MOVE_SELF)) != 0) {
                    removeWatch(path);
                }
                scheduleNotify();
            }
        };
        obs.startWatching();
        observers.put(path, obs);

        File[] kids = dir.listFiles();
        if (kids != null) {
            for (File k : kids) {
                if (k.isDirectory()) addWatch(k, depth + 1);
            }
        }
    }

    private synchronized void removeWatch(String path) {
        FileObserver o = observers.remove(path);
        if (o != null) o.stopWatching();
    }

    private synchronized void stopAllWatches() {
        for (FileObserver o : observers.values()) o.stopWatching();
        observers.clear();
    }

    /** Starts watching `root` and every folder below it (not the media/ folders). */
    @PluginMethod
    public void watch(PluginCall call) {
        String root = call.getString("root");
        if (root == null || root.trim().isEmpty()) {
            call.reject("No root");
            return;
        }
        stopAllWatches();
        File base = resolveRoot(root);
        if (!base.isDirectory()) base.mkdirs();
        addWatch(base, 0);
        call.resolve();
    }

    @PluginMethod
    public void unwatch(PluginCall call) {
        stopAllWatches();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopAllWatches();
        mainHandler.removeCallbacks(notifyRunnable);
    }
}
