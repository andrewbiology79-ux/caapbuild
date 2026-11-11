package com.qbcollection.examv2;

import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // WebView স্ক্রিনের যতটুকু অংশ স্ট্যাটাস বার / নেভিগেশন বারের নিচে ঢেকে গেছে (CSS px)
    private volatile float safeTop = 0f;
    private volatile float safeBottom = 0f;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StorageAccessPlugin.class);
        super.onCreate(savedInstanceState);
        setupSafeArea();
    }

    private void setupSafeArea() {
        final WebView wv = getBridge().getWebView();
        final float density = getResources().getDisplayMetrics().density;

        // পেজ লোডের সময় JS এখান থেকে মান পড়বে
        wv.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public float top() { return safeTop; }

            @JavascriptInterface
            public float bottom() { return safeBottom; }

            // ফোনের নিচের বাটন বার (Back/Home/Recent) অ্যাপের থিমের সাথে মিলিয়ে আইকন ও রঙ বদলায়
            @JavascriptInterface
            public void setDark(final boolean dark) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Window w = getWindow();
                        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
                        c.setAppearanceLightNavigationBars(!dark);
                        w.setNavigationBarColor(dark ? 0xFF0F172A : 0xFFFFFFFF);
                    }
                });
            }
        }, "QbInsets");

        final Runnable update = new Runnable() {
            @Override
            public void run() {
                WindowInsetsCompat root = ViewCompat.getRootWindowInsets(wv);
                if (root == null) return;
                Insets bars = root.getInsets(
                        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());

                int[] loc = new int[2];
                wv.getLocationOnScreen(loc);
                View decor = getWindow().getDecorView();
                int gapBottom = Math.max(0, decor.getHeight() - (loc[1] + wv.getHeight()));

                // কোনো অংশ আগে থেকেই সরানো থাকলে (যেমন opt-out বা margin) দ্বিগুণ প্যাডিং এড়াতে বাদ দেওয়া হচ্ছে
                int topPx = Math.max(0, bars.top - Math.max(0, loc[1]));
                int bottomPx = Math.max(0, bars.bottom - gapBottom);

                safeTop = topPx / density;
                safeBottom = bottomPx / density;

                wv.evaluateJavascript(
                        "window.__qbSetInsets && window.__qbSetInsets(" + safeTop + "," + safeBottom + ");",
                        null);
            }
        };

        ViewCompat.setOnApplyWindowInsetsListener(wv, (v, insets) -> {
            v.post(update);
            return insets; // ইনসেট consume করা হচ্ছে না
        });
        wv.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> v.post(update));
        ViewCompat.requestApplyInsets(wv);
        wv.post(update);
    }
}
