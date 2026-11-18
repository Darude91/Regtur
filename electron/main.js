// Windows-app: laadt de web-app zonder browserbeperkingen (geen CORS, http-streams toegestaan)
// en kan streams doorgeven aan een externe speler (VLC, mpv, MPC-HC, PotPlayer, …).
const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-blink-features', 'AudioVideoTracks'); // audiosporen (video.audioTracks) kiesbaar maken

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 840, minWidth: 420, minHeight: 500,
    backgroundColor: '#0b0d14', autoHideMenuBar: true, title: 'Kijkdoos',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      webSecurity: false, allowRunningInsecureContent: true, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // F11 = volledig scherm
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
}

// ---------- Externe spelers ----------
const REL = [
  ['VLC', 'VideoLAN\\VLC\\vlc.exe'], ['mpv', 'mpv\\mpv.exe'], ['mpv.net', 'mpv.net\\mpvnet.exe'],
  ['MPC-HC', 'MPC-HC\\mpc-hc64.exe'], ['MPC-BE', 'MPC-BE x64\\mpc-be64.exe'],
  ['PotPlayer', 'DAUM\\PotPlayer\\PotPlayerMini64.exe'], ['PotPlayer', 'PotPlayer\\PotPlayerMini64.exe'],
];
function detectPlayers() {
  const found = new Map();
  const add = (name, p) => { try { if (p && fs.existsSync(p) && !found.has(p.toLowerCase())) found.set(p.toLowerCase(), { name, path: p }); } catch {} };
  const drives = [];
  for (let c = 67; c <= 90; c++) { const d = String.fromCharCode(c) + ':\\'; try { if (fs.existsSync(d)) drives.push(d); } catch {} }
  for (const d of drives) for (const [name, rel] of REL) {
    add(name, d + 'Program Files\\' + rel); add(name, d + 'Program Files (x86)\\' + rel);
    if (name === 'mpv') { add(name, d + 'mpv\\mpv.exe'); add(name, d + 'Programs\\mpv\\mpv.exe'); }
  }
  const home = os.homedir(), local = process.env.LOCALAPPDATA || '';
  add('mpv', path.join(home, 'scoop', 'apps', 'mpv', 'current', 'mpv.exe'));
  add('mpv', path.join(local, 'Microsoft', 'WinGet', 'Links', 'mpv.exe'));
  add('mpv', 'C:\\ProgramData\\chocolatey\\bin\\mpv.exe');
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    add('mpv', path.join(dir, 'mpv.exe')); add('VLC', path.join(dir, 'vlc.exe'));
  }
  return [...found.values()];
}

function splitArgs(s) {
  const out = []; const re = /"([^"]*)"|(\S+)/g; let m;
  while ((m = re.exec(s || ''))) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

function writePlaylist(items) {
  const dir = path.join(os.tmpdir(), 'kijkdoos');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `lijst-${Date.now()}.m3u`);
  const clean = t => String(t || '').replace(/[\r\n]+/g, ' ');
  fs.writeFileSync(file, '#EXTM3U\n' + items.map(i => `#EXTINF:-1,${clean(i.title)}\n${clean(i.url)}\n`).join(''), 'utf8');
  return file;
}
function cleanTemp() {
  const dir = path.join(os.tmpdir(), 'kijkdoos');
  try { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (Date.now() - fs.statSync(p).mtimeMs > 12 * 3600e3) fs.unlinkSync(p); } } catch {}
}

ipcMain.handle('kd:detectPlayers', () => detectPlayers());
ipcMain.handle('kd:browsePlayer', async () => {
  const r = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || undefined,
    { title: 'Kies een mediaspeler', properties: ['openFile'], filters: [{ name: 'Programma', extensions: ['exe'] }] });
  return r.canceled ? null : r.filePaths[0];
});
/**
 * Start de speler. Bij meerdere afleveringen wordt een afspeellijst (.m3u) geopend, beginnend bij de
 * gekozen aflevering; VLC, mpv, MPC-HC en PotPlayer spelen die vanzelf achter elkaar af.
 */
ipcMain.handle('kd:openPlayer', async (e, o) => {
  const exe = o && o.path;
  if (!exe || !fs.existsSync(exe)) return { ok: false, msg: 'Speler niet gevonden: ' + exe };
  const list = Array.isArray(o.playlist) && o.playlist.length ? o.playlist : [{ url: o.url, title: o.title }];
  const multi = list.length > 1;
  const target = multi ? writePlaylist(list) : o.url;
  const tokens = splitArgs(o.args);
  const sub = t => t.replace(/\{url\}/g, target).replace(/\{title\}/g, o.title || '');
  const argv = tokens.map(sub);
  if (!tokens.some(t => t.includes('{url}'))) argv.push(target);
  const base = path.basename(exe).toLowerCase();
  if (!multi && /^mpv/.test(base) && o.title) argv.unshift('--force-media-title=' + o.title);
  // Ondertitel van OpenSubtitles: mpv kan een URL aan; VLC heeft een bestand nodig
  if (o.subUrl && !multi) {
    if (/^mpv/.test(base)) argv.unshift('--sub-file=' + o.subUrl);
    else if (/^vlc/.test(base)) {
      try {
        const r = await fetch(o.subUrl); if (r.ok) { const f = path.join(os.tmpdir(), 'kijkdoos', 'sub-' + Date.now() + '.srt'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); argv.unshift('--sub-file=' + f); }
      } catch {}
    }
  }
  // Hervatten + ondertitels: mpv bewaart zelf je positie; VLC vragen we dat ook te doen. NL-ondertitel, anders EN.
  // Audio: gewone titels Engels (anders Nederlands), kindertitels Nederlands (anders Engels); ondertitels NL, anders EN
  if (/^mpv/.test(base)) argv.unshift(o.kids ? '--alang=nl,nld,dut,en,eng' : '--alang=en,eng,nl,nld,dut', '--slang=nl,nld,dut,en,eng', ...(o.live ? [] : ['--save-position-on-quit']));
  else if (/^vlc/.test(base)) argv.unshift(o.kids ? '--audio-language=nl,en' : '--audio-language=en,nl', '--sub-language=nl,en', ...(o.live ? [] : ['--qt-continue=2']));
  // Vertraagde ondertitel-fallback: mpv via IPC, VLC via zijn HTTP-interface (alleen eerste titel, niet bij live)
  let watch = null;
  if (!o.live) {
    if (/^mpv/.test(base)) { const pipe = '\\\\.\\pipe\\kd-ext-' + process.pid + '-' + Date.now(); argv.unshift('--input-ipc-server=' + pipe); watch = { kind: 'mpv', pipe }; }
    else if (/^vlc/.test(base)) { const port = 20000 + Math.floor(Math.random() * 20000); argv.unshift('--extraintf=http', '--http-host=127.0.0.1', '--http-port=' + port, '--http-password=kd'); watch = { kind: 'vlc', port }; }
  }
  return new Promise(resolve => {
    try {
      const p = spawn(exe, argv, { detached: true, stdio: 'ignore' });
      p.on('error', err => resolve({ ok: false, msg: err.message }));
      p.on('spawn', () => { p.unref(); resolve({ ok: true }); if (watch) watchExternal(e, p, watch); });
    } catch (err) { resolve({ ok: false, msg: err.message }); }
  });
});

const SUB_DELAY_EXT = 8000;
let vlcCtl = null;
function watchExternal(e, p, w) {
  const send = m => { try { e.sender.send('kd:mpv', m); } catch {} };
  p.on('exit', () => { if (vlcCtl && vlcCtl.port === w.port) vlcCtl = null; send({ type: 'closed' }); });
  if (w.kind === 'mpv') {
    const me = { proc: p, sock: null, quit: false }; mpv = me;
    setTimeout(() => {
      let tries = 0;
      const go = () => {
        if (mpv !== me) return;
        const sock = net.connect(w.pipe); let buf = ''; const pend = new Map(); let rid = 0;
        const ask = prop => new Promise(res => { const id = ++rid; pend.set(id, res); try { sock.write(JSON.stringify({ command: ['get_property', prop], request_id: id }) + '\n'); } catch { res(null); } setTimeout(() => { if (pend.delete(id)) res(null); }, 1500); });
        sock.on('connect', async () => {
          me.sock = sock;
          const al = await ask('current-tracks/audio/lang');
          if (typeof al === 'string' && RE_NLCODE.test(al)) return;
          const tl = await ask('track-list');
          const subs = Array.isArray(tl) ? tl.filter(t => t.type === 'sub') : [];
          if (!subs.some(t => RE_NLCODE.test(t.lang || '') || /dutch|nederl/i.test(t.title || ''))) send({ type: 'needSub', idx: 0, other: subs.some(t => !t.external) });
        });
        sock.on('data', d => { buf += d.toString('utf8'); let n; while ((n = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, n); buf = buf.slice(n + 1); try { const m = JSON.parse(line); if (m.request_id && pend.has(m.request_id)) { const f = pend.get(m.request_id); pend.delete(m.request_id); f(m.error === 'success' ? m.data : null); } } catch {} } });
        sock.on('error', () => { sock.destroy(); if (!me.sock && ++tries < 5) setTimeout(go, 1000); });
      };
      go();
    }, SUB_DELAY_EXT);
  } else {
    setTimeout(async () => {
      try {
        const auth = 'Basic ' + Buffer.from(':kd').toString('base64');
        const r = await fetch('http://127.0.0.1:' + w.port + '/requests/status.xml', { headers: { Authorization: auth } });
        if (!r.ok) return;
        const xml = await r.text();
        vlcCtl = { port: w.port, auth };
        const cats = [...xml.matchAll(/<category name="Stream \d+">([\s\S]*?)<\/category>/g)].map(m => m[1]);
        const info = (c, k) => { const m = c.match(new RegExp('<info name="' + k + '">([^<]*)<')); return m ? m[1] : ''; };
        const subs = cats.filter(c => /subtitle/i.test(info(c, 'Type')));
        const audios = cats.filter(c => /audio/i.test(info(c, 'Type')));
        const isNl = c => /nederl|dutch|^nl|^nld|^dut/i.test(info(c, 'Language'));
        if (audios.length && audios.every(isNl)) return;
        if (!subs.some(isNl)) send({ type: 'needSub', idx: 0, other: subs.length > 0 });
      } catch {}
    }, SUB_DELAY_EXT);
  }
}


// ---------- Ingebouwde speler: meegeleverde mpv (echte audio-/ondertitelkeuze) ----------
const net = require('net');
function bundledMpv() {
  for (const c of [path.join(process.resourcesPath || '', 'mpv', 'mpv.exe'), path.join(__dirname, '..', 'build', 'mpv', 'mpv.exe')]) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return null;
}
ipcMain.handle('kd:mpvAvailable', () => !!bundledMpv());
const RE_NLCODE = /^(nl|nld|dut|nld-nl|nl-nl|nl-be)$/i;
let mpv = null; // { proc, sock, quit }
function mpvQuit() { if (mpv) { try { mpv.quit = true; mpv.sock && mpv.sock.write('{"command":["quit"]}\n'); } catch {} try { mpv.proc.kill(); } catch {} mpv = null; } }

ipcMain.handle('kd:mpvPlay', async (e, o) => {
  const exe = bundledMpv();
  if (!exe) return { ok: false, msg: 'mpv niet meegeleverd' };
  mpvQuit();
  const list = Array.isArray(o.playlist) && o.playlist.length ? o.playlist : [{ url: o.url, title: o.title }];
  const starts = Array.isArray(o.starts) ? o.starts : [];
  const cfg = path.join(app.getPath('userData'), 'mpv'); fs.mkdirSync(cfg, { recursive: true });
  fs.writeFileSync(path.join(cfg, 'input.conf'), [
    'a cycle audio ; show-text "Audio: ${current-tracks/audio/lang} ${current-tracks/audio/title}"',
    's cycle sub ; show-text "Ondertitel: ${current-tracks/sub/lang} ${current-tracks/sub/title}"',
    't show-text "${track-list}" 8000',
    'n playlist-next', 'b playlist-prev', 'ENTER cycle fullscreen',
  ].join('\n') + '\n', 'utf8');
  const pipe = '\\\\.\\pipe\\kd-mpv-' + process.pid + '-' + Date.now();
  const target = list.length > 1 ? writePlaylist(list) : list[0].url;
  const argv = [
    '--config-dir=' + cfg, '--input-conf=' + path.join(cfg, 'input.conf'),
    '--input-ipc-server=' + pipe, '--force-window=yes', '--autofit=80%', '--keep-open=no', '--idle=no',
    '--osc=yes', '--osd-level=1', '--hwdec=auto-safe', '--cache=yes', '--demuxer-max-bytes=150MiB',
    '--alang=' + (o.kids ? 'nl,nld,dut,en,eng' : 'en,eng,nl,nld,dut'), '--slang=nl,nld,dut,en,eng',
    '--sub-auto=fuzzy', '--title=${media-title} — Kijkdoos',
  ];
  if (list.length === 1 && list[0].title) argv.push('--force-media-title=' + list[0].title);
  if (o.subUrl) argv.push('--sub-file=' + o.subUrl);
  argv.push(target);
  const send = m => { try { e.sender.send('kd:mpv', m); } catch {} };
  return new Promise(resolve => {
    let proc;
    try { proc = spawn(exe, argv, { stdio: 'ignore' }); } catch (err) { return resolve({ ok: false, msg: err.message }); }
    const me = { proc, sock: null, quit: false }; mpv = me;
    let done = false;
    proc.on('error', err => { if (!done) { done = true; resolve({ ok: false, msg: err.message }); } });
    proc.on('spawn', () => { if (!done) { done = true; resolve({ ok: true }); } });
    proc.on('exit', () => { if (mpv === me) mpv = null; send({ type: 'closed' }); });

    let idx = 0, pos = 0, dur = 0, lastSent = 0, rid = 100; const pending = new Map();
    const cmd = (...c) => { try { me.sock && me.sock.write(JSON.stringify({ command: c }) + '\n'); } catch {} };
    const ask = (prop) => new Promise(res => { const id = ++rid; pending.set(id, res); try { me.sock.write(JSON.stringify({ command: ['get_property', prop], request_id: id }) + '\n'); } catch { res(null); } setTimeout(() => { if (pending.delete(id)) res(null); }, 1500); });
    // Fallback-ondertitel: pas SUB_DELAY ms na het laden opnieuw kijken. Zit er dan nog steeds geen Nederlandse
    // ondertitel in (of naast) de stream, dan vraagt de app er een aan bij OpenSubtitles.
    const SUB_DELAY = 6000;
    const checkSub = async (forIdx) => {
      if (me.quit || mpv !== me || idx !== forIdx || !me.sock) return;
      const tl = await ask('track-list');
      if (!Array.isArray(tl)) return;
      const subs = tl.filter(t => t.type === 'sub');
      if (subs.some(t => RE_NLCODE.test(t.lang || '') || /dutch|nederl/i.test(t.title || ''))) return;   // NL aanwezig (ook een eerder toegevoegde)
      send({ type: 'needSub', idx: forIdx, other: subs.some(t => !t.external) });
    };
    const onLoaded = async () => {
      // hervatten waar je was gebleven
      const st = +starts[idx] || 0; if (st > 20 && !o.live) cmd('seek', st, 'absolute');
      // Nederlandse audio → geen ondertitels; anders blijft NL (of anders EN) ondertitel staan
      const al = await ask('current-tracks/audio/lang');
      const nlAudio = typeof al === 'string' && RE_NLCODE.test(al);
      if (nlAudio) cmd('set_property', 'sid', 'no');
      else if (!o.live) setTimeout(() => checkSub(idx), SUB_DELAY);   // fallback: pas na een tijdje, de eigen sporen van de stream gaan voor
      cmd('show-text', 'Audio: ${current-tracks/audio/lang} ${current-tracks/audio/title}  |  Ondertitel: ${current-tracks/sub/lang} ${current-tracks/sub/title}   (a = audio, s = ondertitel, t = lijst)', 5000);
    };
    let tries = 0;
    const connect = () => {
      if (me.quit || mpv !== me) return;
      const sock = net.connect(pipe);
      let buf = '';
      sock.on('connect', () => {
        me.sock = sock;
        cmd('observe_property', 1, 'time-pos'); cmd('observe_property', 2, 'duration'); cmd('observe_property', 3, 'playlist-pos');
      });
      sock.on('data', d => {
        buf += d.toString('utf8'); let n;
        while ((n = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, n); buf = buf.slice(n + 1);
          let m; try { m = JSON.parse(line); } catch { continue; }
          if (m.request_id && pending.has(m.request_id)) { const f = pending.get(m.request_id); pending.delete(m.request_id); f(m.error === 'success' ? m.data : null); continue; }
          if (m.event === 'property-change') {
            if (m.name === 'time-pos' && typeof m.data === 'number') { pos = m.data; const t = Date.now(); if (t - lastSent > 5000) { lastSent = t; send({ type: 'pos', idx, pos, dur }); } }
            else if (m.name === 'duration' && typeof m.data === 'number') dur = m.data;
            else if (m.name === 'playlist-pos' && typeof m.data === 'number' && m.data !== idx) { send({ type: 'pos', idx, pos, dur }); idx = m.data; pos = 0; dur = 0; send({ type: 'item', idx }); }
          } else if (m.event === 'file-loaded') onLoaded();
          else if (m.event === 'end-file') { if (m.reason === 'eof') send({ type: 'eof', idx }); else send({ type: 'pos', idx, pos, dur }); }
        }
      });
      sock.on('error', () => { sock.destroy(); if (!me.sock && ++tries < 75) setTimeout(connect, 200); });
      sock.on('close', () => { if (me.sock === sock) me.sock = null; });
    };
    setTimeout(connect, 300);
  });
});
ipcMain.handle('kd:mpvSub', async (_e, url, lang) => {
  try {
    if (!(mpv && mpv.sock) && !vlcCtl) return false;
    let target = url;
    if (/^https?:/i.test(url)) {   // eerst naar een tijdelijk bestand: betrouwbaarder dan mpv zelf laten downloaden
      const r = await fetch(url, { headers: { 'User-Agent': 'Kijkdoos v1.2' } });
      if (!r.ok) return false;
      target = path.join(os.tmpdir(), 'kijkdoos', 'sub-' + Date.now() + '.srt');
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(await r.arrayBuffer()));
    }
    const l = lang === 'en' ? 'en' : 'nl';
    if (vlcCtl && !(mpv && mpv.sock)) {
      const uri = 'file:///' + target.replace(/\\/g, '/');
      const r = await fetch('http://127.0.0.1:' + vlcCtl.port + '/requests/status.xml?command=addsubtitle&val=' + encodeURIComponent(uri), { headers: { Authorization: vlcCtl.auth } });
      return r.ok;
    }
    mpv.sock.write(JSON.stringify({ command: ['sub-add', target, 'select', (l === 'nl' ? 'Nederlands' : 'English') + ' (OpenSubtitles)', l] }) + '\n');
    return true;
  } catch { return false; }
});
ipcMain.handle('kd:mpvStop', () => { mpvQuit(); return true; });

// ---------- Downloads (offline kijken) ----------
const dl = require('./download');
const dlDir = () => path.join(app.getPath('userData'), 'downloads');
ipcMain.handle('kd:download', (e, o) => dl.download(dlDir(), o, (got, total) => { try { e.sender.send('kd:dlprogress', { id: o.id, got, total }); } catch {} }));
ipcMain.handle('kd:dlpause', (_e, id) => dl.pause(id));
ipcMain.handle('kd:dlremove', (_e, id) => dl.remove(dlDir(), id));
ipcMain.handle('kd:dlfolder', () => shell.openPath(dlDir()));

app.whenReady().then(() => { cleanTemp(); createWindow(); });
app.on('window-all-closed', () => app.quit());
