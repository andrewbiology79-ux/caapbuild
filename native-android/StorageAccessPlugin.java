package com.qbcollection.app;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import java.io.File;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Small helper plugin: checks / requests "All files access" (MANAGE_EXTERNAL_STORAGE)
 * on Android 11+ so PDFs can be saved directly into the phone storage.
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
}
