// Windows-app: laadt de web-app zonder browserbeperkingen (geen CORS, http-streams toegestaan)
// en kan streams doorgeven aan een externe speler (VLC, mpv, MPC-HC, PotPlayer, …).
const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

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
ipcMain.handle('kd:openPlayer', async (_e, o) => {
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
  if (/^mpv/.test(base)) argv.unshift('--slang=nl,nld,dut,en,eng', ...(o.live ? [] : ['--save-position-on-quit']));
  else if (/^vlc/.test(base)) argv.unshift('--sub-language=nl,en', ...(o.live ? [] : ['--qt-continue=2']));
  return new Promise(resolve => {
    try {
      const p = spawn(exe, argv, { detached: true, stdio: 'ignore' });
      p.on('error', e => resolve({ ok: false, msg: e.message }));
      p.on('spawn', () => { p.unref(); resolve({ ok: true }); });
    } catch (e) { resolve({ ok: false, msg: e.message }); }
  });
});

// ---------- Downloads (offline kijken) ----------
const dl = require('./download');
const dlDir = () => path.join(app.getPath('userData'), 'downloads');
ipcMain.handle('kd:download', (e, o) => dl.download(dlDir(), o, (got, total) => { try { e.sender.send('kd:dlprogress', { id: o.id, got, total }); } catch {} }));
ipcMain.handle('kd:dlpause', (_e, id) => dl.pause(id));
ipcMain.handle('kd:dlremove', (_e, id) => dl.remove(dlDir(), id));
ipcMain.handle('kd:dlfolder', () => shell.openPath(dlDir()));

app.whenReady().then(() => { cleanTemp(); createWindow(); });
app.on('window-all-closed', () => app.quit());
