package com.qbcollection.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
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
}
