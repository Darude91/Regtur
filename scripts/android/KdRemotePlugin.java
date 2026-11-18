package __PKG__;

import android.content.Intent;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Kijkdoos-naar-Kijkdoos: een titel vanaf een ander apparaat (telefoon/pc) op dit apparaat laten afspelen.
 *  - Ontvanger: kleine HTTP-server (poort 8765) die alleen met de juiste koppelcode een afspeelopdracht aanneemt.
 *  - Zoeken: kijkt in het eigen /24-netwerk welke apparaten een Kijkdoos-ontvanger hebben.
 *  - Versturen: stuurt de opdracht naar een ontvanger.
 */
@CapacitorPlugin(name = "KdRemote")
public class KdRemotePlugin extends Plugin {
    private static final int PORT = 8765;
    private volatile ServerSocket server;
    private volatile String code = "", name = "Kijkdoos";
    private int fails = 0;
    private long failSince = 0;

    @PluginMethod
    public void startReceiver(PluginCall call) {
        stopServer();
        name = call.getString("name", "Kijkdoos");
        code = call.getString("code", "");
        try {
            final ServerSocket ss = new ServerSocket();
            ss.setReuseAddress(true);
            ss.bind(new InetSocketAddress(PORT));
            server = ss;
            Thread t = new Thread(() -> {
                while (!ss.isClosed()) {
                    try {
                        final Socket s = ss.accept();
                        new Thread(() -> handle(s), "kd-remote-conn").start();
                    } catch (Exception e) { break; }
                }
            }, "kd-remote");
            t.setDaemon(true);
            t.start();
            call.resolve(info(true));
        } catch (Exception e) {
            call.reject("kan poort " + PORT + " niet openen: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopReceiver(PluginCall call) { stopServer(); call.resolve(info(false)); }

    @PluginMethod
    public void info(PluginCall call) { call.resolve(info(server != null && !server.isClosed())); }

    private JSObject info(boolean running) {
        JSObject o = new JSObject();
        JSArray ips = new JSArray();
        for (String ip : localIps()) ips.put(ip);
        o.put("ips", ips);
        o.put("port", PORT);
        o.put("running", running);
        return o;
    }

    private void stopServer() {
        ServerSocket s = server;
        server = null;
        if (s != null) try { s.close(); } catch (Exception ignored) { }
    }

    @Override
    protected void handleOnDestroy() { stopServer(); }

    // ---------- HTTP-server ----------
    private static String readLine(InputStream in) throws Exception {
        StringBuilder sb = new StringBuilder();
        int c, n = 0;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') sb.append((char) c);
            if (++n > 8192) throw new Exception("kop te lang");
        }
        return c == -1 && sb.length() == 0 ? null : sb.toString();
    }

    private void handle(Socket s) {
        try {
            s.setSoTimeout(5000);
            InputStream in = s.getInputStream();
            String req = readLine(in);
            if (req == null) return;
            String[] rp = req.split(" ");
            String method = rp.length > 0 ? rp[0] : "", path = rp.length > 1 ? rp[1] : "";
            int len = 0;
            String hdrCode = "";
            String line;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                int i = line.indexOf(':');
                if (i < 0) continue;
                String k = line.substring(0, i).trim().toLowerCase(), v = line.substring(i + 1).trim();
                if (k.equals("content-length")) { try { len = Integer.parseInt(v); } catch (Exception ignored) { } }
                if (k.equals("x-kd-code")) hdrCode = v;
            }
            if (method.equals("GET") && path.startsWith("/kd/info")) {
                JSONObject o = new JSONObject();
                o.put("app", "kijkdoos"); o.put("v", 1); o.put("name", name); o.put("platform", "android");
                reply(s, 200, o.toString());
                return;
            }
            if (method.equals("POST") && path.startsWith("/kd/play")) {
                long now = System.currentTimeMillis();
                if (now - failSince > 60000) { fails = 0; failSince = now; }
                if (fails >= 8) { reply(s, 429, "{\"ok\":false,\"error\":\"te veel pogingen\"}"); return; }
                if (code.isEmpty() || !java.security.MessageDigest.isEqual(code.getBytes(StandardCharsets.UTF_8), hdrCode.getBytes(StandardCharsets.UTF_8))) {
                    fails++;
                    reply(s, 401, "{\"ok\":false,\"error\":\"koppelcode klopt niet\"}");
                    return;
                }
                if (len <= 0 || len > 262144) { reply(s, 400, "{\"ok\":false,\"error\":\"ongeldig verzoek\"}"); return; }
                byte[] body = new byte[len];
                int got = 0;
                while (got < len) { int r = in.read(body, got, len - got); if (r < 0) break; got += r; }
                JSObject o = new JSObject(new String(body, 0, got, StandardCharsets.UTF_8));
                String u = o.optString("url", "");
                if (!u.matches("(?i)^https?://.+")) { reply(s, 400, "{\"ok\":false,\"error\":\"alleen http(s)-streams\"}"); return; }
                notifyListeners("remotePlay", o, true);
                bringToFront();
                reply(s, 200, "{\"ok\":true}");
                return;
            }
            reply(s, 404, "{\"ok\":false}");
        } catch (Exception ignored) {
        } finally {
            try { s.close(); } catch (Exception ignored) { }
        }
    }

    private static void reply(Socket s, int code, String json) throws Exception {
        byte[] b = json.getBytes(StandardCharsets.UTF_8);
        String head = "HTTP/1.1 " + code + (code == 200 ? " OK" : " ERR") + "\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: " + b.length + "\r\nConnection: close\r\n\r\n";
        OutputStream out = s.getOutputStream();
        out.write(head.getBytes(StandardCharsets.UTF_8));
        out.write(b);
        out.flush();
    }

    /** Best effort: Kijkdoos naar voren halen (Android kan dit op de achtergrond blokkeren). */
    private void bringToFront() {
        try {
            android.content.pm.PackageManager pm = getContext().getPackageManager();
            String pkg = getContext().getPackageName();
            Intent i = pm.getLaunchIntentForPackage(pkg);
            if (i == null) i = pm.getLeanbackLaunchIntentForPackage(pkg);
            if (i == null) return;
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            getContext().startActivity(i);
        } catch (Throwable ignored) { }
    }

    // ---------- Netwerk ----------
    private static List<String> localIps() {
        List<String> out = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
            if (nis == null) return out;
            for (NetworkInterface ni : Collections.list(nis)) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) out.add(a.getHostAddress());
                }
            }
        } catch (Exception ignored) { }
        return out;
    }

    @PluginMethod
    public void scan(final PluginCall call) {
        new Thread(() -> {
            final List<JSONObject> found = Collections.synchronizedList(new ArrayList<>());
            final List<String> mine = localIps();
            ExecutorService ex = Executors.newFixedThreadPool(64);
            for (String ip : mine) {
                String prefix = ip.substring(0, ip.lastIndexOf('.') + 1);
                for (int n = 1; n <= 254; n++) {
                    final String host = prefix + n;
                    if (mine.contains(host)) continue;
                    ex.submit(() -> {
                        try {
                            HttpURLConnection c = (HttpURLConnection) new URL("http://" + host + ":" + PORT + "/kd/info").openConnection();
                            c.setConnectTimeout(450); c.setReadTimeout(800);
                            if (c.getResponseCode() == 200) {
                                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                                try (InputStream in = c.getInputStream()) { byte[] buf = new byte[2048]; int r; while ((r = in.read(buf)) > 0 && bo.size() < 8192) bo.write(buf, 0, r); }
                                JSONObject o = new JSONObject(new String(bo.toByteArray(), StandardCharsets.UTF_8));
                                if ("kijkdoos".equals(o.optString("app"))) {
                                    JSONObject d = new JSONObject();
                                    d.put("name", o.optString("name", host)); d.put("host", host); d.put("port", PORT); d.put("platform", o.optString("platform", ""));
                                    found.add(d);
                                }
                            }
                            c.disconnect();
                        } catch (Exception ignored) { }
                    });
                }
            }
            ex.shutdown();
            try { ex.awaitTermination(12, TimeUnit.SECONDS); } catch (InterruptedException ignored) { }
            JSArray arr = new JSArray();
            synchronized (found) { for (JSONObject d : found) arr.put(d); }
            JSObject ret = new JSObject();
            ret.put("devices", arr);
            call.resolve(ret);
        }, "kd-remote-scan").start();
    }

    @PluginMethod
    public void send(final PluginCall call) {
        final String host = call.getString("host", ""), code = call.getString("code", "");
        final int port = call.getInt("port", PORT);
        final JSObject payload = call.getObject("payload");
        if (host == null || host.isEmpty() || payload == null) { call.reject("geen apparaat of opdracht"); return; }
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL("http://" + host + ":" + port + "/kd/play").openConnection();
                c.setConnectTimeout(4000); c.setReadTimeout(8000);
                c.setRequestMethod("POST"); c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                c.setRequestProperty("X-KD-Code", code == null ? "" : code);
                byte[] b = payload.toString().getBytes(StandardCharsets.UTF_8);
                c.setFixedLengthStreamingMode(b.length);
                try (OutputStream out = c.getOutputStream()) { out.write(b); }
                int rc = c.getResponseCode();
                c.disconnect();
                if (rc == 200) { call.resolve(new JSObject().put("ok", true)); return; }
                call.reject(rc == 401 ? "koppelcode klopt niet" : rc == 429 ? "te veel pogingen, wacht even" : "ontvanger weigerde (" + rc + ")");
            } catch (java.net.SocketTimeoutException | java.net.ConnectException e) {
                call.reject("apparaat niet bereikbaar (staat Kijkdoos open en is de ontvanger aan?)");
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "versturen mislukt" : e.getMessage());
            }
        }, "kd-remote-send").start();
    }
}
