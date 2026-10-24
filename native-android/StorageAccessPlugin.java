package com.qbcollection.app;

import android.app.DownloadManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.Settings;

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
     * Opens a folder of the phone's internal storage (e.g. "Download/QbCollection")
     * in the file manager. Falls back to the system Downloads screen.
     */
    @PluginMethod
    public void openFolder(PluginCall call) {
        String path = call.getString("path", "Download/QbCollection");
        if (path == null || path.trim().isEmpty()) {
            path = "Download/QbCollection";
        }
        path = path.replaceAll("^/+", "").replaceAll("/+$", "");

        // 1) File manager (Documents UI) directly at the folder
        try {
            Uri folderUri = DocumentsContract.buildDocumentUri(
                "com.android.externalstorage.documents",
                "primary:" + path
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(folderUri, "vnd.android.document/directory");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getContext().startActivity(intent);
            call.resolve();
            return;
        } catch (Exception ignored) {
            // try fallback below
        }

        // 2) Fallback: system Downloads screen
        try {
            Intent downloads = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
            downloads.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(downloads);
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to open folder");
        }
    }
}
