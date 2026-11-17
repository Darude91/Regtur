package __PKG__;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Ingebouwde speler op basis van libmpv: echte audio- en ondertitelkeuze (ook mkv/mp4 met meerdere sporen).
 * De bibliotheek wordt via reflectie aangesproken, zodat de app ook bouwt/werkt als libmpv ontbreekt
 * (dan meldt de plugin dat, en valt de web-app terug op een andere speler).
 */
public class KdMpvActivity extends Activity implements SurfaceHolder.Callback {

    /** Meldt aan de plugin dat er geen Nederlandse ondertitel in de stream zit. */
    public interface Listener { void needSub(int idx, boolean other); }
    public static Listener listener;
    public static KdMpvActivity current;

    // ---------- libmpv via reflectie ----------
    static final class Mpv {
        static Class<?> C;
        static boolean load() {
            if (C != null) return true;
            for (String n : new String[]{ "dev.jdtech.mpv.MPVLib", "is.xyz.mpv.MPVLib" }) {
                try { C = Class.forName(n); return true; } catch (Throwable ignored) { }
            }
            return false;
        }
        static Object call(String name, Object... args) throws Exception {
            Object inst = null;
            try { inst = C.getField("INSTANCE").get(null); } catch (Throwable ignored) { }
            Exception last = null;
            for (Method m : C.getMethods()) {
                if (!m.getName().equals(name)) continue;
                int n = m.getParameterTypes().length;
                Object[] a = args;
                if (n == args.length + 1 && name.equals("create")) { a = new Object[n]; System.arraycopy(args, 0, a, 0, args.length); }
                else if (n != args.length) continue;
                try { return m.invoke(Modifier.isStatic(m.getModifiers()) ? null : inst, a); }
                catch (IllegalArgumentException e) { last = e; }
                catch (java.lang.reflect.InvocationTargetException e) { last = e; }
            }
            throw last != null ? last : new NoSuchMethodException(name);
        }
        static void opt(String k, String v) { try { call("setOptionString", k, v); } catch (Throwable ignored) { } }
        static void set(String k, String v) { try { call("setPropertyString", k, v); } catch (Throwable ignored) { } }
        static void cmd(String... c) { try { call("command", (Object) c); } catch (Throwable ignored) { } }
        static String str(String k) { try { Object o = call("getPropertyString", k); return o == null ? null : o.toString(); } catch (Throwable t) { return null; } }
        static Double dbl(String k) { try { Object o = call("getPropertyDouble", k); return o == null ? null : ((Number) o).doubleValue(); } catch (Throwable t) { return null; } }
        static Boolean bool(String k) { try { Object o = call("getPropertyBoolean", k); return o == null ? null : (Boolean) o; } catch (Throwable t) { return null; } }
    }

    public static boolean available() { return Mpv.load(); }

    /** Ondertitel (URL) toevoegen terwijl er wordt afgespeeld: eerst naar een cache-bestand, dan sub-add. */
    public static boolean addSub(final String url, final String lang) {
        final KdMpvActivity a = current;
        if (a == null || !a.ready) return false;
        final boolean en = "en".equals(lang);
        new Thread(() -> {
            String target = url;
            try {
                if (url.startsWith("http")) {
                    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                    c.setConnectTimeout(10000); c.setReadTimeout(15000); c.setRequestProperty("User-Agent", "Kijkdoos v1.2");
                    if (c.getResponseCode() / 100 == 2) {
                        java.io.File f = new java.io.File(a.getCacheDir(), "sub-" + System.currentTimeMillis() + ".srt");
                        try (java.io.InputStream in = c.getInputStream(); java.io.FileOutputStream out = new java.io.FileOutputStream(f)) {
                            byte[] buf = new byte[8192]; int n;
                            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                        }
                        target = f.getAbsolutePath();
                    }
                }
            } catch (Throwable ignored) { /* dan laat mpv de URL zelf proberen */ }
            final String t = target;
            a.h.post(() -> { if (current == a) Mpv.cmd("sub-add", t, "select", en ? "English (OpenSubtitles)" : "Nederlands (OpenSubtitles)", en ? "en" : "nl"); });
        }).start();
        return true;
    }

    // ---------- toestand ----------
    private String[] urls, titles;
    private double[] starts;
    private int idx;
    private boolean kids, live;
    private boolean ready, surfaceOk, inited, loaded, trackedThisFile, finished;
    private double pos, dur;
    private final double[] lastPos = new double[400], lastDur = new double[400];
    private final boolean[] done = new boolean[400];
    private final boolean[] touched = new boolean[400];

    private final Handler h = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private LinearLayout bar, top;
    private TextView tTitle, tTime, tInfo;
    private SeekBar seek;
    private Button bPlay;
    private boolean userSeeking;
    private long lastTouch;

    private static final Pattern NL = Pattern.compile("^(nl|nld|dut)([-_].*)?$", Pattern.CASE_INSENSITIVE);
    private static boolean isNl(String lang, String title) {
        return (lang != null && NL.matcher(lang).matches()) || (title != null && Pattern.compile("dutch|nederl|vlaams", Pattern.CASE_INSENSITIVE).matcher(title).find());
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        current = this;
        Intent in = getIntent();
        urls = in.getStringArrayExtra("urls"); titles = in.getStringArrayExtra("titles");
        starts = in.getDoubleArrayExtra("starts");
        idx = Math.max(0, in.getIntExtra("idx", 0)); kids = in.getBooleanExtra("kids", false); live = in.getBooleanExtra("live", false);
        if (urls == null || urls.length == 0 || !Mpv.load()) { fail("libmpv niet beschikbaar"); return; }
        if (titles == null) titles = new String[urls.length];
        if (starts == null) starts = new double[urls.length];

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK); root.setFocusable(true); root.setFocusableInTouchMode(true);
        SurfaceView sv = new SurfaceView(this);
        root.addView(sv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        sv.getHolder().addCallback(this);
        buildControls();
        setContentView(root);
        hideSystemBars();
        showBar();
        h.postDelayed(tick, 500);
    }

    private void fail(String msg) {
        Intent r = new Intent(); r.putExtra("error", msg);
        setResult(RESULT_FIRST_USER, r);
        finished = true;
        finish();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    // ---------- bediening ----------
    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private Button mkBtn(String t, View.OnClickListener l) {
        Button x = new Button(this);
        x.setText(t); x.setAllCaps(false); x.setTextColor(Color.WHITE); x.setTextSize(16);
        x.setBackgroundColor(0x66FFFFFF); x.setFocusable(true); x.setOnClickListener(l);
        x.setOnFocusChangeListener((v, f) -> v.setBackgroundColor(f ? 0xFF4C8DFF : 0x66FFFFFF));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(48));
        lp.setMargins(dp(4), 0, dp(4), 0); x.setLayoutParams(lp);
        x.setPadding(dp(14), 0, dp(14), 0);
        return x;
    }

    private void buildControls() {
        top = new LinearLayout(this); top.setBackgroundColor(0x99000000); top.setPadding(dp(20), dp(12), dp(20), dp(12));
        tTitle = new TextView(this); tTitle.setTextColor(Color.WHITE); tTitle.setTextSize(18); tTitle.setTypeface(Typeface.DEFAULT_BOLD); tTitle.setSingleLine(true);
        top.addView(tTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        root.addView(top, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

        bar = new LinearLayout(this); bar.setOrientation(LinearLayout.VERTICAL); bar.setBackgroundColor(0x99000000); bar.setPadding(dp(20), dp(10), dp(20), dp(14));
        LinearLayout row1 = new LinearLayout(this); row1.setGravity(Gravity.CENTER_VERTICAL);
        seek = new SeekBar(this); seek.setMax(1000); seek.setKeyProgressIncrement(10); seek.setFocusable(true);
        tTime = new TextView(this); tTime.setTextColor(Color.WHITE); tTime.setTextSize(14); tTime.setPadding(dp(12), 0, 0, 0);
        row1.addView(seek, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row1.addView(tTime, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        bar.addView(row1);
        LinearLayout row2 = new LinearLayout(this); row2.setGravity(Gravity.CENTER); row2.setPadding(0, dp(8), 0, 0);
        bPlay = mkBtn("⏯ Pauze", v -> togglePause());
        row2.addView(mkBtn("⏮", v -> step(-1)));
        row2.addView(mkBtn("⏪ 10s", v -> seekRel(-10)));
        row2.addView(bPlay);
        row2.addView(mkBtn("10s ⏩", v -> seekRel(10)));
        row2.addView(mkBtn("⏭", v -> step(1)));
        row2.addView(mkBtn("🔊 Audio", v -> pickTrack("audio")));
        row2.addView(mkBtn("💬 Ondertitels", v -> pickTrack("sub")));
        bar.addView(row2);
        tInfo = new TextView(this); tInfo.setTextColor(0xFFCCCCCC); tInfo.setTextSize(13); tInfo.setGravity(Gravity.CENTER); tInfo.setPadding(0, dp(6), 0, 0);
        bar.addView(tInfo);
        root.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar s, int p, boolean fromUser) {
                if (fromUser && dur > 0) { Mpv.cmd("seek", String.valueOf(dur * p / 1000.0), "absolute"); lastTouch = System.currentTimeMillis(); }
            }
            public void onStartTrackingTouch(SeekBar s) { userSeeking = true; }
            public void onStopTrackingTouch(SeekBar s) { userSeeking = false; }
        });
        root.setOnClickListener(v -> { if (bar.getVisibility() == View.VISIBLE) hideBar(); else showBar(); });
        if (live) { seek.setVisibility(View.GONE); tTime.setVisibility(View.GONE); }
    }

    private void showBar() {
        top.setVisibility(View.VISIBLE); bar.setVisibility(View.VISIBLE); lastTouch = System.currentTimeMillis();
        if (!bPlay.hasFocus() && !anyBarFocus()) bPlay.requestFocus();
    }
    private boolean anyBarFocus() { View f = getCurrentFocus(); return f != null && f != root && bar.findFocus() != null; }
    private void hideBar() { top.setVisibility(View.GONE); bar.setVisibility(View.GONE); root.requestFocus(); hideSystemBars(); }

    private void togglePause() {
        Boolean p = Mpv.bool("pause");
        Mpv.set("pause", p != null && p ? "no" : "yes");
        lastTouch = System.currentTimeMillis();
    }
    private void seekRel(int s) { if (!live) Mpv.cmd("seek", String.valueOf(s), "relative"); lastTouch = System.currentTimeMillis(); }
    private void step(int d) {
        int n = idx + d;
        if (n < 0 || n >= urls.length) return;
        recordCurrent(false);
        idx = n; loadCurrent();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() == KeyEvent.ACTION_DOWN) {
            int k = e.getKeyCode();
            boolean visible = bar != null && bar.getVisibility() == View.VISIBLE;
            if (k == KeyEvent.KEYCODE_BACK) {
                finishPlayback(); return true;
            }
            if (k == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || k == KeyEvent.KEYCODE_MEDIA_PLAY || k == KeyEvent.KEYCODE_MEDIA_PAUSE) { togglePause(); return true; }
            if (k == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) { seekRel(30); return true; }
            if (k == KeyEvent.KEYCODE_MEDIA_REWIND) { seekRel(-30); return true; }
            if (k == KeyEvent.KEYCODE_MEDIA_NEXT || k == KeyEvent.KEYCODE_CHANNEL_UP) { step(1); return true; }
            if (k == KeyEvent.KEYCODE_MEDIA_PREVIOUS || k == KeyEvent.KEYCODE_CHANNEL_DOWN) { step(-1); return true; }
            if (!visible) {
                // balk verborgen: pijltjes = spoelen / zappen, OK = balk tonen
                if (k == KeyEvent.KEYCODE_DPAD_LEFT) { seekRel(-10); showBar(); return true; }
                if (k == KeyEvent.KEYCODE_DPAD_RIGHT) { seekRel(10); showBar(); return true; }
                if (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER || k == KeyEvent.KEYCODE_DPAD_UP || k == KeyEvent.KEYCODE_DPAD_DOWN) { showBar(); return true; }
            } else lastTouch = System.currentTimeMillis();
        }
        return super.dispatchKeyEvent(e);
    }

    // ---------- sporenkeuze ----------
    private void pickTrack(String type) {
        lastTouch = System.currentTimeMillis() + 60000;
        int n = 0; try { n = (int) Math.round(Mpv.dbl("track-list/count") == null ? 0 : Mpv.dbl("track-list/count")); } catch (Throwable ignored) { }
        final ArrayList<String> ids = new ArrayList<>(), names = new ArrayList<>();
        int sel = -1;
        if (type.equals("sub")) { ids.add("no"); names.add("Uit"); }
        for (int i = 0; i < n; i++) {
            if (!type.equals(Mpv.str("track-list/" + i + "/type"))) continue;
            String id = Mpv.str("track-list/" + i + "/id"), lang = Mpv.str("track-list/" + i + "/lang"), title = Mpv.str("track-list/" + i + "/title"), codec = Mpv.str("track-list/" + i + "/codec");
            String ch = Mpv.str("track-list/" + i + "/demux-channel-count");
            StringBuilder sb = new StringBuilder();
            sb.append(langName(lang));
            if (title != null && !title.isEmpty()) sb.append(" — ").append(title);
            if (type.equals("audio")) { if (codec != null) sb.append(" (").append(codec.toUpperCase(Locale.ROOT)); if (ch != null) sb.append(codec != null ? ", " : " (").append(ch).append("ch"); if (codec != null || ch != null) sb.append(")"); }
            if ("yes".equals(Mpv.str("track-list/" + i + "/external"))) sb.append(" [extern]");
            if ("yes".equals(Mpv.str("track-list/" + i + "/selected"))) { sel = ids.size(); sb.append("  ✓"); }
            ids.add(id); names.add(sb.toString());
        }
        if (type.equals("sub") && sel < 0 && "no".equals(Mpv.str("sid"))) sel = 0;
        if (ids.isEmpty() || (!type.equals("sub") && ids.size() < 1)) { tInfo.setText("Geen " + (type.equals("audio") ? "audiosporen" : "ondertitels") + " gevonden"); return; }
        new AlertDialog.Builder(this).setTitle(type.equals("audio") ? "Audiospoor" : "Ondertitels")
                .setSingleChoiceItems(names.toArray(new String[0]), sel, (d, which) -> {
                    Mpv.set(type.equals("audio") ? "aid" : "sid", ids.get(which));
                    d.dismiss(); lastTouch = System.currentTimeMillis();
                }).setOnDismissListener(d -> { lastTouch = System.currentTimeMillis(); hideSystemBars(); }).show();
    }

    private static String langName(String l) {
        if (l == null || l.isEmpty()) return "Onbekend";
        if (NL.matcher(l).matches()) return "Nederlands";
        String x = l.toLowerCase(Locale.ROOT);
        if (x.startsWith("en")) return "English";
        try { String s = new Locale(x.length() > 3 ? x.substring(0, 3) : x).getDisplayLanguage(new Locale("nl")); return s == null || s.isEmpty() ? l : s; } catch (Throwable t) { return l; }
    }

    // ---------- afspelen ----------
    @Override public void surfaceCreated(SurfaceHolder holder) {
        try {
            if (!inited) {
                Mpv.call("create", getApplicationContext());
                Mpv.opt("vo", "gpu"); Mpv.opt("gpu-context", "android"); Mpv.opt("opengl-es", "yes");
                Mpv.opt("hwdec", "mediacodec,mediacodec-copy"); Mpv.opt("ao", "audiotrack,opensles");
                Mpv.opt("alang", kids ? "nl,nld,dut,en,eng" : "en,eng,nl,nld,dut"); Mpv.opt("slang", "nl,nld,dut,en,eng");
                Mpv.opt("sub-auto", "fuzzy"); Mpv.opt("keep-open", "yes"); Mpv.opt("idle", "yes");
                Mpv.opt("cache", "yes"); Mpv.opt("demuxer-max-bytes", "48MiB"); Mpv.opt("demuxer-max-back-bytes", "16MiB");
                Mpv.opt("tls-verify", "no"); Mpv.opt("network-timeout", "30");
                Mpv.opt("sub-font-size", "46"); Mpv.opt("sub-border-size", "3");
                Mpv.call("init");
                inited = true;
            }
            Mpv.call("attachSurface", holder.getSurface());
            Mpv.opt("force-window", "yes"); Mpv.set("vo", "gpu");
            surfaceOk = true;
            if (!ready) { ready = true; loadCurrent(); }
        } catch (Throwable t) {
            fail("libmpv starten mislukt: " + t);
        }
    }
    @Override public void surfaceChanged(SurfaceHolder holder, int f, int w, int hh) { Mpv.set("android-surface-size", w + "x" + hh); }
    @Override public void surfaceDestroyed(SurfaceHolder holder) {
        surfaceOk = false;
        try { Mpv.set("vo", "null"); Mpv.opt("force-window", "no"); Mpv.call("detachSurface"); } catch (Throwable ignored) { }
    }

    private void loadCurrent() {
        loaded = false; trackedThisFile = false; pos = 0; dur = 0;
        tTitle.setText((urls.length > 1 ? (idx + 1) + "/" + urls.length + " · " : "") + (titles[idx] == null ? "" : titles[idx]));
        tInfo.setText("");
        Mpv.cmd("loadfile", urls[idx], "replace");
        Mpv.set("pause", "no");
        touched[idx] = true;
    }

    private final Runnable tick = new Runnable() {
        public void run() {
            if (finished) return;
            try {
                if (ready && surfaceOk) {
                    Double d = Mpv.dbl("duration"), p = Mpv.dbl("time-pos");
                    if (d != null && d > 0) dur = d;
                    if (p != null) pos = p;
                    if (!loaded && d != null && d > 0 || !loaded && live && p != null) { loaded = true; onLoaded(); }
                    if (loaded) {
                        lastPos[idx] = pos; lastDur[idx] = dur;
                        Boolean eof = Mpv.bool("eof-reached");
                        if (!live && eof != null && eof && dur > 0 && pos > dur - 3) {
                            done[idx] = true;
                            if (idx + 1 < urls.length) { idx++; loadCurrent(); }
                            else { finishPlayback(); return; }
                        }
                    }
                    if (!userSeeking && dur > 0) seek.setProgress((int) (pos / dur * 1000));
                    tTime.setText(fmt(pos) + " / " + fmt(dur));
                    Boolean paused = Mpv.bool("pause");
                    bPlay.setText(paused != null && paused ? "▶ Afspelen" : "⏸ Pauze");
                    if (bar.getVisibility() == View.VISIBLE && System.currentTimeMillis() - lastTouch > 6000 && (paused == null || !paused) && !userSeeking) hideBar();
                }
            } catch (Throwable ignored) { }
            h.postDelayed(this, 500);
        }
    };

    private static String fmt(double s) {
        int t = (int) Math.max(0, s); int hh = t / 3600, m = (t % 3600) / 60, ss = t % 60;
        return hh > 0 ? String.format(Locale.ROOT, "%d:%02d:%02d", hh, m, ss) : String.format(Locale.ROOT, "%d:%02d", m, ss);
    }

    /** Eerste keer dat een bestand geladen is: hervatten, taalregels toepassen. */
    private void onLoaded() {
        double st = idx < starts.length ? starts[idx] : 0;
        if (!live && st > 20) Mpv.cmd("seek", String.valueOf(st), "absolute");
        int n = 0; Double c = Mpv.dbl("track-list/count"); if (c != null) n = (int) Math.round(c);
        boolean nlAudio = false, nlSub = false, anySub = false; String audioDesc = "", subDesc = "";
        for (int i = 0; i < n; i++) {
            String type = Mpv.str("track-list/" + i + "/type"), lang = Mpv.str("track-list/" + i + "/lang"), title = Mpv.str("track-list/" + i + "/title");
            boolean sel = "yes".equals(Mpv.str("track-list/" + i + "/selected"));
            if ("audio".equals(type) && sel) { nlAudio = isNl(lang, title); audioDesc = langName(lang); }
            if ("sub".equals(type)) { if (!"yes".equals(Mpv.str("track-list/" + i + "/external"))) { anySub = true; if (isNl(lang, title)) nlSub = true; } if (sel) subDesc = langName(lang); }
        }
        if (nlAudio) { Mpv.set("sid", "no"); subDesc = "uit"; }
        else if (!live && !nlSub && listener != null) {
            // Fallback: pas na een tijdje opnieuw kijken; de eigen sporen van de stream gaan altijd voor
            final int forIdx = idx;
            h.postDelayed(() -> checkSub(forIdx), 6000);
        }
        tInfo.setText("Audio: " + audioDesc + "  |  Ondertitels: " + (subDesc.isEmpty() ? "uit" : subDesc) + "   — kies zelf via de knoppen");
        showBar();
    }

    /** Na de vertraging: zit er nu nog steeds geen Nederlandse ondertitel in (of naast) de stream? Dan vraagt de app er een. */
    private void checkSub(int forIdx) {
        if (isFinishing() || idx != forIdx || live || listener == null) return;
        int n = 0; Double c = Mpv.dbl("track-list/count"); if (c != null) n = (int) Math.round(c);
        boolean nlSub = false, anySub = false;
        for (int i = 0; i < n; i++) {
            if (!"sub".equals(Mpv.str("track-list/" + i + "/type"))) continue;
            if (!"yes".equals(Mpv.str("track-list/" + i + "/external"))) anySub = true;
            if (isNl(Mpv.str("track-list/" + i + "/lang"), Mpv.str("track-list/" + i + "/title"))) nlSub = true;
        }
        if (nlSub) return;
        try { listener.needSub(forIdx, anySub); } catch (Throwable ignored) { }
    }

    // ---------- afsluiten ----------
    private void recordCurrent(boolean ended) { if (loaded) { lastPos[idx] = pos; lastDur[idx] = dur; if (ended) done[idx] = true; } }

    private void finishPlayback() {
        if (finished) return;
        finished = true;
        recordCurrent(false);
        try {
            JSONArray arr = new JSONArray();
            for (int i = 0; i < urls.length && i < 400; i++) {
                if (!touched[i]) continue;
                JSONObject o = new JSONObject();
                o.put("i", i); o.put("pos", lastPos[i]); o.put("dur", lastDur[i]); o.put("done", done[i]);
                arr.put(o);
            }
            Intent r = new Intent(); r.putExtra("progress", arr.toString()); r.putExtra("idx", idx);
            setResult(RESULT_OK, r);
        } catch (Throwable ignored) { setResult(RESULT_OK); }
        finish();
    }

    @Override protected void onPause() { super.onPause(); if (ready && !finished) Mpv.set("pause", "yes"); }
    @Override protected void onResume() { super.onResume(); hideSystemBars(); }

    @Override protected void onDestroy() {
        finished = true;
        h.removeCallbacksAndMessages(null);
        if (current == this) current = null;
        if (inited) {
            try { Mpv.cmd("quit"); } catch (Throwable ignored) { }
            try { Mpv.call("destroy"); } catch (Throwable ignored) { }
        }
        super.onDestroy();
    }
}
