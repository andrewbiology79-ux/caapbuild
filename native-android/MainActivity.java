package com.qbcollection.app;

import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StorageAccessPlugin.class);
        super.onCreate(savedInstanceState);

        // Use the area around a camera notch / cut-out too (full screen)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        StorageAccessPlugin.hideSystemBars(this);
    }

    @Override
    public void onResume() {
        super.onResume();
        StorageAccessPlugin.hideSystemBars(this);
    }

    // Dialogs / keyboard / the permission screen can bring the bars back: hide them again
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            StorageAccessPlugin.hideSystemBars(this);
        }
    }
}
