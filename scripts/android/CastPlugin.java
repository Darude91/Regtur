package __PKG__;

import android.net.Uri;

import androidx.mediarouter.app.MediaRouteChooserDialog;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.MediaSeekOptions;
import com.google.android.gms.cast.MediaStatus;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.SessionManager;
import com.google.android.gms.cast.framework.SessionManagerListener;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;
import com.google.android.gms.common.images.WebImage;

/**
 * Casten naar Chromecast / Google TV / Android TV (Google Cast).
 *   init()            -> { available, connected, name }
 *   start({url,title,poster,live,position,contentType,choose})
 *                     kiest (indien nodig) een apparaat en start het afspelen
 *   control({action}) toggle | play | pause | seekBy (ms) | seek (ms) | stop | disconnect | devices
 * Events "castState": { connected, name, state, pos, dur, finished, url }
 */
@CapacitorPlugin(name = "KdCast")
public class CastPlugin extends Plugin {
    private CastContext cc;
    private SessionManager sm;
    private JSObject pending;                 // wacht op een sessie
    private RemoteMediaClient attached;

    private final RemoteMediaClient.Callback mediaCb = new RemoteMediaClient.Callback() {
        @Override public void onStatusUpdated() { emit(); }
    };
    private final RemoteMediaClient.ProgressListener progressCb = (progress, duration) -> emit();

    private final SessionManagerListener<CastSession> sessionCb = new SessionManagerListener<CastSession>() {
        @Override public void onSessionStarting(CastSession s) { }
        @Override public void onSessionStarted(CastSession s, String id) { onSession(s); }
        @Override public void onSessionStartFailed(CastSession s, int error) { pending = null; emit(); }
        @Override public void onSessionEnding(CastSession s) { }
        @Override public void onSessionEnded(CastSession s, int error) { detach(); emit(); }
        @Override public void onSessionResuming(CastSession s, String id) { }
        @Override public void onSessionResumed(CastSession s, boolean wasSuspended) { onSession(s); }
        @Override public void onSessionResumeFailed(CastSession s, int error) { }
        @Override public void onSessionSuspended(CastSession s, int reason) { }
    };

    private boolean ensure() {
        if (cc != null) return true;
        try {
            cc = CastContext.getSharedInstance(getContext());
            sm = cc.getSessionManager();
            sm.addSessionManagerListener(sessionCb, CastSession.class);
            return true;
        } catch (Exception e) {
            cc = null;
            return false;
        }
    }

    private CastSession session() {
        CastSession s = sm == null ? null : sm.getCurrentCastSession();
        return s != null && s.isConnected() ? s : null;
    }

    private void detach() {
        if (attached != null) {
            try { attached.unregisterCallback(mediaCb); attached.removeProgressListener(progressCb); } catch (Exception ignored) { }
            attached = null;
        }
    }

    private void attach(CastSession s) {
        RemoteMediaClient rc = s.getRemoteMediaClient();
        if (rc == null || rc == attached) return;
        detach();
        rc.registerCallback(mediaCb);
        rc.addProgressListener(progressCb, 1500);
        attached = rc;
    }

    private void onSession(CastSession s) {
        attach(s);
        if (pending != null) { JSObject p = pending; pending = null; load(s, p); }
        emit();
    }

    private void load(CastSession s, JSObject p) {
        RemoteMediaClient rc = s.getRemoteMediaClient();
        if (rc == null) return;
        boolean live = p.optBoolean("live", false);
        MediaMetadata md = new MediaMetadata(live ? MediaMetadata.MEDIA_TYPE_GENERIC : MediaMetadata.MEDIA_TYPE_MOVIE);
        md.putString(MediaMetadata.KEY_TITLE, p.optString("title", ""));
        String poster = p.optString("poster", "");
        if (poster != null && poster.startsWith("http")) md.addImage(new WebImage(Uri.parse(poster)));
        MediaInfo info = new MediaInfo.Builder(p.optString("url", ""))
                .setStreamType(live ? MediaInfo.STREAM_TYPE_LIVE : MediaInfo.STREAM_TYPE_BUFFERED)
                .setContentType(p.optString("contentType", "video/mp4"))
                .setMetadata(md)
                .build();
        MediaLoadRequestData req = new MediaLoadRequestData.Builder()
                .setMediaInfo(info)
                .setAutoplay(true)
                .setCurrentTime(live ? 0 : p.optLong("position", 0))
                .build();
        attach(s);
        rc.load(req);
    }

    private void emit() {
        JSObject o = new JSObject();
        CastSession s = session();
        o.put("connected", s != null);
        if (s != null) {
            try { if (s.getCastDevice() != null) o.put("name", s.getCastDevice().getFriendlyName()); } catch (Exception ignored) { }
            RemoteMediaClient rc = s.getRemoteMediaClient();
            if (rc != null) {
                MediaStatus st = rc.getMediaStatus();
                String state = "idle";
                boolean finished = false;
                if (st != null) {
                    switch (st.getPlayerState()) {
                        case MediaStatus.PLAYER_STATE_PLAYING: state = "playing"; break;
                        case MediaStatus.PLAYER_STATE_PAUSED: state = "paused"; break;
                        case MediaStatus.PLAYER_STATE_BUFFERING: state = "buffering"; break;
                        case MediaStatus.PLAYER_STATE_LOADING: state = "buffering"; break;
                        default: state = "idle";
                    }
                    finished = st.getPlayerState() == MediaStatus.PLAYER_STATE_IDLE
                            && st.getIdleReason() == MediaStatus.IDLE_REASON_FINISHED;
                }
                o.put("state", state);
                o.put("finished", finished);
                o.put("pos", rc.getApproximateStreamPosition());
                o.put("dur", rc.getStreamDuration());
                MediaInfo mi = rc.getMediaInfo();
                if (mi != null) o.put("url", mi.getContentId());
            }
        }
        notifyListeners("castState", o);
    }

    @PluginMethod
    public void init(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject r = new JSObject();
            boolean ok = ensure();
            r.put("available", ok);
            CastSession s = ok ? session() : null;
            r.put("connected", s != null);
            if (s != null) attach(s);
            call.resolve(r);
        });
    }

    private void chooser() {
        MediaRouteChooserDialog d = new MediaRouteChooserDialog(getActivity());
        d.setRouteSelector(cc.getMergedSelector());
        d.show();
    }

    @PluginMethod
    public void start(PluginCall call) {
        final JSObject p = call.getData();
        getActivity().runOnUiThread(() -> {
            if (!ensure()) { call.reject("Cast niet beschikbaar", "NO_CAST"); return; }
            CastSession s = session();
            if (s != null && !p.optBoolean("choose", false)) { load(s, p); call.resolve(); return; }
            pending = p;
            chooser();
            call.resolve();
        });
    }

    @PluginMethod
    public void control(PluginCall call) {
        final String action = call.getString("action", "");
        final long ms = call.getData() == null ? 0 : call.getData().optLong("ms", 0);
        getActivity().runOnUiThread(() -> {
            if (!ensure()) { call.reject("Cast niet beschikbaar", "NO_CAST"); return; }
            if ("devices".equals(action)) { pending = null; chooser(); call.resolve(); return; }
            if ("disconnect".equals(action)) { sm.endCurrentSession(true); call.resolve(); return; }
            CastSession s = session();
            RemoteMediaClient rc = s == null ? null : s.getRemoteMediaClient();
            if (rc != null) {
                switch (action) {
                    case "toggle": if (rc.isPlaying()) rc.pause(); else rc.play(); break;
                    case "play": rc.play(); break;
                    case "pause": rc.pause(); break;
                    case "stop": rc.stop(); break;
                    case "seek": rc.seek(new MediaSeekOptions.Builder().setPosition(ms).build()); break;
                    case "seekBy": rc.seek(new MediaSeekOptions.Builder()
                            .setPosition(Math.max(0, rc.getApproximateStreamPosition() + ms)).build()); break;
                    default: break;
                }
            }
            call.resolve();
        });
    }
}
