package __PKG__;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

/**
 * Opent een stream in een externe speler (VLC, mpv, MX Player, Just Player, Kodi, …) en meldt terug
 * hoe het afspelen eindigde, zodat de app de volgende aflevering kan starten.
 *
 * Resultaat naar JS: { completed, known, playlist, position, duration }
 *  - completed: de speler meldt dat de aflevering helemaal is uitgespeeld
 *  - known:     de speler gaf iets terug waaruit dat blijkt (anders weten we het niet)
 *  - playlist:  de speler kreeg de hele lijst en speelt zelf door (MX Player)
 */
@CapacitorPlugin(name = "ExternalPlayer")
public class ExternalPlayerPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) { call.reject("url ontbreekt"); return; }
        String title = call.getString("title", "");
        String pkg = call.getString("package", "");
        if (pkg == null) pkg = "";

        Intent i = new Intent(Intent.ACTION_VIEW);
        i.putExtra("title", title);
        i.putExtra("return_result", true);          // MX Player / Just Player / mpv-android
        i.putExtra("extra_title", title);

        // Hervatten: MX/Just/mpv lezen "position" als int (ms), VLC als long (ms)
        long startMs = call.getData() == null ? 0 : call.getData().optLong("position", 0);
        if (startMs > 1000) {
            if (pkg.startsWith("org.videolan")) i.putExtra("position", startMs);
            else i.putExtra("position", (int) Math.min(startMs, Integer.MAX_VALUE));
        }

        boolean playlist = false;
        if (pkg.startsWith("com.mxtech.videoplayer")) {
            // MX Player begrijpt een hele afspeellijst
            try {
                JSArray urls = call.getArray("urls");
                JSArray titles = call.getArray("titles");
                if (urls != null && urls.length() > 1) {
                    Uri[] list = new Uri[urls.length()];
                    String[] names = new String[urls.length()];
                    for (int n = 0; n < list.length; n++) {
                        list[n] = Uri.parse(urls.getString(n));
                        names[n] = titles != null && n < titles.length() ? titles.getString(n) : "";
                    }
                    i.putExtra("video_list", list);
                    i.putExtra("video_list.name", names);
                    i.putExtra("video_list_is_explicit", true);
                    playlist = true;
                }
            } catch (JSONException ignored) { }
        }

        // Sommige spelers (VLC) accepteren niet elk type/URL-combinatie; probeer meerdere varianten
        // voordat we concluderen dat het niet lukt.
        String[] types = { "video/*", null, "application/x-mpegURL", "video/mp4", "video/x-matroska", "video/MP2T", "*/*" };
        ActivityNotFoundException last = null;
        for (String type : types) {
            Intent launch = new Intent(i);
            if (type == null) launch.setData(Uri.parse(url)); else launch.setDataAndType(Uri.parse(url), type);
            if (pkg.isEmpty()) launch = Intent.createChooser(launch, title.isEmpty() ? "Afspelen met" : title);
            else launch.setPackage(pkg);
            try {
                startActivityForResult(call, launch, "onPlayerResult");
                return;
            } catch (ActivityNotFoundException e) {
                last = e;
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "kon speler niet openen" : e.getMessage(), "OPEN_FAILED");
                return;
            }
        }
        if (!pkg.isEmpty() && !installed(pkg)) call.reject("niet geïnstalleerd", "NOT_INSTALLED");
        else call.reject("speler wil deze stream niet openen", "OPEN_FAILED");
    }

    private boolean installed(String pkg) {
        try {
            getContext().getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (Exception e) {
            // Op Android 11+ zonder <queries> lijkt een geïnstalleerde app soms afwezig: dan via launch-intent kijken
            try { return getContext().getPackageManager().getLaunchIntentForPackage(pkg) != null; } catch (Exception ignored) { return false; }
        }
    }

    @ActivityCallback
    private void onPlayerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        long pos = -1, dur = -1;
        boolean completed = false, known = false;
        Intent data = result == null ? null : result.getData();
        if (data != null && data.getExtras() != null) {
            Bundle b = data.getExtras();
            // MX-protocol (MX, Just Player, mpv-android) en VLC gebruiken verschillende sleutels
            pos = num(b, "position", "extra_position");
            dur = num(b, "duration", "extra_duration");
            String endBy = b.get("end_by") == null ? null : String.valueOf(b.get("end_by"));
            if (endBy != null) {
                known = true;
                completed = "playback_completion".equals(endBy);
            }
            if (!completed && dur > 0 && pos >= 0) {
                known = true;
                completed = dur - pos <= Math.max(15000L, dur / 33);   // laatste ~3% / 15 s telt als uitgekeken
            }
        }
        JSArray urls = call.getArray("urls");
        String pkg = call.getString("package", "");
        boolean playlist = pkg != null && pkg.startsWith("com.mxtech.videoplayer") && urls != null && urls.length() > 1;
        ret.put("completed", completed);
        ret.put("known", known);
        ret.put("playlist", playlist);
        ret.put("position", pos);
        ret.put("duration", dur);
        call.resolve(ret);
    }

    private static long num(Bundle b, String... keys) {
        for (String k : keys) {
            Object v = b.get(k);
            if (v instanceof Number) return ((Number) v).longValue();
            if (v instanceof String) {
                try { return Long.parseLong((String) v); } catch (NumberFormatException ignored) { }
            }
        }
        return -1;
    }

    @PluginMethod
    public void openStore(PluginCall call) {
        String pkg = call.getString("package", "");
        if (pkg == null || pkg.isEmpty()) { call.reject("geen pakketnaam"); return; }
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
        } catch (ActivityNotFoundException e) {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + pkg)));
        }
        call.resolve();
    }
}
