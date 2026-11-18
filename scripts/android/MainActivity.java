package __PKG__;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        wipeStaleWebCache();
        registerPlugin(ExternalPlayerPlugin.class);
        registerPlugin(CastPlugin.class);
        registerPlugin(KdRemotePlugin.class);
        super.onCreate(savedInstanceState);
    }

    /** Na elke app-update: oude service worker + webcache van de WebView weggooien, zodat de TV nooit een oude versie van de app blijft tonen. */
    private void wipeStaleWebCache() {
        try {
            android.content.SharedPreferences sp = getSharedPreferences("kd_boot", 0);
            long t = getPackageManager().getPackageInfo(getPackageName(), 0).lastUpdateTime;
            if (sp.getLong("upd", 0) == t) return;
            java.io.File base = new java.io.File(getApplicationInfo().dataDir, "app_webview");
            for (String d : new String[]{ "Default/Service Worker", "Service Worker", "Default/Cache", "Default/Code Cache", "Cache", "Code Cache" }) del(new java.io.File(base, d));
            del(new java.io.File(getCacheDir(), "WebView"));
            sp.edit().putLong("upd", t).apply();
        } catch (Throwable ignored) { }
    }
    private static void del(java.io.File f) {
        if (f == null || !f.exists()) return;
        java.io.File[] k = f.listFiles();
        if (k != null) for (java.io.File c : k) del(c);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
