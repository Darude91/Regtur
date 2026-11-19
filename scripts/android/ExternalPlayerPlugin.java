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

import androidx.core.content.FileProvider;

import org.json.JSONException;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

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

        // Ondertitel (OpenSubtitles): MX/Just Player lezen "subs", VLC "subtitles_location"
        String subUrl = call.getData() == null ? "" : call.getData().optString("subUrl", "");
        if (subUrl != null && !subUrl.isEmpty()) {
            Uri su = Uri.parse(subUrl);
            String subLang = call.getData() == null ? "" : call.getData().optString("subLang", "");
            boolean isMpv = pkg.equals("is.xyz.mpv") || pkg.equals("app.mpvnova.player");
            boolean dutch = subLang == null || subLang.isEmpty() || subLang.equals("nl");
            i.putExtra("subs", new Uri[]{ su });
            // mpv / MPVNova kunnen na het starten niet bevraagd worden: Nederlandse OpenSubtitles direct aan (zoals eerder); Engels alleen toevoegen
            if (!isMpv || dutch) i.putExtra("subs.enable", new Uri[]{ su });
            i.putExtra("subs.name", new String[]{ dutch ? "Nederlands" : "English" });
            i.putExtra("subtitles_location", subUrl);
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
                        list[n] = toUri(urls.getString(n), pkg);
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
        StringBuilder tried = new StringBuilder();
        for (String type : types) {
            Intent launch = new Intent(i);
            Uri dataUri = toUri(url, pkg);
            launch.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (type == null) launch.setData(dataUri); else launch.setDataAndType(dataUri, type);
            if (pkg.isEmpty()) launch = Intent.createChooser(launch, title.isEmpty() ? "Afspelen met" : title);
            else launch.setPackage(pkg);
            try {
                startActivityForResult(call, launch, "onPlayerResult");
                return;
            } catch (ActivityNotFoundException e) {
                last = e;
            } catch (Exception e) {
                call.reject(e.getClass().getSimpleName() + ": " + (e.getMessage() == null ? "kon speler niet openen" : e.getMessage()) + " [" + describe(url, pkg, type) + "]", "OPEN_FAILED");
                return;
            }
        }
        if (!pkg.isEmpty() && !installed(pkg)) call.reject("niet geïnstalleerd volgens Android [" + describe(url, pkg, "alle typen") + "]", "NOT_INSTALLED");
        else call.reject("geen speler gevonden die dit adres opent [" + describe(url, pkg, "alle typen") + "]", "OPEN_FAILED");
    }

    /** Korte diagnose voor in de foutmelding: schema, poort, pakket en of Android er een activiteit voor ziet. */
    private String describe(String url, String pkg, String type) {
        try {
            Uri u = Uri.parse(url);
            Intent t = new Intent(Intent.ACTION_VIEW);
            t.setDataAndType(u, "video/*");
            if (!pkg.isEmpty()) t.setPackage(pkg);
            int n = getContext().getPackageManager().queryIntentActivities(t, 0).size();
            return u.getScheme() + "://…" + (u.getPort() > 0 ? ":" + u.getPort() : "") + " " + (pkg.isEmpty() ? "geen pakket" : pkg) + " type=" + type + " overeenkomsten=" + n;
        } catch (Exception e) { return "geen diagnose"; }
    }

    /** Lokale (gedownloade) bestanden gaan via FileProvider naar de speler; streams blijven gewone URL's. */
    private Uri toUri(String s, String pkg) {
        if (s != null && s.startsWith("file://")) {
            try {
                File f = new File(Uri.parse(s).getPath());
                Uri u = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
                if (pkg != null && !pkg.isEmpty()) getContext().grantUriPermission(pkg, u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                return u;
            } catch (Exception ignored) { }
        }
        return Uri.parse(s);
    }

    // ---------- Downloads voor offline kijken ----------
    private final Map<String, Boolean> stops = new ConcurrentHashMap<>();

    private File dlDir() {
        File d = getContext().getExternalFilesDir("downloads");
        if (d == null) d = new File(getContext().getFilesDir(), "downloads");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    private static String extOf(String url) {
        try {
            String p = Uri.parse(url).getPath();
            int dot = p == null ? -1 : p.lastIndexOf('.');
            if (dot >= 0) {
                String e = p.substring(dot).toLowerCase();
                if (e.matches("\\.[a-z0-9]{2,5}")) return e;
            }
        } catch (Exception ignored) { }
        return ".mp4";
    }

    private void dlEvent(String id, long got, long total, boolean done, String error, String path, boolean paused) {
        JSObject o = new JSObject();
        o.put("id", id); o.put("got", got); o.put("total", total); o.put("done", done);
        if (error != null) o.put("error", error);
        if (path != null) o.put("path", path);
        o.put("paused", paused);
        notifyListeners("dlprogress", o);
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String id = call.getString("id"), url = call.getString("url");
        if (id == null || url == null) { call.reject("id/url ontbreekt"); return; }
        if (stops.containsKey(id) && !stops.get(id)) { call.resolve(); return; }   // loopt al
        stops.put(id, false);
        final File file = new File(dlDir(), id + extOf(url));
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                long have = file.exists() ? file.length() : 0;
                String cur = url;
                for (int hop = 0; hop < 6; hop++) {
                    c = (HttpURLConnection) new URL(cur).openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(20000); c.setReadTimeout(30000);
                    c.setRequestProperty("User-Agent", "Kijkdoos/1.2");
                    if (have > 0) c.setRequestProperty("Range", "bytes=" + have + "-");
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                        cur = new URL(new URL(cur), c.getHeaderField("Location")).toString(); c.disconnect(); continue;
                    }
                    break;
                }
                int code = c.getResponseCode();
                if (code == 416 && have > 0) { dlEvent(id, have, have, true, null, file.getAbsolutePath(), false); return; }
                if (code != 200 && code != 206) throw new Exception("HTTP " + code);
                boolean append = code == 206 && have > 0;
                if (!append) have = 0;
                long len = c.getContentLengthLong();
                long total = len > 0 ? have + len : 0;
                long got = have, last = 0;
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(file, append)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        if (Boolean.TRUE.equals(stops.get(id))) { dlEvent(id, got, total, false, null, null, true); return; }
                        out.write(buf, 0, n); got += n;
                        long now = System.currentTimeMillis();
                        if (now - last > 600) { last = now; dlEvent(id, got, total, false, null, null, false); }
                    }
                }
                if (total > 0 && got < total) throw new Exception("onvolledig");
                dlEvent(id, got, total > 0 ? total : got, true, null, file.getAbsolutePath(), false);
            } catch (Exception e) {
                dlEvent(id, 0, 0, false, e.getMessage() == null ? "mislukt" : e.getMessage(), null, false);
            } finally {
                stops.remove(id);
                if (c != null) c.disconnect();
            }
        }, "kd-download-" + id).start();
        call.resolve();
    }

    @PluginMethod
    public void pauseDownload(PluginCall call) {
        String id = call.getString("id");
        if (id != null && stops.containsKey(id)) stops.put(id, true);
        call.resolve();
    }

    @PluginMethod
    public void removeDownload(PluginCall call) {
        String id = call.getString("id");
        if (id != null) {
            if (stops.containsKey(id)) stops.put(id, true);
            File[] fs = dlDir().listFiles();
            if (fs != null) for (File f : fs) if (f.getName().startsWith(id + ".")) //noinspection ResultOfMethodCallIgnored
                f.delete();
        }
        call.resolve();
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
        // mpv-android / MPVNova: bij RESULT_OK ontbreken "position" en "duration" als de aflevering helemaal is
        // uitgespeeld; bij stoppen door de gebruiker staan ze er wel in.
        if (!known && pkg != null && isMpv(pkg) && result != null && result.getResultCode() == Activity.RESULT_OK
                && data != null && (data.getExtras() == null || !data.getExtras().containsKey("position"))) {
            known = true;
            completed = true;
        }
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

    private static boolean isMpv(String pkg) {
        return pkg.equals("is.xyz.mpv") || pkg.startsWith("app.mpvnova");
    }

    /** Is dit een Android TV / Google TV / Fire TV-apparaat? (bepaalt of MPVNova of mpv de standaardspeler is) */
    @PluginMethod
    public void deviceInfo(PluginCall call) {
        boolean tv = false;
        try {
            android.app.UiModeManager um = (android.app.UiModeManager) getContext().getSystemService(android.content.Context.UI_MODE_SERVICE);
            tv = um != null && um.getCurrentModeType() == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION;
            if (!tv) tv = getContext().getPackageManager().hasSystemFeature("android.software.leanback")
                    && !getContext().getPackageManager().hasSystemFeature("android.hardware.touchscreen");
        } catch (Exception ignored) { }
        JSObject o = new JSObject();
        o.put("tv", tv);
        o.put("mpv", installed("is.xyz.mpv"));
        o.put("mpvnova", installed("app.mpvnova.player"));
        call.resolve(o);
    }

    @PluginMethod
    public void openStore(PluginCall call) {
        String pkg = call.getString("package", "");
        if (pkg == null || pkg.isEmpty()) { call.reject("geen pakketnaam"); return; }
        if (pkg.startsWith("app.mpvnova")) {   // MPVNova staat niet in de Play Store maar op GitHub
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/Laskco/mpvNova/releases")));
            call.resolve();
            return;
        }
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
        } catch (ActivityNotFoundException e) {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + pkg)));
        }
        call.resolve();
    }
}
