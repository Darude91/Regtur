// Google Cast (Chromecast / Google TV / Android TV) voor de Windows-app — zonder externe pakketten en zonder koppelcode.
//  - Apparaten zoeken: mDNS (_googlecast._tcp) op alle netwerkkaarten
//  - Afspelen: CASTV2 over TLS (poort 8009) met de standaard mediaspeler van Google (Default Media Receiver)
// De web-app praat hiermee via electron/preload.js (kdNative.castDevices / castStart / castControl / onCastState).
'use strict';
const dgram = require('dgram');
const os = require('os');
const tls = require('tls');

// ---------------- mDNS ----------------
function dnsName(name) {
  const parts = [];
  for (const l of name.split('.').filter(Boolean)) { const b = Buffer.from(l, 'utf8'); parts.push(Buffer.from([b.length]), b); }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}
function buildQuery(name, type) {
  const h = Buffer.alloc(12); h.writeUInt16BE(1, 4);                 // 1 vraag
  const q = Buffer.alloc(4); q.writeUInt16BE(type, 0); q.writeUInt16BE(0x8001, 2);   // klasse IN + "unicast antwoord graag"
  return Buffer.concat([h, dnsName(name), q]);
}
function readName(buf, off) {
  const labels = []; let end = -1, p = off, guard = 0;
  while (guard++ < 64 && p < buf.length) {
    const len = buf[p];
    if (len === 0) { p++; break; }
    if ((len & 0xc0) === 0xc0) { if (end < 0) end = p + 2; p = ((len & 0x3f) << 8) | buf[p + 1]; continue; }
    labels.push(buf.toString('utf8', p + 1, p + 1 + len)); p += 1 + len;
  }
  return [labels.join('.'), end < 0 ? p : end];
}
/** DNS-antwoord ontleden naar { ptr:[instantie], srv:{instantie:{port,target}}, a:{host:ip}, txt:{instantie:{k:v}} } */
function parseDns(buf, into) {
  if (buf.length < 12) return into;
  const qd = buf.readUInt16BE(4), rc = buf.readUInt16BE(6) + buf.readUInt16BE(8) + buf.readUInt16BE(10);
  let off = 12;
  try {
    for (let i = 0; i < qd; i++) { off = readName(buf, off)[1] + 4; }
    for (let i = 0; i < rc; i++) {
      const [name, o1] = readName(buf, off); off = o1;
      const type = buf.readUInt16BE(off), rdlen = buf.readUInt16BE(off + 8); const d = off + 10; off = d + rdlen;
      if (type === 12) { const [inst] = readName(buf, d); if (/_googlecast\._tcp\.local$/i.test(name)) into.ptr.add(inst); }
      else if (type === 33) { into.srv[name] = { port: buf.readUInt16BE(d + 4), target: readName(buf, d + 6)[0] }; }
      else if (type === 1 && rdlen === 4) { into.a[name.toLowerCase()] = `${buf[d]}.${buf[d + 1]}.${buf[d + 2]}.${buf[d + 3]}`; }
      else if (type === 16) {
        const t = {}; let p = d;
        while (p < d + rdlen) { const l = buf[p++]; const s = buf.toString('utf8', p, p + l); p += l; const i = s.indexOf('='); if (i > 0) t[s.slice(0, i)] = s.slice(i + 1); }
        into.txt[name] = t;
      }
    }
  } catch { /* afgebroken pakket: wat we hebben is genoeg */ }
  return into;
}
function toDevices(r) {
  const out = new Map();
  for (const inst of r.ptr) {
    const srv = r.srv[inst]; if (!srv) continue;
    const ip = r.a[String(srv.target).toLowerCase()]; if (!ip) continue;
    const txt = r.txt[inst] || {};
    const id = txt.id || inst;
    out.set(id, { id, name: txt.fn || inst.replace(/\._googlecast\._tcp\.local$/i, ''), host: ip, port: srv.port || 8009, model: txt.md || '' });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}
/** Zoek apparaten ~2,5 s lang. Geeft [{id,name,host,port,model}]. */
function scan(ms = 2500) {
  return new Promise(resolve => {
    const found = { ptr: new Set(), srv: {}, a: {}, txt: {} };
    const socks = []; const asked = new Set();
    const ifaces = [];
    for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) ifaces.push(i.address);
    const send = (s, pkt) => { try { s.send(pkt, 5353, '224.0.0.251'); } catch {} };
    const onMsg = s => msg => {
      parseDns(msg, found);
      // ontbrekende SRV/TXT/A-gegevens expliciet navragen
      for (const inst of found.ptr) {
        if (!found.srv[inst] && !asked.has('s' + inst)) { asked.add('s' + inst); send(s, buildQuery(inst, 255)); }
        const srv = found.srv[inst];
        if (srv && !found.a[String(srv.target).toLowerCase()] && !asked.has('a' + srv.target)) { asked.add('a' + srv.target); send(s, buildQuery(srv.target, 1)); }
      }
    };
    const open = addr => {
      try {
        const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        s.on('error', () => {}); s.on('message', onMsg(s));
        s.bind(0, addr, () => {
          try { if (addr) s.setMulticastInterface(addr); s.setMulticastTTL(255); } catch {}
          send(s, buildQuery('_googlecast._tcp.local', 12));
          setTimeout(() => send(s, buildQuery('_googlecast._tcp.local', 12)), 900);
        });
        socks.push(s);
      } catch {}
    };
    if (ifaces.length) ifaces.forEach(open); else open(undefined);
    setTimeout(() => { for (const s of socks) { try { s.close(); } catch {} } resolve(toDevices(found)); }, ms);
  });
}

// ---------------- CASTV2 (protobuf met de hand) ----------------
const vint = n => { const b = []; while (n > 127) { b.push((n & 127) | 128); n = Math.floor(n / 128); } b.push(n); return Buffer.from(b); };
const fStr = (f, s) => { const b = Buffer.from(String(s), 'utf8'); return Buffer.concat([vint((f << 3) | 2), vint(b.length), b]); };
const fInt = (f, n) => Buffer.concat([vint(f << 3), vint(n)]);
function encode(src, dst, ns, obj) {
  const body = Buffer.concat([fInt(1, 0), fStr(2, src), fStr(3, dst), fStr(4, ns), fInt(5, 0), fStr(6, JSON.stringify(obj))]);
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  return Buffer.concat([len, body]);
}
function decode(buf) {
  const m = {}; let p = 0;
  const rv = () => { let r = 0, mul = 1, b; do { b = buf[p++]; r += (b & 127) * mul; mul *= 128; } while (b & 128); return r; };
  while (p < buf.length) {
    const tag = rv(), f = tag >> 3, wt = tag & 7;
    if (wt === 0) { m[f] = rv(); }
    else if (wt === 2) { const l = rv(); m[f] = buf.toString('utf8', p, p + l); p += l; }
    else if (wt === 1) p += 8; else if (wt === 5) p += 4; else break;
  }
  return { src: m[2], dst: m[3], ns: m[4], payload: m[6] };
}

const NS = { conn: 'urn:x-cast:com.google.cast.tp.connection', hb: 'urn:x-cast:com.google.cast.tp.heartbeat',
  recv: 'urn:x-cast:com.google.cast.receiver', media: 'urn:x-cast:com.google.cast.media' };
const APP_ID = 'CC1AD845';   // Default Media Receiver

class Session {
  constructor(dev, onState) {
    this.dev = dev; this.onState = onState; this.sock = null; this.buf = Buffer.alloc(0);
    this.reqId = 0; this.waiters = new Map(); this.transportId = null; this.sessionId = null;
    this.mediaSessionId = null; this.status = null; this.contentId = ''; this.closed = false; this.timers = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      const s = this.sock = tls.connect({ host: this.dev.host, port: this.dev.port || 8009, rejectUnauthorized: false });
      s.setTimeout(10000, () => { s.destroy(new Error('Time-out bij verbinden met ' + this.dev.name)); });
      s.once('secureConnect', () => {
        s.setTimeout(0);
        this.send(NS.conn, 'receiver-0', { type: 'CONNECT' });
        this.timers.push(setInterval(() => this.send(NS.hb, 'receiver-0', { type: 'PING' }), 5000));
        resolve();
      });
      s.on('data', d => this.onData(d));
      s.on('error', e => { reject(e); this.shutdown(); });
      s.on('close', () => this.shutdown());
    });
  }
  send(ns, dst, obj) { if (this.sock && !this.sock.destroyed) this.sock.write(encode('sender-0', dst, ns, obj)); }
  request(ns, dst, obj, ms = 12000) {
    return new Promise((resolve, reject) => {
      const id = ++this.reqId; const t = setTimeout(() => { this.waiters.delete(id); reject(new Error('Geen antwoord van de tv')); }, ms);
      this.waiters.set(id, m => { clearTimeout(t); resolve(m); });
      this.send(ns, dst, { ...obj, requestId: id });
    });
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32BE(0); if (len > 1 << 22) { this.sock.destroy(); return; }
      if (this.buf.length < 4 + len) break;
      const m = decode(this.buf.subarray(4, 4 + len)); this.buf = this.buf.subarray(4 + len);
      let o; try { o = JSON.parse(m.payload || '{}'); } catch { continue; }
      this.onMessage(m, o);
    }
  }
  onMessage(m, o) {
    if (m.ns === NS.hb) { if (o.type === 'PING') this.send(NS.hb, m.src, { type: 'PONG' }); return; }
    if (m.ns === NS.conn && o.type === 'CLOSE') { this.shutdown(); return; }
    if (m.ns === NS.recv && o.type === 'RECEIVER_STATUS') this.onReceiver(o.status);
    if (m.ns === NS.media && o.type === 'MEDIA_STATUS') this.onMedia(o);
    if (o.requestId && this.waiters.has(o.requestId)) { const w = this.waiters.get(o.requestId); this.waiters.delete(o.requestId); w(o); }
  }
  onReceiver(st) {
    const app = st && (st.applications || []).find(a => a.appId === APP_ID);
    if (app) { this.transportId = app.transportId; this.sessionId = app.sessionId; }
    else if (this.transportId) { this.transportId = null; this.sessionId = null; this.mediaSessionId = null; this.emit(); }
  }
  onMedia(o) {
    const st = (o.status || [])[0]; if (!st) return;
    this.mediaSessionId = st.mediaSessionId; this.status = st;
    if (st.media && st.media.contentId) this.contentId = st.media.contentId;
    this.emit();
  }
  /** Zorg dat de standaard mediaspeler draait op de tv en verbind ermee. */
  async ensureApp() {
    if (this.transportId) return;
    let r = await this.request(NS.recv, 'receiver-0', { type: 'GET_STATUS' });
    let app = r.status && (r.status.applications || []).find(a => a.appId === APP_ID);
    if (!app) {
      r = await this.request(NS.recv, 'receiver-0', { type: 'LAUNCH', appId: APP_ID }, 20000);
      if (r.type === 'LAUNCH_ERROR') throw new Error('Kon de mediaspeler op de tv niet starten');
      app = r.status && (r.status.applications || []).find(a => a.appId === APP_ID);
    }
    if (!app) throw new Error('Kon de mediaspeler op de tv niet starten');
    this.transportId = app.transportId; this.sessionId = app.sessionId;
    this.send(NS.conn, this.transportId, { type: 'CONNECT' });
    if (!this.poll) this.timers.push(this.poll = setInterval(() => { if (this.transportId) this.send(NS.media, this.transportId, { type: 'GET_STATUS', requestId: ++this.reqId }); }, 1500));
  }
  async load(o) {
    await this.ensureApp();
    const live = !!o.live;
    const meta = { type: 0, metadataType: live ? 0 : 1, title: o.title || '' };
    if (o.poster && /^https?:/i.test(o.poster)) meta.images = [{ url: o.poster }];
    this.contentId = o.url; this.status = null; this.mediaSessionId = null;
    const r = await this.request(NS.media, this.transportId, {
      type: 'LOAD', sessionId: this.sessionId, autoplay: true, currentTime: live ? 0 : Math.max(0, (o.position || 0) / 1000),
      media: { contentId: o.url, contentType: o.contentType || 'video/mp4', streamType: live ? 'LIVE' : 'BUFFERED', metadata: meta },
    }, 30000);
    if (r.type === 'LOAD_FAILED' || r.type === 'INVALID_REQUEST') throw new Error('De tv kan deze stream niet afspelen');
  }
  control(action, ms) {
    if (!this.transportId) return;
    const base = { mediaSessionId: this.mediaSessionId, requestId: ++this.reqId };
    const st = this.status || {};
    const send = o => { if (this.mediaSessionId != null) this.send(NS.media, this.transportId, { ...base, ...o }); };
    switch (action) {
      case 'toggle': send({ type: st.playerState === 'PLAYING' ? 'PAUSE' : 'PLAY' }); break;
      case 'play': send({ type: 'PLAY' }); break;
      case 'pause': send({ type: 'PAUSE' }); break;
      case 'stop': send({ type: 'STOP' }); break;
      case 'seek': send({ type: 'SEEK', currentTime: Math.max(0, ms / 1000) }); break;
      case 'seekBy': send({ type: 'SEEK', currentTime: Math.max(0, (st.currentTime || 0) + ms / 1000) }); break;
      default: break;
    }
  }
  emit() {
    const st = this.status || {};
    const state = { PLAYING: 'playing', PAUSED: 'paused', BUFFERING: 'buffering', LOADING: 'buffering' }[st.playerState] || 'idle';
    this.onState({
      connected: !this.closed, name: this.dev.name, state,
      finished: st.playerState === 'IDLE' && st.idleReason === 'FINISHED',
      pos: Math.round((st.currentTime || 0) * 1000), dur: Math.round(((st.media && st.media.duration) || 0) * 1000), url: this.contentId,
    });
  }
  /** Netjes afmelden: mediaspeler op de tv stoppen en verbinding sluiten. */
  disconnect() {
    try { if (this.sessionId) this.send(NS.recv, 'receiver-0', { type: 'STOP', sessionId: this.sessionId, requestId: ++this.reqId }); } catch {}
    setTimeout(() => this.shutdown(), 150);
  }
  shutdown() {
    if (this.closed) return; this.closed = true;
    this.timers.forEach(clearInterval); this.timers = [];
    for (const w of this.waiters.values()) { try { w({ type: 'CLOSED' }); } catch {} } this.waiters.clear();
    try { this.sock && this.sock.destroy(); } catch {}
    this.onState({ connected: false });
  }
}

let cur = null, listener = () => {};
function onState(fn) { listener = fn || (() => {}); }
/** Start (of vervang) het afspelen op een apparaat: o = {host,port,name,url,title,poster,live,position,contentType} */
async function start(o) {
  if (!o || !o.host) throw new Error('Geen apparaat gekozen');
  if (cur && !cur.closed && (cur.dev.host !== o.host || cur.dev.port !== (o.port || 8009))) { const old = cur; cur = null; old.disconnect(); }
  if (!cur || cur.closed) {
    const s = cur = new Session({ host: o.host, port: o.port || 8009, name: o.name || o.host }, st => { if (cur === s) listener(st); });
    await s.connect();
  }
  await cur.load(o);
  cur.emit();
}
function control(action, ms) {
  if (!cur || cur.closed) return;
  if (action === 'disconnect') { cur.disconnect(); cur = null; listener({ connected: false }); return; }
  cur.control(action, ms || 0);
}
const state = () => (cur && !cur.closed ? { connected: true, name: cur.dev.name } : { connected: false });

module.exports = { scan, start, control, onState, state, _t: { buildQuery, parseDns, toDevices, encode, decode, Session } };
