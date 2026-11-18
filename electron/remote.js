// Kijkdoos-naar-Kijkdoos (Windows): ontvangen en versturen van afspeelopdrachten binnen het eigen netwerk.
// Ontvanger: HTTP-server op poort 8765, opdrachten alleen met de juiste koppelcode. Zoeken: eigen /24-netwerk.
const http = require('http');
const os = require('os');
const crypto = require('crypto');

const PORT = 8765;
let server = null, cfg = { name: 'Kijkdoos pc', code: '' }, onPlay = null, fails = 0, failSince = 0;

function localIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) out.push(a.address);
  }
  return out;
}
const info = () => ({ ips: localIps(), port: PORT, running: !!server });
const json = (res, code, o) => { const b = JSON.stringify(o); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(b), Connection: 'close' }); res.end(b); };
const sameCode = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function handler(req, res) {
  if (req.method === 'GET' && req.url.startsWith('/kd/info')) return json(res, 200, { app: 'kijkdoos', v: 1, name: cfg.name, platform: 'windows' });
  if (req.method === 'POST' && req.url.startsWith('/kd/play')) {
    const now = Date.now();
    if (now - failSince > 60000) { fails = 0; failSince = now; }
    if (fails >= 8) return json(res, 429, { ok: false, error: 'te veel pogingen' });
    if (!cfg.code || !sameCode(cfg.code, req.headers['x-kd-code'] || '')) { fails++; return json(res, 401, { ok: false, error: 'koppelcode klopt niet' }); }
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > 262144) { req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      try {
        const o = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!/^https?:\/\/.+/i.test(String(o.url || ''))) return json(res, 400, { ok: false, error: 'alleen http(s)-streams' });
        if (onPlay) onPlay(o);
        json(res, 200, { ok: true });
      } catch { json(res, 400, { ok: false, error: 'ongeldig verzoek' }); }
    });
    return;
  }
  json(res, 404, { ok: false });
}

function stop() { if (server) { try { server.close(); } catch {} server = null; } }
function start(opts, cb) {
  stop();
  cfg = { name: (opts && opts.name) || 'Kijkdoos pc', code: String((opts && opts.code) || '') };
  onPlay = cb;
  return new Promise(resolve => {
    const s = http.createServer(handler);
    s.once('error', e => { if (server === s) server = null; resolve({ ok: false, error: 'kan poort ' + PORT + ' niet openen: ' + e.message }); });
    s.listen(PORT, '0.0.0.0', () => { server = s; resolve(Object.assign({ ok: true }, info())); });
  });
}

function probe(host) {
  return new Promise(resolve => {
    const req = http.get({ host, port: PORT, path: '/kd/info', timeout: 700 }, res => {
      let b = ''; res.setEncoding('utf8');
      res.on('data', d => { if (b.length < 8192) b += d; });
      res.on('end', () => { try { const o = JSON.parse(b); resolve(o && o.app === 'kijkdoos' ? { name: o.name || host, host, port: PORT, platform: o.platform || '' } : null); } catch { resolve(null); } });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}
async function scan() {
  const mine = localIps(), hosts = [];
  for (const ip of mine) { const p = ip.slice(0, ip.lastIndexOf('.') + 1); for (let i = 1; i <= 254; i++) if (!mine.includes(p + i)) hosts.push(p + i); }
  const found = []; let next = 0;
  await Promise.all(Array.from({ length: 64 }, async () => { while (next < hosts.length) { const d = await probe(hosts[next++]); if (d) found.push(d); } }));
  return found;
}

function send({ host, port, code, payload }) {
  return new Promise(resolve => {
    if (!host || !payload) return resolve({ ok: false, error: 'geen apparaat of opdracht' });
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const req = http.request({ host, port: port || PORT, path: '/kd/play', method: 'POST', timeout: 8000, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'X-KD-Code': code || '' } }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode === 200 ? { ok: true } : { ok: false, error: res.statusCode === 401 ? 'koppelcode klopt niet' : res.statusCode === 429 ? 'te veel pogingen, wacht even' : 'ontvanger weigerde (' + res.statusCode + ')' }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'apparaat niet bereikbaar (staat Kijkdoos open en is de ontvanger aan?)' }); });
    req.on('error', () => resolve({ ok: false, error: 'apparaat niet bereikbaar (staat Kijkdoos open en is de ontvanger aan?)' }));
    req.end(body);
  });
}

module.exports = { start, stop, info, scan, send };
