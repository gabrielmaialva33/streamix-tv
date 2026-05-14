package tv.streamix.app;

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        super.onCreate(savedInstanceState);
        enableTvFullscreen();
        flushWebViewCache();
        // Always-on Chrome DevTools attach (chrome://inspect over adb) so we
        // can profile and reproduce TV-only bugs without rebuilding a debug APK.
        // Trade-off: anyone with physical adb access can inspect WebView state.
        // Acceptable for an IPTV client where session tokens rotate often.
        WebView.setWebContentsDebuggingEnabled(true);
    }

    /**
     * Capacitor reads www/ straight from the APK's packaged assets, so the
     * WebView's HTTP disk cache adds zero performance benefit and actively
     * causes "new APK shows old assets" bugs after side-load updates on Fire
     * TV. Wipe any leftover cache and disable cache reads on every boot.
     * See: https://www.vchalyi.com/blog/2026/capacitor-webview-cache-stale-assets/
     */
    private void flushWebViewCache() {
        try {
            WebView webView = this.bridge.getWebView();
            if (webView != null) {
                webView.clearCache(true);
                webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
            }
        } catch (Throwable ignored) {
            // Bridge not yet attached on some Capacitor versions; safe to ignore.
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);

        if (hasFocus) {
            enableTvFullscreen();
        }
    }

    private void enableTvFullscreen() {
        Window window = getWindow();
        window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        window
            .getDecorView()
            .setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
    }
}
