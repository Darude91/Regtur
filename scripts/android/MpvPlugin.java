package __PKG__;

import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

/** Ingebouwde speler (libmpv): { available }, play({urls,titles,starts,idx,kids,live}), addSub({url}) + event "needSub". */
@CapacitorPlugin(name = "KdMpv")
public class MpvPlugin extends Plugin {

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ok", KdMpvActivity.available());
        call.resolve(r);
    }

    @PluginMethod
    public void play(PluginCall call) {
        try {
            JSArray urls = call.getArray("urls");
            if (urls == null || urls.length() == 0) { call.reject("urls ontbreken"); return; }
            JSArray titles = call.getArray("titles");
            JSArray starts = call.getArray("starts");
            int n = urls.length();
            String[] u = new String[n], t = new String[n]; double[] s = new double[n];
            for (int i = 0; i < n; i++) {
                u[i] = urls.getString(i);
                t[i] = titles != null && i < titles.length() ? titles.getString(i) : "";
                s[i] = starts != null && i < starts.length() ? starts.getDouble(i) : 0;
            }
            Intent i = new Intent(getContext(), KdMpvActivity.class);
            i.putExtra("urls", u); i.putExtra("titles", t); i.putExtra("starts", s);
            i.putExtra("idx", call.getInt("idx", 0)); i.putExtra("kids", call.getBoolean("kids", false)); i.putExtra("live", call.getBoolean("live", false));
            KdMpvActivity.listener = (idx, other) -> {
                JSObject o = new JSObject(); o.put("idx", idx); o.put("other", other);
                notifyListeners("needSub", o);
            };
            startActivityForResult(call, i, "onResult");
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "kon speler niet starten" : e.getMessage());
        }
    }

    @ActivityCallback
    private void onResult(PluginCall call, ActivityResult res) {
        KdMpvActivity.listener = null;
        if (call == null) return;
        JSObject r = new JSObject();
        Intent d = res.getData();
        if (d != null) {
            String err = d.getStringExtra("error");
            if (err != null) r.put("error", err);
            String p = d.getStringExtra("progress");
            if (p != null) { try { r.put("progress", new JSArray(p)); } catch (Exception ignored) { } }
            r.put("idx", d.getIntExtra("idx", 0));
        }
        call.resolve(r);
    }

    @PluginMethod
    public void addSub(PluginCall call) {
        String url = call.getString("url");
        JSObject r = new JSObject();
        r.put("ok", url != null && KdMpvActivity.addSub(url));
        call.resolve(r);
    }
}
