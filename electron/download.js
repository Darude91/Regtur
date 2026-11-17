// Downloads voor offline kijken: streamt een bestand naar schijf, met hervatten (Range) en voortgang.
const fs = require('fs');
const path = require('path');

const ctl = new Map(); // id -> AbortController

function extOf(url) {
  try { const e = path.extname(new URL(url).pathname).toLowerCase(); return /^\.[a-z0-9]{2,5}$/.test(e) ? e : '.mp4'; } catch { return '.mp4'; }
}
function fileFor(dir, id, url) { return path.join(dir, id + extOf(url)); }

/** Download o.url naar dir. onProgress(got, total). Hervat een eerder afgebroken bestand. */
async function download(dir, o, onProgress) {
  fs.mkdirSync(dir, { recursive: true });
  const file = fileFor(dir, o.id, o.url);
  const ac = new AbortController(); ctl.set(o.id, ac);
  try {
    let have = 0; try { have = fs.statSync(file).size; } catch {}
    let r = await fetch(o.url, { headers: have ? { Range: `bytes=${have}-` } : {}, signal: ac.signal, redirect: 'follow' });
    if (have && r.status === 416) { return { ok: true, path: file, size: have }; }       // was al compleet
    if (have && r.status !== 206) have = 0;                                               // server negeert Range: opnieuw
    if (!r.ok && r.status !== 206) throw new Error('HTTP ' + r.status);
    const len = +r.headers.get('content-length') || 0;
    const total = r.status === 206 ? have + len : len;
    const ws = fs.createWriteStream(file, { flags: have ? 'a' : 'w' });
    let got = have, last = 0;
    for await (const chunk of r.body) {
      if (!ws.write(chunk)) await new Promise(res => ws.once('drain', res));
      got += chunk.length;
      const n = Date.now(); if (n - last > 500) { last = n; onProgress && onProgress(got, total); }
    }
    await new Promise((res, rej) => { ws.on('error', rej); ws.end(res); });
    if (total && got < total) throw new Error('onvolledig');
    onProgress && onProgress(got, total || got);
    return { ok: true, path: file, size: got };
  } catch (e) {
    return { ok: false, canceled: ac.signal.aborted, msg: ac.signal.aborted ? 'gepauzeerd' : (e && e.message) || 'mislukt' };
  } finally { ctl.delete(o.id); }
}
const pause = id => { const c = ctl.get(id); if (c) c.abort(); return !!c; };
function remove(dir, id) {
  pause(id);
  try { for (const f of fs.readdirSync(dir)) if (f.startsWith(id + '.')) fs.rmSync(path.join(dir, f), { force: true }); } catch {}
  return true;
}
module.exports = { download, pause, remove, fileFor };
