/* Kijkdoos — IPTV voor Android, Windows en de browser.
 * Bronnen: gratis (iptv-org, Internet Archive) + eigen abonnementen (Xtream Codes / M3U).
 * Alleen streams die echt beschikbaar zijn worden getoond (tenzij je dat uitzet).
 */
'use strict';

// ---------- Omgeving ----------
const ENV = (() => {
  const cap = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const electron = /Electron/i.test(navigator.userAgent);
  const v = document.createElement('video');
  const nativeHls = !!v.canPlayType('application/vnd.apple.mpegurl');
  const tvUA = /\b(Android ?TV|GoogleTV|AFT\w*|BRAVIA|SHIELD|Tizen|Web0S|SMART-?TV|HbbTV|CrKey)\b/i.test(navigator.userAgent)
    || (cap && matchMedia('(any-pointer:none)').matches);
  return { cap, electron, native: cap || electron, nativeHls, tvUA, https: location.protocol === 'https:' };
})();

// ---------- Opslag ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem('kd.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kd.' + k, JSON.stringify(v)); } catch {} },
};

const BUILTIN = [
  { id: 'iptv-movies', name: 'iptv-org · Filmkanalen', desc: 'Gratis live filmkanalen wereldwijd', type: 'm3u', tab: 'film', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u', on: true },
  { id: 'iptv-series', name: 'iptv-org · Seriekanalen', desc: 'Gratis live seriekanalen wereldwijd', type: 'm3u', tab: 'series', url: 'https://iptv-org.github.io/iptv/categories/series.m3u', on: true },
  { id: 'iptv-classic', name: 'iptv-org · Klassiekers', desc: 'Kanalen met klassieke films en tv', type: 'm3u', tab: 'film', url: 'https://iptv-org.github.io/iptv/categories/classic.m3u', on: true },
  { id: 'iptv-animation', name: 'iptv-org · Animatie', desc: 'Tekenfilm- en animatiekanalen', type: 'm3u', tab: 'series', url: 'https://iptv-org.github.io/iptv/categories/animation.m3u', on: true },
  { id: 'iptv-nl', name: 'iptv-org · Nederland', desc: 'Gratis Nederlandse zenders (Live TV)', type: 'm3u', tab: 'live', url: 'https://iptv-org.github.io/iptv/countries/nl.m3u', on: true },
  { id: 'iptv-be', name: 'iptv-org · België', desc: 'Gratis Belgische zenders (Live TV)', type: 'm3u', tab: 'live', url: 'https://iptv-org.github.io/iptv/countries/be.m3u', on: false },
  { id: 'archive-films', name: 'Internet Archive · Films', desc: 'Duizenden rechtenvrije speelfilms (on demand)', type: 'archive', tab: 'film', on: true },
  { id: 'archive-tv', name: 'Internet Archive · Series', desc: 'Klassieke tv-series en tekenfilms (on demand)', type: 'archive', tab: 'series', on: true },
];

const ARCHIVE_ROWS = {
  film: [
    ['Populaire klassiekers', 'collection:feature_films AND mediatype:movies'],
    ['Sciencefiction & horror', 'collection:SciFi_Horror'],
    ['Film noir', 'collection:film_noir'],
    ['Comedy', 'collection:feature_films AND subject:comedy'],
    ['Western', 'collection:feature_films AND subject:western'],
    ['Stomme films', 'collection:silent_films'],
  ],
  series: [
    ['Klassieke tv-series', 'collection:classic_tv'],
    ['Klassieke tekenfilms', 'collection:classic_cartoons'],
    ['Tv-comedy', 'collection:classic_tv AND subject:comedy'],
    ['Tv-western', 'collection:classic_tv AND subject:western'],
  ],
};

const state = {
  tab: 'film',
  q: '',
  settings: LS.get('settings', { scan: false, proxy: '', builtin: {}, langs: [] }),
  subs: LS.get('subs', []),
  rows: [],                            // {id, tab, title, items:[], more?:fn, src}
  subStatus: {},                       // sub.id -> {ok, msg}
};
if (!Array.isArray(state.settings.langs)) state.settings.langs = [];
if (!('scan' in state.settings)) state.settings.scan = false;
state.settings.cache = Object.assign({ on: false, ttl: 6 * 3600e3 }, state.settings.cache || {});
state.settings.grid = Object.assign({ sort: 'pop', decade: '', rating: 0 }, state.settings.grid || {});
if (!('omdbKey' in state.settings)) state.settings.omdbKey = '';
if (!('osKey' in state.settings)) state.settings.osKey = '';
if (!('builtin' in state.settings)) state.settings.builtin = 'mpv';
if (!('catchupExt' in state.settings)) state.settings.catchupExt = 'm3u8';
// OpenSubtitles staat standaard UIT (kwam in de weg van de eigen audio/ondertitels van de stream); wie het wil kiest 'fallback' in ⚙
if (!state.settings.osMigrated2) { state.settings.osMode = 'fallback'; state.settings.osMigrated = state.settings.osMigrated2 = true; }
if (!('osMode' in state.settings)) state.settings.osMode = 'fallback';
const OS_DEFAULT_KEY = 'EYlvVF78m17dj1WcoRSVKCU0p4FxIMHa'; // standaard-sleutel; eigen sleutel in ⚙ gaat voor
const osKeyVal = () => state.settings.osKey || OS_DEFAULT_KEY;
if (state.settings.langs.length) setTimeout(() => applyIptvLangs(), 0);
if (!state.settings.tvMode) state.settings.tvMode = 'auto';
if (!state.settings.tvScale) state.settings.tvScale = 1;
state.settings.ext = Object.assign({ always: false, app: 'chooser', pkg: '', winPath: '', winArgs: '' }, state.settings.ext || {});
for (const b of BUILTIN) if (!(b.id in state.settings.builtin)) state.settings.builtin[b.id] = b.on;

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const saveSettings = () => LS.set('settings', state.settings);
const saveSubs = () => LS.set('subs', state.subs);
try { localStorage.removeItem('kd.avail'); } catch {} // oude cache opruimen

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}

// ---------- Talen ----------
// code: [Nederlandse naam, ...aliassen (ISO 639-2, Engelse/eigen naam)]
const LANGS = {
  nl: ['Nederlands', 'dut', 'nld', 'dutch', 'nederlands', 'vlaams', 'flemish'],
  en: ['Engels', 'eng', 'english'],
  de: ['Duits', 'ger', 'deu', 'german', 'deutsch'],
  fr: ['Frans', 'fre', 'fra', 'french', 'français', 'francais'],
  es: ['Spaans', 'spa', 'spanish', 'español', 'espanol', 'castellano', 'latino'],
  it: ['Italiaans', 'ita', 'italian', 'italiano'],
  pt: ['Portugees', 'por', 'portuguese', 'português', 'portugues'],
  tr: ['Turks', 'tur', 'turkish', 'türkçe', 'turkce'],
  ar: ['Arabisch', 'ara', 'arabic', 'عربي'],
  ru: ['Russisch', 'rus', 'russian', 'русский'],
  pl: ['Pools', 'pol', 'polish', 'polski'],
  uk: ['Oekraïens', 'ukr', 'ukrainian'],
  ro: ['Roemeens', 'rum', 'ron', 'romanian', 'română'],
  hu: ['Hongaars', 'hun', 'hungarian', 'magyar'],
  cs: ['Tsjechisch', 'cze', 'ces', 'czech'],
  el: ['Grieks', 'gre', 'ell', 'greek'],
  sv: ['Zweeds', 'swe', 'swedish', 'svenska'],
  da: ['Deens', 'dan', 'danish', 'dansk'],
  no: ['Noors', 'nor', 'nob', 'norwegian', 'norsk'],
  fi: ['Fins', 'fin', 'finnish', 'suomi'],
  sr: ['Servisch', 'srp', 'serbian'],
  hr: ['Kroatisch', 'hrv', 'croatian'],
  bg: ['Bulgaars', 'bul', 'bulgarian'],
  sq: ['Albanees', 'alb', 'sqi', 'albanian'],
  fa: ['Perzisch', 'per', 'fas', 'persian', 'farsi'],
  he: ['Hebreeuws', 'heb', 'hebrew'],
  hi: ['Hindi', 'hin', 'hindi'],
  ur: ['Urdu', 'urd', 'urdu'],
  bn: ['Bengaals', 'ben', 'bengali', 'bangla'],
  ta: ['Tamil', 'tam', 'tamil'],
  zh: ['Chinees', 'chi', 'zho', 'chinese', 'mandarin', 'cantonese'],
  ja: ['Japans', 'jpn', 'japanese'],
  ko: ['Koreaans', 'kor', 'korean'],
  th: ['Thai', 'tha', 'thai'],
  vi: ['Vietnamees', 'vie', 'vietnamese'],
  id: ['Indonesisch', 'ind', 'indonesian', 'bahasa'],
  ms: ['Maleis', 'may', 'msa', 'malay'],
  tl: ['Filipijns', 'tgl', 'fil', 'tagalog', 'filipino'],
  zz: ['Geen (stom)', 'zxx', 'silent', 'no linguistic content'],
};
const LANG_ALIAS = new Map();
for (const [code, [name, ...al]] of Object.entries(LANGS)) [code, name.toLowerCase(), ...al].forEach(a => LANG_ALIAS.set(a, code));
// landcode -> taal (voor "NL | Films", "UK: Sky", tvg-id "NPO1.nl")
const COUNTRY_LANG = { nl: 'nl', be: 'nl', uk: 'en', gb: 'en', us: 'en', usa: 'en', ca: 'en', au: 'en', ie: 'en', nz: 'en', en: 'en',
  de: 'de', at: 'de', fr: 'fr', es: 'es', mx: 'es', ar: 'es', co: 'es', cl: 'es', it: 'it', pt: 'pt', br: 'pt', tr: 'tr',
  ru: 'ru', pl: 'pl', ua: 'uk', ro: 'ro', hu: 'hu', cz: 'cs', gr: 'el', se: 'sv', dk: 'da', no: 'no', fi: 'fi', rs: 'sr',
  hr: 'hr', bg: 'bg', al: 'sq', ir: 'fa', il: 'he', in: 'hi', pk: 'ur', cn: 'zh', hk: 'zh', tw: 'zh', jp: 'ja', kr: 'ko',
  th: 'th', vn: 'vi', id: 'id', my: 'ms', ph: 'tl', sa: 'ar', ae: 'ar', eg: 'ar', ma: 'ar', dz: 'ar', iq: 'ar', qa: 'ar' };
const langName = c => (c === 'und' ? 'Onbekend' : (LANGS[c] || [c])[0]);
const normLang = v => { const k = String(v || '').trim().toLowerCase(); return LANG_ALIAS.get(k) || LANG_ALIAS.get(k.slice(0, 3)) || null; };
const uniq = a => [...new Set(a.filter(Boolean))];
/** Taal afleiden uit een label als "NL | Films", "[DE] Kino", "|UK| Sky", "Dutch Movies" */
function labelLangs(...labels) {
  for (const l of labels) {
    if (!l) continue;
    const m = String(l).match(/^\s*[\[|(]?\s*([A-Za-z]{2,3})\s*[\]|):\-–•]/) || String(l).match(/[|\[]\s*([A-Z]{2,3})\s*[|\]]/);
    if (m) { const c = COUNTRY_LANG[m[1].toLowerCase()] || normLang(m[1]); if (c && m[1].length >= 2) return [c]; }
    const words = String(l).toLowerCase().split(/[^\p{L}]+/u);
    const hit = uniq(words.filter(w => w.length > 3).map(w => LANG_ALIAS.get(w)));
    if (hit.length) return hit;
  }
  return [];
}
function entryLangs(e) {
  const tl = e.attrs['tvg-language'];
  if (tl) { const l = uniq(tl.split(/[;,]/).map(normLang)); if (l.length) return l; }
  const fromLabel = labelLangs(e.attrs['group-title'], e.name);
  if (fromLabel.length) return fromLabel;
  const cc = (e.attrs['tvg-id'] || '').match(/\.([a-z]{2})(@|$)/i);
  if (cc && COUNTRY_LANG[cc[1].toLowerCase()]) return [COUNTRY_LANG[cc[1].toLowerCase()]];
  return ['und'];
}

// ---------- Netwerk ----------
const px = url => (!ENV.native && state.settings.proxy ? state.settings.proxy + encodeURIComponent(url) : url);
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

async function http(url, { type = 'text', timeout = 20000, headers } = {}) {
  const r = await withTimeout(fetch(px(url), { headers, cache: 'no-store' }), timeout);
  if (!r.ok && r.status !== 206) throw new Error('HTTP ' + r.status);
  return type === 'json' ? r.json() : r.text();
}

// ---------- Cache (optioneel, IndexedDB) ----------
const IDB = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const r = indexedDB.open('kijkdoos', 2);
    r.onupgradeneeded = () => ['http', 'avail', 'omdb', 'dl'].forEach(n => r.result.objectStoreNames.contains(n) || r.result.createObjectStore(n));
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (store, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => { const t = db.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); });
  };
  return {
    get: (st, k) => run(st, 'readonly', o => o.get(k)).catch(() => undefined),
    set: (st, k, v) => run(st, 'readwrite', o => o.put(v, k)).catch(() => {}),
    clear: st => run(st, 'readwrite', o => o.clear()).catch(() => {}),
    entries: async st => { try { const db = await open(); return await new Promise(res => { const out = [], c = db.transaction(st).objectStore(st).openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out.push([cur.key, cur.value]); cur.continue(); } else res(out); }; c.onerror = () => res(out); }); } catch { return []; } },
  };
})();
const cacheOn = () => !!state.settings.cache.on;
const cacheTTL = () => +state.settings.cache.ttl || 6 * 3600e3;
/** Index ophalen (playlists, catalogus); met cache aan eerst uit de cache. */
async function httpIndex(url, opts = {}) {
  const key = (opts.type || 'text') + ':' + url;
  if (cacheOn()) { const c = await IDB.get('http', key); if (c && Date.now() - c.t < cacheTTL()) return c.v; }
  const v = await http(url, opts);
  if (cacheOn()) IDB.set('http', key, { v, t: Date.now() });
  return v;
}

const isHls = url => /\.m3u8(\?|$)/i.test(url) || /\/live\/[^/]+\/[^/]+\/\d+$/.test(url);
const mixedBlocked = url => ENV.https && !ENV.native && /^http:/i.test(url) && !state.settings.proxy;

/** Controleer of een stream werkt. ok = afspeelbaar, reach = server antwoordt (zonder CORS), dead = kapot */
async function probe(url) {
  if (mixedBlocked(url)) return 'dead';
  const hls = isHls(url);
  try {
    const r = await withTimeout(fetch(px(url), { headers: hls ? {} : { Range: 'bytes=0-1023' }, cache: 'no-store' }), 9000);
    if (!r.ok && r.status !== 206) return 'dead';
    if (hls) {
      const txt = await withTimeout(r.text(), 6000);
      return txt.includes('#EXT') ? 'ok' : 'dead';
    }
    try { r.body && r.body.cancel(); } catch {}
    return 'ok';
  } catch (e) {
    if (ENV.native || e.message === 'timeout') return 'dead';
    try { // CORS geweigerd? Kijk of de server überhaupt reageert.
      await withTimeout(fetch(url, { mode: 'no-cors', cache: 'no-store' }), 7000);
      return 'reach';
    } catch { return 'dead'; }
  }
}

function playableStatus(s, url) {
  if (s === 'ok') return true;
  if (s === 'reach') return !isHls(url) || ENV.nativeHls; // native speler heeft geen CORS nodig
  return false;
}

// ---------- Item-beschikbaarheid ----------
// Realtime: alleen kaarten die in beeld zijn worden gecontroleerd, en niets wordt op het apparaat bewaard.
const avail = new Map();            // statusKey -> {s, t}; alleen tijdens deze sessie
const FRESH = 10 * 60e3;            // na 10 minuten opnieuw controleren
function setStatus(key, s) { const v = { s, t: Date.now() }; avail.set(key, v); if (cacheOn()) IDB.set('avail', key, v); }
/** status van een item: 'ok' | 'dead' | null (nog onbekend) */
function itemStatus(it) {
  if (it.status) return it.status;
  const a = it.statusKey && avail.get(it.statusKey);
  if (a && Date.now() - a.t < (cacheOn() ? cacheTTL() : FRESH)) return playableStatus(a.s, it.url || '') ? 'ok' : 'dead';
  return null;
}
const scanOn = () => !!state.settings.scan;
const visible = it => !scanOn() || itemStatus(it) !== 'dead';

// Wachtrij: nieuwste (zojuist in beeld) eerst, max 4 tegelijk
const queue = { list: [], running: 0, max: 4, queued: new Set() };
function enqueue(it) {
  if (!scanOn() || !it.check || itemStatus(it) || queue.queued.has(it.uid)) return;
  queue.queued.add(it.uid); queue.list.unshift(it); pump();
}
function dequeue(it) {
  if (!queue.queued.has(it.uid) || it._running) return;
  queue.queued.delete(it.uid); queue.list = queue.list.filter(x => x !== it); updateStatus();
}
function clearQueue() { for (const it of queue.list) queue.queued.delete(it.uid); queue.list = []; updateStatus(); }
function pump() {
  while (queue.running < queue.max && queue.list.length) {
    const it = queue.list.shift(); queue.running++; it._running = true;
    it.check().catch(() => 'dead').then(s => { if (it.statusKey) setStatus(it.statusKey, s); else it.status = s; })
      .finally(() => { it._running = false; queue.running--; queue.queued.delete(it.uid); onStatus(it); pump(); });
  }
  updateStatus();
}
function updateStatus() {
  const n = queue.running + queue.list.length, parts = [];
  if (loaders.size) parts.push('Index laden…');
  if (n) parts.push(`${n} in beeld controleren`);
  $('#status').innerHTML = parts.length ? '<span class="dot"></span>' + parts.join(' · ') : '';
}

// ---------- M3U ----------
function parseM3U(text) {
  const out = []; let cur = null;
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      cur = { attrs: {}, opts: false };
      const re = /([\w-]+)="([^"]*)"/g; let m, lastEnd = 0;
      while ((m = re.exec(line))) { cur.attrs[m[1].toLowerCase()] = m[2]; lastEnd = re.lastIndex; }
      const comma = line.indexOf(',', lastEnd || line.indexOf(':'));
      cur.name = (comma >= 0 ? line.slice(comma + 1) : '').trim();
    } else if (line.startsWith('#EXTVLCOPT') || line.startsWith('#KODIPROP')) {
      if (cur && /http-(referrer|user-agent)|license/i.test(line)) cur.opts = true;
    } else if (line.startsWith('#EXTGRP:')) {
      if (cur) cur.attrs['group-title'] = cur.attrs['group-title'] || line.slice(8).trim();
    } else if (!line.startsWith('#') && cur) {
      cur.url = line; out.push(cur); cur = null;
    }
  }
  return out;
}

const cleanName = n => n.replace(/\s*\((\d{3,4}p|geo-blocked|not 24\/7)\)/gi, '').replace(/\s*\[[^\]]*\]\s*$/,'').trim();

function classify(e) {
  const g = (e.attrs['group-title'] || '') + ' ' + (e.attrs['tvg-type'] || '');
  if (/\/movie\//i.test(e.url) || /\b(vod|films?|movies?|cinema|bioscoop)\b/i.test(g)) return 'film';
  if (/\/series\//i.test(e.url) || /\b(series?|shows?|seizoen|season)\b/i.test(g)) return 'series';
  return 'live';
}

const yearFrom = n => { const m = String(n || '').match(/\b(19\d{2}|20[0-4]\d)\b/); return m ? +m[1] : ''; };
const num = v => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; };
/** titel zonder taal-/kwaliteitslabels en jaartal, voor het opzoeken van beoordelingen */
const cleanTitle = t => String(t || '').replace(/^\s*[\[(|]?\s*[A-Za-z]{2,3}\s*[\])|:\-–•]\s*/, '').replace(/\((19|20)\d{2}\)|\b(19|20)\d{2}\b/g, '')
  .replace(/\b(4k|uhd|fhd|hd|sd|1080p|720p|multi|sub|dub|nl ?sub)\b/gi, '').replace(/[\[\]()|]+/g, ' ').replace(/\s+/g, ' ').trim();

let uidN = 0;
const uid = () => 'i' + (++uidN);

function liveItem(e, tab, src, srcName) {
  const url = e.url;
  return {
    uid: uid(), kind: 'live', tab, src, srcName, title: cleanName(e.name) || 'Kanaal',
    poster: e.attrs['tvg-logo'] || '', logo: true, url, statusKey: url,
    group: e.attrs['group-title'] || '', langs: entryLangs(e),
    check: e.opts && !ENV.native ? async () => 'dead' : () => probe(url),
  };
}

// ---------- Bronnen laden ----------
const loaders = new Set();
async function track(name, fn) { loaders.add(name); updateStatus(); try { return await fn(); } finally { loaders.delete(name); updateStatus(); } }

// ---------- Onthouden waar je gebleven bent ----------
let posMap = LS.get('pos', {});
const fmtT = t => { t = Math.max(0, Math.round(t)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
/** Opgeslagen tijd (sec) om te hervatten, of 0 als er niets (zinnigs) is. */
function getPos(key) {
  const p = key && posMap[key]; if (!p || p.t < 15) return 0;
  if (p.d && p.t > p.d - Math.max(45, p.d * 0.03)) return 0;   // bijna uit = uitgekeken
  return p.t;
}
function savePos(key, t, d) {
  if (!key || !isFinite(t)) return;
  if (t < 15 || (d && t > d - Math.max(45, d * 0.03))) { if (posMap[key]) { delete posMap[key]; LS.set('pos', posMap); } return; }
  posMap[key] = { t: Math.round(t), d: d && isFinite(d) ? Math.round(d) : 0, at: Date.now() };
  const keys = Object.keys(posMap);
  if (keys.length > 400) for (const k of keys.sort((a, b) => posMap[a].at - posMap[b].at).slice(0, keys.length - 400)) delete posMap[k];
  LS.set('pos', posMap);
}
function clearPos(key) { if (key && posMap[key]) { delete posMap[key]; LS.set('pos', posMap); } }

// ---------- Laatst gekeken ----------
const HIST_MAX = 60;
let histList = LS.get('hist', []);
const histKey = it => [it.kind, it.src, it.title].join('|');
const hashStr = t => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
function noteWatched(it) {
  if (!it || !it.title || !it.kind || it.kind === 'catchup') return;
  const snap = {};
  for (const [k, v] of Object.entries(it)) if (typeof v !== 'function' && k !== 'uid' && k !== 'check') snap[k] = v;
  if (snap.desc) snap.desc = String(snap.desc).slice(0, 400);
  snap.watchedAt = Date.now();
  histList = [snap, ...histList.filter(h => histKey(h) !== histKey(snap))].slice(0, HIST_MAX);
  LS.set('hist', histList);
  refreshHist();
}
function refreshHist() {
  for (const [kind, title] of [['film', 'Laatst bekeken films'], ['series', 'Laatst bekeken series'], ['live', 'Laatst bekeken zenders']]) {
    const items = histList.filter(h => h.kind === kind).map(h => ({ ...h, uid: 'h' + hashStr(histKey(h)), tab: 'hist' }));
    addRow({ id: 'hist-' + kind, tab: 'hist', title, items, src: 'hist' });
  }
}
// ---------- Downloads (offline kijken) ----------
let dlList = LS.get('dl', []).map(d => (d.status === 'busy' || d.status === 'queued') ? { ...d, status: 'part' } : d);
const dlMeta = new Map();          // url -> { it, title, season, ep } (voor de knoppen)
const dlId = url => 'd' + hashStr(url);
const dlBy = url => dlList.find(d => d.url === url);
const dlDone = url => { const d = dlBy(url); return d && d.status === 'done' ? d : null; };
const saveDl = () => LS.set('dl', dlList);
const fmtB = n => !n ? '' : n > 1e9 ? (n / 1e9).toFixed(2) + ' GB' : (n / 1e6).toFixed(n > 1e8 ? 0 : 1) + ' MB';
const dlable = (url, it) => !!url && !(it && (it.kind === 'live' || it.kind === 'catchup')) && !isHls(url);

/** Opslag per platform: Windows = map op schijf, Android = app-map, browser = IndexedDB. */
let _dlb = null;
function dlb() {
  if (_dlb) return _dlb;
  if (ENV.electron && window.kdNative && window.kdNative.download) {
    const subs = new Map(); window.kdNative.onDownloadProgress(d => { const f = subs.get(d.id); if (f) f(d.got, d.total); });
    return _dlb = {
      folder: () => window.kdNative.openDownloads(),
      start: (e, on) => { subs.set(e.id, on); return window.kdNative.download({ id: e.id, url: e.url }).then(r => { subs.delete(e.id); if (!r.ok) throw Object.assign(new Error(r.msg), { paused: r.canceled }); return { ref: r.path, size: r.size }; }); },
      pause: e => window.kdNative.pauseDownload(e.id), remove: e => window.kdNative.removeDownload(e.id),
      src: e => encodeURI('file:///' + e.ref.replace(/\\/g, '/')), ext: e => e.ref,
    };
  }
  const plug = ENV.cap ? extPlugin() : null;
  if (plug) {
    const hs = new Map();
    plug.addListener('dlprogress', ev => {
      const h = hs.get(ev.id); if (!h) return;
      if (ev.done) h.res({ ref: ev.path, size: ev.total || ev.got });
      else if (ev.error) h.rej(new Error(ev.error));
      else if (ev.paused) h.rej(Object.assign(new Error('gepauzeerd'), { paused: true }));
      else h.on(ev.got, ev.total);
    });
    return _dlb = {
      start: (e, on) => new Promise((res, rej) => { hs.set(e.id, { res, rej, on }); plug.download({ id: e.id, url: e.url }).catch(rej); }).finally(() => hs.delete(e.id)),
      pause: e => plug.pauseDownload({ id: e.id }), remove: e => plug.removeDownload({ id: e.id }),
      src: e => window.Capacitor.convertFileSrc('file://' + e.ref), ext: e => 'file://' + e.ref,
    };
  }
  // gewone browser: bestand in IndexedDB (alleen kleine/medium bestanden verstandig; vereist CORS of proxy)
  const urls = new Map(), acs = new Map();
  return _dlb = {
    web: true,
    start: async (e, on) => {
      const ac = new AbortController(); acs.set(e.id, ac);
      try {
        const r = await fetch(px(e.url), { signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status);
        const total = +r.headers.get('content-length') || 0, chunks = []; let got = 0;
        const rd = r.body.getReader();
        for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); got += value.length; on(got, total); }
        const blob = new Blob(chunks, { type: r.headers.get('content-type') || 'video/mp4' });
        await IDB.set('dl', e.id, blob); urls.set(e.id, URL.createObjectURL(blob));
        return { ref: e.id, size: blob.size };
      } catch (err) { throw Object.assign(err, { paused: ac.signal.aborted }); } finally { acs.delete(e.id); }
    },
    pause: e => { const a = acs.get(e.id); if (a) a.abort(); }, remove: e => { urls.delete(e.id); return IDB.clear && IDB.set('dl', e.id, undefined); },
    src: e => urls.get(e.id) || '', ext: () => '',
    prepare: async e => { if (!urls.has(e.id)) { const b = await IDB.get('dl', e.id); if (b) urls.set(e.id, URL.createObjectURL(b)); } },
  };
}
/** Afspeel-URL van een gedownload bestand (of null → gewoon streamen). */
function dlSrc(url) { const d = dlDone(url); if (!d) return null; try { return dlb().src(d) || null; } catch { return null; } }
function dlExt(url) { const d = dlDone(url); if (!d) return url; try { return dlb().ext(d) || url; } catch { return url; } }

let dlRunning = null;
function dlEnqueue(urls) {
  let n = 0;
  for (const url of urls) {
    const m = dlMeta.get(url); if (!m || !dlable(url, m.it)) continue;
    let d = dlBy(url);
    if (d && (d.status === 'done' || d.status === 'busy' || d.status === 'queued')) continue;
    if (!d) {
      const it = m.it || {};
      d = { id: dlId(url), url, title: m.title, it: { kind: it.kind, title: it.title, year: it.year, poster: it.poster, langs: it.langs, src: it.src }, season: m.season, ep: m.ep, poster: it.poster, at: Date.now() };
      dlList.unshift(d);
    }
    d.status = 'queued'; d.err = ''; n++;
  }
  saveDl(); dlUI(); dlPump();
  return n;
}
async function dlPump() {
  if (dlRunning) return;
  const e = dlList.slice().reverse().find(d => d.status === 'queued'); if (!e) return;
  dlRunning = e; e.status = 'busy'; e.got = e.got || 0; dlUI();
  try {
    const r = await dlb().start(e, (g, t) => { e.got = g; e.total = t; dlUI(true); });
    e.status = 'done'; e.ref = r.ref; e.size = r.size; e.got = e.total = r.size;
    toast('Offline beschikbaar: ' + e.title, 3000);
  } catch (err) {
    e.status = err && err.paused ? 'part' : 'error'; e.err = (err && err.message) || '';
    if (e.status === 'error') toast('Download mislukt: ' + e.title + (e.err ? ' (' + e.err + ')' : ''), 4000);
  } finally { dlRunning = null; saveDl(); dlUI(); dlPump(); }
}
function dlPause(url) { const d = dlBy(url); if (!d) return; if (d.status === 'queued') { d.status = 'part'; saveDl(); dlUI(); } else if (d.status === 'busy') dlb().pause(d); }
function dlRemove(url) {
  const d = dlBy(url); if (!d) return;
  if (d.status === 'busy') dlb().pause(d);
  try { dlb().remove(d); } catch {}
  dlList = dlList.filter(x => x !== d); saveDl(); dlUI();
}
const dlPct = d => d.total ? Math.min(99, Math.floor(d.got / d.total * 100)) : 0;
function dlLabel(d, long) {
  if (!d) return long ? '⬇ Downloaden' : '⬇';
  if (d.status === 'done') return long ? '✔ Offline (verwijderen)' : '✔';
  if (d.status === 'queued') return long ? '⏳ In wachtrij (stop)' : '⏳';
  if (d.status === 'busy') return (long ? `⏸ ${dlPct(d)}% (pauzeer)` : dlPct(d) + '%');
  return long ? '⟳ Hervatten' : '⟳';
}
function dlUI(light) {
  for (const b of document.querySelectorAll('[data-dl]')) {
    const d = dlBy(b.dataset.dl), long = b.classList.contains('btn');
    b.textContent = dlLabel(d, long); b.classList.toggle('dl-done', !!d && d.status === 'done'); b.classList.toggle('dl-busy', !!d && d.status === 'busy');
  }
  const act = dlList.filter(d => d.status === 'busy' || d.status === 'queued').length;
  const bd = $('#btnDl'); if (bd) { bd.classList.toggle('active', act > 0); bd.dataset.n = act || ''; }
  if (!$('#dlView').hidden) renderDlView(light);
}
function dlBtnEl(url, title, it, se) {
  dlMeta.set(url, { it, title, season: se && se.season, ep: se && se.ep });
  const b = document.createElement('button'); b.className = 'btn'; b.dataset.dl = url; b.dataset.dlLong = '1';
  b.textContent = dlLabel(dlBy(url), true); if (dlBy(url) && dlBy(url).status === 'done') b.classList.add('dl-done');
  return b;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-dl]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const url = b.dataset.dl, d = dlBy(url);
  if (!d || d.status === 'part' || d.status === 'error') { dlEnqueue([url]); toast('Download gestart — voortgang bij ⬇', 2500); }
  else if (d.status === 'done') { if (confirm('Offline bestand verwijderen?\n' + d.title)) dlRemove(url); }
  else dlPause(url);
}, true);

function renderDlView(light) {
  const box = $('#dlList');
  const total = dlList.filter(d => d.status === 'done').reduce((a, d) => a + (d.size || 0), 0);
  $('#dlInfo').textContent = dlList.length ? `${dlList.length} item${dlList.length === 1 ? '' : 's'} · ${fmtB(total) || '0 MB'} opgeslagen` : 'Nog niets gedownload. Open een film of aflevering en kies ⬇.';
  $('#dlFolder').hidden = !(dlb().folder);
  if (light && box.children.length === dlList.length) { // alleen voortgang bijwerken (geen focus verliezen)
    dlList.forEach((d, i) => { const row = box.children[i]; if (row && row.dataset.url === d.url) { const st = $('.dl-st', row); if (st) st.textContent = dlStatusText(d); const f = $('.dl-fill', row); if (f) f.style.width = (d.status === 'done' ? 100 : dlPct(d)) + '%'; } });
    return;
  }
  box.innerHTML = dlList.map(d => `<div class="dl-row" data-url="${esc(d.url)}">
    ${d.poster ? `<img loading="lazy" src="${esc(d.poster)}" alt="" onerror="this.remove()">` : '<span class="dl-ph">🎞</span>'}
    <div class="dl-main"><div class="dl-t">${esc(d.title)}</div><div class="dl-bar"><div class="dl-fill" style="width:${d.status === 'done' ? 100 : dlPct(d)}%"></div></div><div class="dl-st">${esc(dlStatusText(d))}</div></div>
    <div class="dl-acts">${d.status === 'done' ? `<button class="btn primary" data-dlplay="${esc(d.url)}">▶</button>` : ''}
      ${d.status === 'busy' || d.status === 'queued' ? `<button class="btn" data-dlstop="${esc(d.url)}">⏸</button>` : d.status !== 'done' ? `<button class="btn" data-dlgo="${esc(d.url)}">⟳</button>` : ''}
      <button class="btn" data-dlrm="${esc(d.url)}">🗑</button></div></div>`).join('');
}
function dlStatusText(d) {
  return d.status === 'done' ? '✔ Offline · ' + fmtB(d.size) : d.status === 'busy' ? `Downloaden… ${dlPct(d)}%${d.total ? ' · ' + fmtB(d.got) + ' / ' + fmtB(d.total) : ''}` :
    d.status === 'queued' ? 'In wachtrij' : d.status === 'error' ? 'Mislukt' + (d.err ? ': ' + d.err : '') + ' — tik ⟳ om opnieuw te proberen' : 'Gepauzeerd' + (d.got && d.total ? ` · ${Math.floor(d.got / d.total * 100)}%` : '') + ' — tik ⟳ om te hervatten';
}
$('#btnDl').onclick = () => { rememberFocus('dlView'); renderDlView(); $('#dlView').hidden = false; };
$('#dlFolder').onclick = () => { try { dlb().folder(); } catch {} };
$('#dlList').addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = dlBy(t.dataset.dlplay || t.dataset.dlstop || t.dataset.dlgo || t.dataset.dlrm); if (!d) return;
  if (t.dataset.dlplay) {
    $('#dlView').hidden = true;
    const eps = d.season != null ? [{ url: d.url, season: d.season, ep: d.ep, title: d.title }] : null;
    playAuto(d.url, d.title, d.it, eps, eps ? d.url : null);
  } else if (t.dataset.dlstop) dlPause(d.url);
  else if (t.dataset.dlgo) dlEnqueue([d.url]);
  else if (confirm('Verwijderen?\n' + d.title)) dlRemove(d.url);
});
function dlInit() { if (dlb().web) dlList.filter(d => d.status === 'done').forEach(d => dlb().prepare(d)); dlUI(); }

function addRow(row) {
  state.rows = state.rows.filter(r => r.id !== row.id);
  row.ver = (row.ver || 0) + 1;
  state.rows.push(row);
  scheduleRender();
}

let iptvLangMap = null, iptvLangsApplied = false;
/** Taal-index van iptv-org pas ophalen wanneer je op taal gaat filteren */
function applyIptvLangs() {
  if (iptvLangsApplied) return; iptvLangsApplied = true;
  track('Taal-index', () => iptvLangs()).then(m => {
    for (const r of state.rows) if (r.src.startsWith('iptv-')) for (const it of r.items) { const l = m.get(it.url); if (l) it.langs = uniq(l); }
    viewKey = ''; render();
  });
}
function iptvLangs() {
  if (!iptvLangMap) iptvLangMap = httpIndex('https://iptv-org.github.io/iptv/index.language.m3u', { timeout: 45000 }).then(t => {
    const m = new Map();
    for (const e of parseM3U(t)) { const c = normLang(e.attrs['group-title']); if (!c) continue; if (!m.has(e.url)) m.set(e.url, []); m.get(e.url).push(c); }
    return m;
  }).catch(() => new Map());
  return iptvLangMap;
}
async function loadBuiltinM3U(b) {
  const entries = parseM3U(await httpIndex(b.url));
  const items = entries.map(e => liveItem(e, b.tab, b.id, b.name));
  if (iptvLangsApplied) iptvLangs().then(m => items.forEach(it => { const l = m.get(it.url); if (l) it.langs = uniq(l); }));
  const title = { film: 'Live filmkanalen', series: 'Live seriekanalen', live: 'Gratis zenders' }[b.tab];
  addRow({ id: b.id, tab: b.tab, title: `${title} · ${b.name.split('· ')[1]}`, items, src: b.id });
}

// Internet Archive
function archiveLangQuery() {
  const sel = (state.settings.langs || []).filter(c => LANGS[c]);
  if (!sel.length) return '';
  const terms = uniq(sel.flatMap(c => [c, ...LANGS[c]].map(t => /\s/.test(t) ? `"${t}"` : t)));
  return ` AND language:(${terms.join(' OR ')})`;
}
const IA_FIELDS = ['identifier', 'title', 'year', 'language', 'downloads', 'avg_rating', 'num_reviews', 'subject'];
const IA_PAGE = 100;
const archiveQuery = q => `(${q}) AND mediatype:movies AND NOT access-restricted-item:true${archiveLangQuery()}`;
function archiveSearchURL(q, page) {
  const p = new URLSearchParams({ q: archiveQuery(q), rows: String(IA_PAGE), page: String(page), output: 'json' });
  [...IA_FIELDS, 'description'].forEach(f => p.append('fl[]', f));
  p.append('sort[]', 'downloads desc');
  return 'https://archive.org/advancedsearch.php?' + p;
}
/** Scrape-API: haalt een complete collectie op in blokken van 5000 */
function archiveScrapeURL(q, cursor) {
  const p = new URLSearchParams({ q: archiveQuery(q), fields: IA_FIELDS.join(','), count: '5000' });
  if (cursor) p.set('cursor', cursor);
  return 'https://archive.org/services/search/v1/scrape?' + p;
}
const archiveCache = new Map();
async function archiveFiles(id) {
  if (archiveCache.has(id)) return archiveCache.get(id);
  const meta = await http('https://archive.org/metadata/' + encodeURIComponent(id), { type: 'json', timeout: 15000 });
  const files = (meta.files || []).filter(f => /\.(mp4|m4v|webm|ogv)$/i.test(f.name));
  // per basisnaam beste formaat kiezen (h.264 mp4 > overig)
  const best = new Map();
  const score = f => (/h\.264|mpeg4/i.test(f.format || '') ? 3 : 0) + (/\.mp4$/i.test(f.name) ? 2 : 0) + (/512kb/i.test(f.name) ? 0 : 1);
  for (const f of files) {
    const base = f.name.replace(/(\.ia)?(_512kb)?\.(mp4|m4v|webm|ogv)$/i, '');
    if (!best.has(base) || score(f) > score(best.get(base))) best.set(base, f);
  }
  const list = [...best.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl', { numeric: true }))
    .map(f => ({
      name: f.name,
      title: (f.title || f.name.split('/').pop().replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ')).trim(),
      url: `https://archive.org/download/${encodeURIComponent(id)}/${f.name.split('/').map(encodeURIComponent).join('/')}`,
    }));
  const res = { list, meta: meta.metadata || {} };
  archiveCache.set(id, res);
  return res;
}
function archiveItem(d, tab) {
  const id = d.identifier;
  const desc = Array.isArray(d.description) ? d.description.join('\n') : (d.description || '');
  return {
    uid: uid(), kind: tab === 'film' ? 'film' : 'series', tab, src: tab === 'film' ? 'archive-films' : 'archive-tv',
    srcName: 'Internet Archive', title: String(Array.isArray(d.title) ? d.title[0] : d.title || id), year: yearFrom(d.year),
    rating10: d.avg_rating ? Math.round(+d.avg_rating * 20) / 10 : null, votes: +d.num_reviews || 0, pop: +d.downloads || 0,
    genres: uniq([].concat(d.subject || []).flatMap(x => String(x).split(/[;,]/)).map(g => g.trim().toLowerCase()).filter(g => g.length > 2 && g.length < 24)).slice(0, 6),
    desc: desc.replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n').trim(),
    poster: `https://archive.org/services/img/${encodeURIComponent(id)}`, archiveId: id, statusKey: 'ia:' + id,
    langs: (l => (l.length ? l : ['und']))(uniq([].concat(d.language || []).flatMap(x => String(x).split(/[;,/]| and /)).map(normLang))),
    check: async () => ((await archiveFiles(id)).list.length ? 'ok' : 'dead'),
  };
}
async function loadArchive(tab, srcId) {
  const defs = ARCHIVE_ROWS[tab];
  await Promise.all(defs.map(async ([title, q], i) => {
    const row = { id: `${srcId}-${i}`, tab, title: `${title} · gratis`, items: [], src: srcId, page: 0, total: 0 };
    const add = docs => {
      const seen = new Set(row.items.map(x => x.archiveId));
      const fresh = docs.filter(d => d && d.identifier && !seen.has(d.identifier)).map(d => archiveItem(d, tab));
      row.items.push(...fresh); return fresh.length;
    };
    row.more = async () => {
      if (row.complete) return;
      row.page++;
      const j = await httpIndex(archiveSearchURL(q, row.page), { type: 'json' });
      const docs = (j.response && j.response.docs) || [];
      row.total = (j.response && j.response.numFound) || row.total;
      add(docs);
      row.done = docs.length < IA_PAGE || row.items.length >= row.total;
      row.ver = (row.ver || 0) + 1;
      scheduleRender();
    };
    /** Hele categorie inladen (alle titels, niet alleen de eerste pagina) */
    row.loadAll = async progress => {
      if (row.complete) return;
      let cursor = null;
      do {
        const j = await httpIndex(archiveScrapeURL(q, cursor), { type: 'json', timeout: 90000 });
        add(j.items || []);
        row.total = Math.max(j.total || 0, row.items.length);
        cursor = j.cursor || null;
        row.ver = (row.ver || 0) + 1;
        progress && progress(row.items.length, row.total);
      } while (cursor);
      row.complete = row.done = true; row.total = row.items.length;
      scheduleRender();
    };
    try { await row.more(); addRow(row); } catch (e) { console.warn('archive', title, e); }
  }));
}

// Genre-rijen: items uit de genre-gegevens van de provider gegroepeerd, zodat series net als films
// per categorie te bladeren zijn (Drama, Romantiek, Thrillers, …).
const GENRE_MAP = {
  drama: 'Drama', dramas: 'Drama', comedy: 'Comedy', komedie: 'Comedy', 'komödie': 'Comedy', 'comédie': 'Comedy', comedie: 'Comedy',
  romance: 'Romantiek', romantiek: 'Romantiek', romantic: 'Romantiek', romantik: 'Romantiek', liebe: 'Romantiek', liebesfilm: 'Romantiek',
  thriller: 'Thrillers', thrillers: 'Thrillers', spannung: 'Thrillers', suspense: 'Thrillers',
  crime: 'Misdaad', krimi: 'Misdaad', misdaad: 'Misdaad', 'true crime': 'Misdaad',
  action: 'Actie', actie: 'Actie', aktion: 'Actie', adventure: 'Avontuur', avontuur: 'Avontuur', abenteuer: 'Avontuur',
  'sci-fi': 'Sciencefiction', scifi: 'Sciencefiction', 'science fiction': 'Sciencefiction', 'science-fiction': 'Sciencefiction', sciencefiction: 'Sciencefiction',
  fantasy: 'Fantasy', horror: 'Horror', gruselfilm: 'Horror',
  animation: 'Animatie', animatie: 'Animatie', zeichentrick: 'Animatie', anime: 'Anime',
  documentary: 'Documentaire', documentaire: 'Documentaire', dokumentation: 'Documentaire', doku: 'Documentaire', dokumentarfilm: 'Documentaire',
  family: 'Familie', familie: 'Familie', mystery: 'Mysterie', mysterie: 'Mysterie',
  war: 'Oorlog', oorlog: 'Oorlog', krieg: 'Oorlog', 'war politics': 'Oorlog', western: 'Western',
  kids: 'Kinderen', kinderen: 'Kinderen', kinder: 'Kinderen', children: 'Kinderen', reality: 'Reality', 'reality-tv': 'Reality',
  history: 'Geschiedenis', geschiedenis: 'Geschiedenis', historie: 'Geschiedenis', historisch: 'Geschiedenis',
  music: 'Muziek', muziek: 'Muziek', musical: 'Muziek', biography: 'Biografie', biografie: 'Biografie', sport: 'Sport', sports: 'Sport',
  talk: 'Talkshow', talkshow: 'Talkshow', soap: 'Soap', 'soap opera': 'Soap', news: 'Nieuws', nieuws: 'Nieuws', politics: 'Politiek',
};
function canonGenre(g) {
  const k = String(g || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!k || k.length < 3) return '';
  if (GENRE_MAP[k]) return GENRE_MAP[k];
  return k.length > 22 ? '' : k[0].toUpperCase() + k.slice(1);
}
function genreRows(items, tab, sub, min = 8, max = 30) {
  const m = new Map();
  for (const it of items) {
    const gs = new Set();
    for (const part of (it.genres || []).flatMap(x => String(x).split(/\s*[,/|;&]\s*/))) { const c = canonGenre(part); if (c) gs.add(c); }
    for (const c of gs) { if (!m.has(c)) m.set(c, []); m.get(c).push(it); }
  }
  [...m].filter(([, l]) => l.length >= min).sort((a, b) => b[1].length - a[1].length).slice(0, max).forEach(([g, list]) =>
    addRow({ id: `${sub.id}-${tab}-genre-${g}`, genre: g, tab, title: `Genre · ${g}`, items: list.slice().sort((a, b) => (b.added || 0) - (a.added || 0)), src: sub.id, sub: true }));
}

// Abonnementen
const SXE = /^(.*?)[\s._\-:|]*S(\d{1,2})[\s._-]*E(\d{1,3})\b/i;

async function loadM3USub(sub) {
  const text = await httpIndex(sub.url, { timeout: 60000 });
  const entries = parseM3U(text);
  if (!entries.length) throw new Error('Lege of ongeldige playlist');
  const groups = new Map(); // key tab|group -> items
  const shows = new Map();  // series-naam -> item
  const put = (tab, g, it) => { const k = tab + '\u0001' + g; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); };
  for (const e of entries) {
    const tab = classify(e), g = e.attrs['group-title'] || 'Overig';
    const name = cleanName(e.name);
    if (tab === 'live') { const it = liveItem(e, 'live', sub.id, sub.name); put('live', g, it); continue; }
    const m = tab === 'series' && name.match(SXE);
    if (m) {
      const show = m[1].trim() || name, key = g + '|' + show;
      let it = shows.get(key);
      if (!it) {
        it = { uid: uid(), kind: 'series', tab: 'series', src: sub.id, srcName: sub.name, sub: true, title: show, langs: entryLangs(e),
          poster: e.attrs['tvg-logo'] || '', episodes: [], group: g, year: yearFrom(show) };
        shows.set(key, it); put('series', g, it);
      }
      it.episodes.push({ season: +m[2], ep: +m[3], title: name, url: e.url, img: e.attrs['tvg-logo'] });
      continue;
    }
    put(tab, g, { uid: uid(), kind: tab === 'film' ? 'film' : 'series', tab, src: sub.id, srcName: sub.name, sub: true,
      title: name, poster: e.attrs['tvg-logo'] || '', url: e.url, group: g, langs: entryLangs(e), year: yearFrom(name) });
  }
  for (const [k, items] of groups) {
    const [tab, g] = k.split('\u0001');
    for (const it of items) {
      if (!it.url && it.episodes) it.url = it.episodes[0].url;
      if (!it.check) { it.statusKey = it.url; it.check = () => probe(it.url); }
    }
    addRow({ id: `${sub.id}-${k}`, tab, title: g, items, src: sub.id, sub: true });
  }
  return `${entries.length} streams`;
}

function xt(sub) {
  const base = sub.server.trim().replace(/\/+$/, '');
  const auth = `username=${encodeURIComponent(sub.user)}&password=${encodeURIComponent(sub.pass)}`;
  return {
    base, api: a => `${base}/player_api.php?${auth}${a ? '&action=' + a : ''}`,
    movie: (id, ext) => `${base}/movie/${encodeURIComponent(sub.user)}/${encodeURIComponent(sub.pass)}/${id}.${ext || 'mp4'}`,
    series: (id, ext) => `${base}/series/${encodeURIComponent(sub.user)}/${encodeURIComponent(sub.pass)}/${id}.${ext || 'mp4'}`,
    live: id => `${base}/live/${encodeURIComponent(sub.user)}/${encodeURIComponent(sub.pass)}/${id}.m3u8`,
  };
}

async function loadXtream(sub) {
  const x = xt(sub);
  const info = await http(x.api(), { type: 'json' });
  const u = info && info.user_info;
  if (!u || String(u.auth) !== '1') throw new Error('Inloggen mislukt');
  if (u.status && u.status !== 'Active') throw new Error('Abonnement ' + u.status);
  if (u.exp_date && +u.exp_date * 1000 < Date.now()) throw new Error('Abonnement verlopen');
  const exp = u.exp_date ? ' · tot ' + new Date(+u.exp_date * 1000).toLocaleDateString('nl-NL') : '';
  const getCats = async a => { try { return await httpIndex(x.api(a), { type: 'json', timeout: 60000 }); } catch { return []; } };
  const [vc, sc, lc, vod, ser, live] = await Promise.all([
    getCats('get_vod_categories'), getCats('get_series_categories'), getCats('get_live_categories'),
    getCats('get_vod_streams'), getCats('get_series'), getCats('get_live_streams'),
  ]);
  const catName = (cats, id) => ((cats || []).find(c => String(c.category_id) === String(id)) || {}).category_name || 'Overig';
  const bucket = (list, cats, mk, tab) => {
    const m = new Map();
    for (const s of list || []) {
      const g = catName(cats, s.category_id); if (!m.has(g)) m.set(g, []);
      const it = mk(s); const l = labelLangs(g, s.name); it.langs = l.length ? l : ['und']; it.cat = g; m.get(g).push(it);
    }
    for (const [g, items] of m) addRow({ id: `${sub.id}-${tab}-${g}`, tab, title: g, items, src: sub.id, sub: true });
    return [...m.values()].flat();
  };
  // Account is actief → films en series van de provider gelden als beschikbaar.
  bucket(vod, vc, s => ({ uid: uid(), kind: 'film', tab: 'film', src: sub.id, srcName: sub.name, sub: true, status: 'ok',
    title: s.name, poster: s.stream_icon || '', year: yearFrom(s.year) || yearFrom(s.name), added: +s.added || 0,
    rating10: num(s.rating) || (num(s.rating_5based) ? num(s.rating_5based) * 2 : null), genres: s.genre ? String(s.genre).toLowerCase().split(/\s*[,/]\s*/).filter(Boolean) : [],
    url: x.movie(s.stream_id, s.container_extension) }), 'film');
  const serItems = bucket(ser, sc, s => ({ uid: uid(), kind: 'series', tab: 'series', src: sub.id, srcName: sub.name, sub: true, status: 'ok',
    title: s.name, poster: s.cover || '', year: yearFrom(s.releaseDate || s.release_date) || yearFrom(s.name), desc: s.plot || '',
    rating10: num(s.rating) || (num(s.rating_5based) ? num(s.rating_5based) * 2 : null), added: +s.last_modified || 0,
    genres: s.genre ? String(s.genre).toLowerCase().split(/\s*[,/]\s*/).filter(Boolean) : [], xtreamSeries: s.series_id, subRef: sub }), 'series');
  genreRows(serItems, 'series', sub);   // naast de categorieën van de provider ook genre-rijen (Drama, Romantiek, Thrillers, …)
  bucket(live, lc, s => { const url = x.live(s.stream_id); return { uid: uid(), kind: 'live', tab: 'live', src: sub.id, srcName: sub.name, sub: true,
    title: s.name, poster: s.stream_icon || '', logo: true, url, statusKey: url, check: () => probe(url),
    xid: s.stream_id, subRef: sub, arch: +s.tv_archive ? 1 : 0, archDays: +s.tv_archive_duration || 0 }; }, 'live');
  return `${(vod || []).length} films · ${(ser || []).length} series · ${(live || []).length} zenders${exp}`;
}

async function loadSub(sub) {
  state.subStatus[sub.id] = { ok: null, msg: 'Laden…' }; renderSettings();
  try {
    const msg = await track(sub.name, () => (sub.type === 'xtream' ? loadXtream(sub) : loadM3USub(sub)));
    state.subStatus[sub.id] = { ok: true, msg: 'Actief · ' + msg };
  } catch (e) {
    state.rows = state.rows.filter(r => r.src !== sub.id); // niets tonen als het abonnement niet werkt
    let msg = e.message;
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) msg = ENV.native ? 'Server niet bereikbaar' : 'Server niet bereikbaar of blokkeert de browser (CORS) — gebruik de app of een proxy';
    state.subStatus[sub.id] = { ok: false, msg };
  }
  renderSettings(); scheduleRender();
}

async function loadAll() {
  state.rows = []; clearQueue(); viewKey = '';
  const jobs = [];
  for (const b of BUILTIN) {
    if (!state.settings.builtin[b.id]) continue;
    if (b.type === 'm3u') jobs.push(track(b.name, () => loadBuiltinM3U(b)).catch(e => console.warn(b.id, e)));
    else jobs.push(track(b.name, () => loadArchive(b.tab, b.id)).catch(e => console.warn(b.id, e)));
  }
  for (const s of state.subs) if (s.enabled !== false) jobs.push(loadSub(s));
  scheduleRender();
  await Promise.all(jobs);
}

// ---------- Weergave ----------
let renderPending = false;
function scheduleRender() {
  if (renderPending) return; renderPending = true;
  setTimeout(() => { renderPending = false; render(); }, 300);
}

const COLORS = ['#ff7a1a', '#7a5cff', '#1ac8ff', '#ff4f8b', '#3ccf7a', '#ffb347'];
function placeholder(title) {
  const n = [...title].reduce((a, c) => a + c.charCodeAt(0), 0);
  const c1 = COLORS[n % COLORS.length], c2 = COLORS[(n + 2) % COLORS.length];
  const ini = title.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  return `<div class="ph" style="background:linear-gradient(135deg,${c1},${c2})">${esc(ini)}</div>`;
}

function cardHTML(it) {
  const st = itemStatus(it);
  const checking = scanOn() && !st && it.check;
  const img = it.poster ? `<img loading="lazy" decoding="async" src="${esc(it.poster)}" alt="">` : '';
  return `<button class="card${it.kind === 'live' ? ' wide' : ''}${it.logo ? ' logo' : ''}${checking ? ' checking' : ''}" data-uid="${it.uid}">
    <div class="thumb" data-title="${esc(it.title)}">${img || placeholder(it.title)}
      ${it.kind === 'live' ? '<span class="badge live">LIVE</span>' : ''}${it.kind === 'live' && it.xid != null ? '<span class="epgb" data-epgb title="Programmagids / terugkijken">📅</span>' : ''}
      ${it.sub ? '<span class="badge sub">ABO</span>' : ''}
      ${checking ? '<span class="badge unk chk">controleren…</span>' : st === 'dead' ? '<span class="badge unk">offline</span>' : ''}
    </div>
    <div class="t">${esc(it.title)}</div>
    <div class="s">${esc([it.year, it.rating10 ? '★ ' + it.rating10.toFixed(1) : '', it.rt != null ? '🍅 ' + it.rt + '%' : '', it.kind === 'series' && it.episodes ? it.episodes.length + ' afl.' : '', it.srcName].filter(Boolean).join(' · '))}</div>
  </button>`;
}
// fallback als een thumbnail niet laadt
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  if (img.id === 'dPoster') { if (!/icon-512/.test(img.src)) { img.src = 'icons/icon-512.png'; img.style.objectFit = 'contain'; } return; }
  if (img.closest('.hero')) {
    const ph = document.createElement('div'); ph.className = 'hero-ph'; ph.innerHTML = placeholder(img.closest('.hero').querySelector('h1').textContent);
    img.replaceWith(ph); const bg = $('.hero .bg'); if (bg) bg.style.backgroundImage = 'none'; return;
  }
  if (!img.closest('.thumb')) return;
  const th = img.closest('.thumb'); img.remove();
  th.insertAdjacentHTML('afterbegin', placeholder(th.dataset.title || '?'));
  th.closest('.card') && th.closest('.card').classList.remove('logo');
}, true);

const itemIndex = new Map();
const langOk = it => { const sel = state.settings.langs || []; return !sel.length || (it.langs || ['und']).some(l => sel.includes(l)); };
const matches = it => langOk(it) && (!state.q || it.title.toLowerCase().includes(state.q));
const rowItems = r => r.items.filter(it => visible(it) && matches(it));
const rank = r => (r.sub ? 0 : r.src.startsWith('archive') ? 1 : 2);

// Alleen wat in beeld komt wordt getekend en (als controle aan staat) gecontroleerd.
const cardIO = new IntersectionObserver(entries => {
  for (const e of entries) {
    const it = itemIndex.get(e.target.dataset.uid); if (!it) continue;
    e.isIntersecting ? enqueue(it) : dequeue(it);
  }
}, { rootMargin: '40px' });
const rowIO = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting && e.target._rec && !e.target._rec.shown) showMore(e.target._rec);
}, { rootMargin: '300px 0px' });
function observeCards(box) { box.querySelectorAll('.card:not([data-o])').forEach(c => { c.dataset.o = 1; cardIO.observe(c); }); }

const CHUNK = 20;
const rowRecs = new Map();
let viewKey = '', heroUid = null;
function makeRowRec(r) {
  const el = document.createElement('section'); el.className = 'row'; el.dataset.id = r.id;
  el.innerHTML = `<div class="row-head"><h2 class="rowlink" data-row="${esc(r.id)}" title="Hele categorie bekijken, sorteren en filteren">${esc(r.title)}</h2><span class="count"></span><button class="more" data-row="${esc(r.id)}">Alles ›</button></div><div class="strip"></div>`;
  const rec = { r, el, strip: $('.strip', el), list: [], shown: 0, ver: -1 };
  el._rec = rec; rowIO.observe(el);
  return rec;
}
function showMore(rec, n = CHUNK) {
  const slice = rec.list.slice(rec.shown, rec.shown + n); if (!slice.length) return false;
  rec.strip.insertAdjacentHTML('beforeend', slice.map(cardHTML).join(''));
  rec.shown += slice.length; observeCards(rec.strip);
  const last = rec.strip.lastElementChild; if (last) stripEndIO.observe(last);
  return true;
}
// laatste kaart van een rij in beeld → volgende kaarten tekenen of meer ophalen
const stripEndIO = new IntersectionObserver(es => {
  for (const e of es) {
    if (!e.isIntersecting) continue;
    stripEndIO.unobserve(e.target);
    const rowEl = e.target.closest('.row'), rec = rowEl && rowEl._rec;
    if (rec && !showMore(rec)) loadMore(rec.r);
  }
}, { rootMargin: '0px 600px' });
const countText = rec => (rec.r.total && !rec.r.complete && !state.q && !(state.settings.langs || []).length ? rec.r.total.toLocaleString('nl-NL') : `${rec.list.length}${rec.r.more && !rec.r.done ? '+' : ''}`);

/** Status van één item veranderd: alleen die kaart(en) bijwerken, niets opnieuw tekenen. */
function onStatus(it) {
  const st = itemStatus(it);
  document.querySelectorAll(`.card[data-uid="${it.uid}"]`).forEach(c => {
    if (st === 'dead' && scanOn()) {
      const rowEl = c.closest('.row'), rec = rowEl && rowEl._rec;
      c.remove();
      if (rec) {
        const i = rec.list.indexOf(it); if (i >= 0) { rec.list.splice(i, 1); rec.shown--; }
        $('.count', rec.el).textContent = countText(rec);
        if (rec.shown < CHUNK) showMore(rec, 1);
        if (!rec.list.length) rec.el.hidden = true;
      }
    } else {
      c.classList.remove('checking');
      const b = c.querySelector('.chk'); if (b) b.remove();
    }
  });
}

/** Genre-rijen tussen de aanbiedercategorieën verspreiden (om de twee rijen één genre) i.p.v. allemaal onderaan. */
function interleaveGenres(rows) {
  const out = [];
  const bySrc = new Map();
  for (const r of rows) { if (!bySrc.has(r.src)) bySrc.set(r.src, { cats: [], genres: [] }); bySrc.get(r.src)[r.genre ? 'genres' : 'cats'].push(r); }
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.src)) continue; seen.add(r.src);
    const { cats, genres } = bySrc.get(r.src); let gi = 0;
    if (!genres.length) { out.push(...cats); continue; }
    // eerst één genre-rij vooraan, daarna om de twee categorieën
    out.push(genres[gi++]);
    cats.forEach((c, i) => { out.push(c); if ((i + 1) % 2 === 0 && gi < genres.length) out.push(genres[gi++]); });
    while (gi < genres.length) out.push(genres[gi++]);
  }
  // rijen die niet bij een abonnement horen (archive, gratis lijsten) behouden hun plek
  return out;
}

function render() {
  itemIndex.clear();
  for (const r of state.rows) for (const it of r.items) itemIndex.set(it.uid, it);
  const hasLive = state.rows.some(r => r.tab === 'live');
  $('#tabs [data-tab=live]').hidden = !hasLive;
  if (state.tab === 'live' && !hasLive) state.tab = 'film';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));

  const rowsEl = $('#rows');
  const key = [state.tab, state.q, (state.settings.langs || []).join(), scanOn()].join('|');
  if (key !== viewKey) { // andere weergave: alles opnieuw opbouwen
    viewKey = key; heroUid = null; rowsEl.innerHTML = ''; rowRecs.clear();
    cardIO.disconnect(); rowIO.disconnect(); clearQueue();
  }
  const rows = interleaveGenres(state.rows.filter(r => r.tab === state.tab).sort((a, b) => rank(a) - rank(b)));
  let prev = null, total = 0; const alive = new Set();
  for (const r of rows) {
    let rec = rowRecs.get(r.id);
    if (rec && rec.r !== r) { rec.el.remove(); rec = null; }
    if (!rec) { rec = makeRowRec(r); rowRecs.set(r.id, rec); }
    if (rec.ver !== r.ver) { // nieuwe items in deze rij: alleen aanvullen
      rec.ver = r.ver; rec.list = rowItems(r);
      if (rec.shown && rec.shown < CHUNK) showMore(rec, CHUNK - rec.shown);
    }
    if (!rec.list.length) continue;
    $('.count', rec.el).textContent = countText(rec);
    rec.el.hidden = false; alive.add(r.id); total += rec.list.length;
    const want = prev ? prev.nextSibling : rowsEl.firstChild;
    if (want !== rec.el) rowsEl.insertBefore(rec.el, want);
    prev = rec.el;
  }
  for (const [id, rec] of rowRecs) if (!alive.has(id)) { rec.el.remove(); rowRecs.delete(id); }

  // uitgelicht (blijft staan zolang het item bestaat)
  const heroEl = $('#hero');
  if (state.q) heroEl.hidden = true;
  else if (!heroUid || !itemIndex.has(heroUid)) {
    let hero = null;
    for (const rec of rowRecs.values()) { hero = rec.list.find(i => i.kind !== 'live' && i.poster && itemStatus(i) !== 'dead'); if (hero) break; }
    heroUid = hero ? hero.uid : null; heroEl.hidden = !hero;
    if (hero) heroEl.innerHTML = `<div class="bg" style="background-image:url('${esc(hero.poster)}')"></div>
      <div class="inner"><img src="${esc(hero.poster)}" alt=""><div><h1>${esc(hero.title)}</h1>
      <p>${esc(hero.desc || hero.srcName || '')}</p>
      <button class="btn primary" data-uid="${hero.uid}">▶ Bekijken</button></div></div>`;
  }

  const empty = $('#empty');
  empty.hidden = total > 0;
  if (!total) empty.innerHTML = state.q ? esc(`Niets gevonden voor “${state.q}”.`) :
    state.tab === 'hist' ? 'Nog niets bekeken. Wat je afspeelt verschijnt hier.' :
    loaders.size ? '<img class="crest-sm" src="icons/icon-192.png" alt=""><br>Index laden…' :
    (state.tab === 'hist' ? 'Nog niets bekeken. Wat je afspeelt verschijnt hier.' : 'Nog niets beschikbaar. Voeg een abonnement toe of zet bronnen aan via ⚙.');
  renderLangs(); renderCats();
  hideSplash(total > 0 || !loaders.size);
}

// ---------- Categorieën-menu ----------
function renderCats() {
  const pop = $('#catPop'); if (pop.hidden) return;
  const q = $('#catQ').value.trim().toLowerCase();
  const rows = state.rows.filter(r => r.tab === state.tab).map(r => ({ r, n: rowItems(r).length })).filter(x => x.n && (!q || x.r.title.toLowerCase().includes(q) || (x.r.genre || '').toLowerCase().includes(q)));
  const btn = x => `<button class="cat" data-row="${esc(x.r.id)}"><span class="ct">${esc((x.r.genre || x.r.title).replace(/\s+/g, ' ').trim())}</span><span class="c">${x.n}</span></button>`;
  const genres = rows.filter(x => x.r.genre).sort((a, b) => a.r.genre.localeCompare(b.r.genre, 'nl'));
  const cats = rows.filter(x => !x.r.genre);
  $('#catList').innerHTML =
    (genres.length ? `<div class="cat-h">Genres</div>${genres.map(btn).join('')}` : '') +
    (cats.length ? `<div class="cat-h">Categorieën</div>${cats.slice(0, 600).map(btn).join('')}` : '') ||
    '<p class="hint">Niets gevonden.</p>';
}
$('#btnCats').onclick = e => {
  e.stopPropagation(); const p = $('#catPop'); $('#langPop').hidden = true; p.hidden = !p.hidden;
  if (p.hidden) return;
  renderCats(); $('#catList').scrollTop = 0;
  if (isTV()) focusFirst($('#catList'), '.cat'); else $('#catQ').focus();
};
$('#catPop').addEventListener('click', e => e.stopPropagation());
$('#catQ').addEventListener('input', renderCats);
$('#catList').addEventListener('click', e => {
  const b = e.target.closest('.cat'); if (!b) return;
  const row = state.rows.find(r => r.id === b.dataset.row);
  $('#catPop').hidden = true; $('#btnCats').focus({ preventScroll: true });
  if (row) openGrid(row);
});

// ---------- Taalfilter ----------
function renderLangs() {
  const sel = state.settings.langs;
  $('#btnLang').classList.toggle('on', sel.length > 0);
  $('#langLabel').textContent = !sel.length ? 'Alle talen' : sel.length <= 2 ? sel.map(langName).join(', ') : `${sel.length} talen`;
  if ($('#langPop').hidden) return;
  const counts = new Map();
  for (const r of state.rows) {
    if (r.tab !== state.tab) continue;
    for (const it of r.items) if (visible(it)) for (const l of uniq(it.langs || ['und'])) counts.set(l, (counts.get(l) || 0) + 1);
  }
  for (const l of sel) if (!counts.has(l)) counts.set(l, 0);
  const pinned = ['nl', 'en'];
  const list = [...counts.entries()].sort((a, b) =>
    (pinned.includes(b[0]) - pinned.includes(a[0])) || (a[0] === 'und') - (b[0] === 'und') || b[1] - a[1]);
  $('#langList').innerHTML = list.map(([c, n]) => `<label class="lang"><input type="checkbox" value="${c}" ${sel.includes(c) ? 'checked' : ''}>
    <span>${esc(langName(c))}</span><span class="c">${n}</span></label>`).join('') || '<p class="hint">Nog geen talen gevonden.</p>';
}
let langT;
function setLangs(langs) {
  state.settings.langs = langs; saveSettings(); if (langs.length) applyIptvLangs(); render();
  clearTimeout(langT); // Internet Archive opnieuw doorzoeken in de gekozen taal
  langT = setTimeout(() => {
    state.rows = state.rows.filter(r => !r.src.startsWith('archive'));
    for (const b of BUILTIN) if (b.type === 'archive' && state.settings.builtin[b.id]) track(b.name, () => loadArchive(b.tab, b.id));
    scheduleRender();
  }, 700);
}
$('#btnLang').onclick = e => { e.stopPropagation(); $('#catPop').hidden = true; const p = $('#langPop'); p.hidden = !p.hidden; if (!p.hidden) applyIptvLangs(); renderLangs(); };
$('#langPop').addEventListener('click', e => e.stopPropagation());
$('#langList').addEventListener('change', () => setLangs([...document.querySelectorAll('#langList input:checked')].map(i => i.value)));
$('#langClear').onclick = () => setLangs([]);
document.addEventListener('click', () => { $('#langPop').hidden = true; $('#catPop').hidden = true; });

// horizontale strip: aan het eind de volgende kaarten tekenen / meer ophalen
document.addEventListener('scroll', e => {
  const s = e.target;
  if (!s.classList || !s.classList.contains('strip')) return;
  if (s.scrollLeft + s.clientWidth > s.scrollWidth - 400) {
    const rec = s.closest('.row')._rec;
    if (!showMore(rec)) loadMore(rec.r);
  }
}, true);
async function loadMore(row) {
  if (!row || !row.more || row.done || row.loading) return;
  row.loading = true; try { await row.more(); } catch {} finally { row.loading = false; }
}

// ---------- Raster (categorie) met sorteren en filters ----------
const SORTS = [
  ['pop', 'Populair / standaard'], ['az', 'Titel A → Z'], ['za', 'Titel Z → A'],
  ['yearDesc', 'Jaar: nieuwste eerst'], ['yearAsc', 'Jaar: oudste eerst'],
  ['rating', 'Sterren: hoogste eerst'], ['ratingAsc', 'Sterren: laagste eerst'],
  ['rt', 'Rotten Tomatoes: hoogste eerst'], ['added', 'Laatst toegevoegd'],
];
const coll = new Intl.Collator('nl', { numeric: true, sensitivity: 'base' });
// sorteertitel: zonder taallabel ("NL | ") en lidwoord vooraan, getallen blijven staan
const sortTitle = it => it._st || (it._st = String(it.title).replace(/^\s*[\[(|]?\s*[A-Za-z]{2,3}\s*[\])|:\-–•]\s*/, '').replace(/^(the|de|het|een|a|an)\s+/i, '').trim());
const byTitle = (a, b) => coll.compare(sortTitle(a), sortTitle(b));
function byNum(f, dir) { // ontbrekende waarden altijd achteraan
  return (a, b) => { const x = f(a), y = f(b);
    if (x == null && y == null) return byTitle(a, b); if (x == null) return 1; if (y == null) return -1;
    return dir * (x - y) || byTitle(a, b); };
}
const score10 = it => it.rating10 || (it.rt != null ? it.rt / 10 : null);
function sortItems(list, mode) {
  const a = list.slice();
  switch (mode) {
    case 'az': return a.sort(byTitle);
    case 'za': return a.sort((x, y) => byTitle(y, x));
    case 'yearDesc': return a.sort(byNum(i => i.year || null, -1));
    case 'yearAsc': return a.sort(byNum(i => i.year || null, 1));
    case 'rating': return a.sort(byNum(score10, -1));
    case 'ratingAsc': return a.sort(byNum(score10, 1));
    case 'rt': return a.sort(byNum(i => i.rt, -1));
    case 'added': return a.sort(byNum(i => i.added || null, -1));
    default: return a.some(i => i.pop) ? a.sort(byNum(i => i.pop || null, -1)) : a;
  }
}
const gridState = { row: null, list: [], shown: 0, genre: '', text: '', loading: false };
function gridFilter(it) {
  const g = state.settings.grid;
  if (g.decade) { const d = +g.decade; if (!it.year || it.year < d || it.year > d + 9) return false; }
  if (+g.rating) { const sc = score10(it); if (sc == null || sc < +g.rating) return false; }
  if (gridState.genre && !(it.genres || []).includes(gridState.genre)) return false;
  if (gridState.text && !it.title.toLowerCase().includes(gridState.text)) return false;
  return true;
}
function fillGridTools(row) {
  const items = row.items, g = state.settings.grid;
  $('#gSort').innerHTML = SORTS.map(([v, n]) => `<option value="${v}" ${g.sort === v ? 'selected' : ''}>${n}</option>`).join('');
  const decs = uniq(items.map(i => i.year ? Math.floor(i.year / 10) * 10 : null)).sort((a, b) => b - a);
  $('#gDecade').innerHTML = '<option value="">Alle jaren</option>' + decs.map(d => `<option value="${d}" ${+g.decade === d ? 'selected' : ''}>${d}–${d + 9}</option>`).join('');
  $('#gDecade').hidden = !decs.length;
  $('#gRating').value = String(g.rating || 0);
  const gc = new Map(); for (const i of items) for (const x of i.genres || []) gc.set(x, (gc.get(x) || 0) + 1);
  const genres = [...gc.entries()].filter(e => e[1] > 1).sort((a, b) => b[1] - a[1]).slice(0, 40);
  $('#gGenre').innerHTML = '<option value="">Alle genres</option>' + genres.map(([x, n]) => `<option value="${esc(x)}" ${gridState.genre === x ? 'selected' : ''}>${esc(x)} (${n})</option>`).join('');
  $('#gGenre').hidden = !genres.length;
}
function gridInfo(extra = '') {
  const row = gridState.row; if (!row) return;
  const total = row.total || row.items.length;
  $('#gInfo').innerHTML = `${gridState.list.length.toLocaleString('nl-NL')} titels` +
    (row.complete || !row.loadAll ? '' : ` · ${row.items.length.toLocaleString('nl-NL')} van ${total.toLocaleString('nl-NL')} geladen`) + (extra ? ' · ' + extra : '');
}
async function openGrid(row) {
  rememberFocus('gridView');
  gridState.row = row; gridState.genre = ''; gridState.text = ''; $('#gText').value = '';
  $('#gridTitle').textContent = row.title; $('#gridView').hidden = false; $('#gridView').scrollTop = 0;
  fillGridTools(row); renderGrid();
  if (isTV()) focusFirst($('#grid'));
  if (row.loadAll && !row.complete) { // hele categorie ophalen
    gridState.loading = true;
    try {
      await row.loadAll((n, t) => { if (gridState.row === row) { gridInfo(`laden… ${Math.round(n / Math.max(t, 1) * 100)}%`); } });
    } catch (e) { toast('Niet alles kon worden geladen'); }
    gridState.loading = false;
    if (gridState.row !== row || $('#gridView').hidden) return;
    fillGridTools(row);
    if ($('#gridView').scrollTop < 400) renderGrid();
    else $('#gInfo').innerHTML = `Alles geladen (${row.items.length.toLocaleString('nl-NL')}) · <button class="linkbtn" id="gRefresh">bijwerken</button>`;
  }
}
function renderGrid() {
  const row = gridState.row;
  gridState.list = sortItems(rowItems(row).filter(gridFilter), state.settings.grid.sort); gridState.shown = 0;
  $('#grid').innerHTML = '';
  if (!gridMore()) $('#grid').innerHTML = `<div class="empty">${gridState.loading ? 'Laden…' : 'Niets gevonden met deze filters.'}</div>`;
  gridInfo(gridState.loading ? 'laden…' : '');
}
const GRID_CHUNK = 120;
function gridMore() {
  const s = gridState.list.slice(gridState.shown, gridState.shown + GRID_CHUNK);
  if (s.length) { $('#grid').insertAdjacentHTML('beforeend', s.map(cardHTML).join('')); gridState.shown += s.length; observeCards($('#grid')); }
  const left = gridState.list.length - gridState.shown;
  $('#gMore').hidden = left <= 0;
  $('#gMore').textContent = `Meer tonen (${gridState.shown.toLocaleString('nl-NL')} van ${gridState.list.length.toLocaleString('nl-NL')})`;
  return s.length > 0;
}
// Volgende titels tonen zodra het einde van het raster in beeld komt (werkt op touch, muis en afstandsbediening)
const gridEndIO = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && !$('#gridView').hidden) gridMore(); }, { rootMargin: '1200px 0px' });
gridEndIO.observe($('#gridEnd'));
$('#gMore').onclick = () => gridMore();
$('#gridView').addEventListener('scroll', e => {
  const g = e.currentTarget;
  if (g.scrollTop + g.clientHeight > g.scrollHeight - 1200) gridMore();
}, { passive: true });
$('#gridTools').addEventListener('change', async e => {
  const t = e.target, g = state.settings.grid;
  if (t.id === 'gSort') { g.sort = t.value; if (g.sort === 'rt') await fetchRatings(gridState.list.length ? rowItems(gridState.row).filter(gridFilter) : []); }
  if (t.id === 'gDecade') g.decade = t.value;
  if (t.id === 'gRating') g.rating = +t.value;
  if (t.id === 'gGenre') gridState.genre = t.value;
  saveSettings(); renderGrid(); $('#gridView').scrollTop = 0;
});
let gT; $('#gText').addEventListener('input', e => { clearTimeout(gT); gT = setTimeout(() => { gridState.text = e.target.value.trim().toLowerCase(); renderGrid(); }, 200); });
$('#gReset').onclick = () => { Object.assign(state.settings.grid, { decade: '', rating: 0 }); gridState.genre = ''; gridState.text = ''; $('#gText').value = ''; saveSettings(); fillGridTools(gridState.row); renderGrid(); };
$('#gInfo').addEventListener('click', e => { if (e.target.id === 'gRefresh') { renderGrid(); $('#gridView').scrollTop = 0; } });

// ---------- Beoordelingen (Rotten Tomatoes / IMDb via OMDb) ----------
const omdbMem = new Map();
async function omdb(it) {
  const key = state.settings.omdbKey; if (!key || it.kind === 'live') return null;
  const k = `${it.kind}|${cleanTitle(it.title).toLowerCase()}|${it.year || ''}`;
  let r = omdbMem.get(k);
  if (r === undefined && cacheOn()) { const c = await IDB.get('omdb', k); if (c && Date.now() - c.t < Math.max(cacheTTL(), 7 * 864e5)) r = c.v; }
  if (r === undefined) {
    const u = `https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&t=${encodeURIComponent(cleanTitle(it.title))}` +
      (it.year ? `&y=${it.year}` : '') + `&type=${it.kind === 'film' ? 'movie' : 'series'}`;
    const j = await http(u, { type: 'json', timeout: 12000 });
    if (j.Response === 'False' && /limit|invalid api/i.test(j.Error || '')) throw new Error(j.Error);
    const rt = (j.Ratings || []).find(x => x.Source === 'Rotten Tomatoes');
    r = j.Response === 'False' ? { none: true } : { rt: rt ? parseInt(rt.Value) : null, imdb: num(j.imdbRating), plot: j.Plot && j.Plot !== 'N/A' ? j.Plot : '', genre: j.Genre && j.Genre !== 'N/A' ? j.Genre : '' };
    omdbMem.set(k, r); if (cacheOn()) IDB.set('omdb', k, { v: r, t: Date.now() });
  }
  if (r && !r.none) {
    it.rt = r.rt; if (!it.rating10 && r.imdb) it.rating10 = r.imdb;
    if (!it.desc && r.plot) it.desc = r.plot;
    if (r.genre && !(it.genres || []).length) it.genres = r.genre.toLowerCase().split(/\s*,\s*/);
  } else it.rt = it.rt ?? null;
  return r;
}
async function fetchRatings(list) {
  if (!state.settings.omdbKey) {
    toast('Vul eerst een gratis OMDb-sleutel in bij ⚙ → Beoordelingen', 4500); renderSettings(); $('#settings').hidden = false; return;
  }
  const todo = list.filter(i => i.kind !== 'live' && i.rt === undefined).slice(0, 400);
  let done = 0, stop = false;
  const worker = async () => { while (todo.length && !stop) { const it = todo.shift(); try { await omdb(it); } catch (e) { stop = true; toast('OMDb: ' + e.message, 5000); } done++; gridInfo(`🍅 ophalen ${done}/${done + todo.length}`); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

// ---------- Detail ----------
async function openDetail(it) {
  const d = $('#detail');
  rememberFocus('detail');
  $('#dTitle').textContent = it.title;
  $('#dPoster').src = it.poster || 'icons/icon-512.png';
  $('#dPoster').style.objectFit = it.logo ? 'contain' : 'cover';
  $('#dBg').style.backgroundImage = it.poster ? `url("${it.poster}")` : '';
  const meta = [it.kind === 'live' ? '🔴 Live' : it.kind === 'film' ? 'Film' : 'Serie', it.year, it.rating10 ? '★ ' + it.rating10.toFixed(1) : '', it.rt != null ? '🍅 ' + it.rt + '%' : '', (it.genres || []).slice(0, 3).join(', '), (it.langs || []).filter(l => l !== 'und').map(langName).join(' / '), it.group, it.srcName].filter(Boolean);
  $('#dMeta').innerHTML = meta.map(m => `<span>${esc(m)}</span>`).join('');
  $('#dDesc').textContent = it.desc || '';
  $('#dEpisodes').innerHTML = '';
  const acts = $('#dActions'); acts.innerHTML = '';
  if (state.settings.omdbKey && it.kind !== 'live' && it.rt === undefined) omdb(it).then(() => {
    if ($('#detail').hidden || $('#dTitle').textContent !== it.title) return;
    const extra = [it.rating10 ? '★ ' + it.rating10.toFixed(1) : '', it.rt != null ? '🍅 ' + it.rt + '%' : ''].filter(Boolean);
    if (extra.length && !$('#dMeta').textContent.includes('🍅')) $('#dMeta').insertAdjacentHTML('afterbegin', extra.map(m => `<span>${esc(m)}</span>`).join(''));
    if (!$('#dDesc').textContent && it.desc) $('#dDesc').textContent = it.desc;
  }).catch(() => {});
  d.hidden = false;
  if (isTV()) $('#detail .close').focus({ preventScroll: true });

  const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; acts.appendChild(b); };
  const addPlay = (url, title = it.title) => {
    const ext = state.settings.ext.always;
    const rp = it.kind === 'live' ? 0 : getPos(url);
    btn((rp ? '⏵ Hervatten (' + fmtT(rp) + ')' : '▶ Afspelen') + (ext ? ' in ' + extName() : ''), 'primary', () => playAuto(url, title, it));
    if (rp) btn('Van begin af', '', () => { clearPos(url); playAuto(url, title, it, null, null, null, true); });
    btn(ext ? 'Ingebouwde speler' : '↗ ' + extName(), '', () => (ext ? play(url, title, it) : (noteWatched(it), openExternal(url, title, { it }))));
    if (dlable(url, it)) acts.appendChild(dlBtnEl(url, title, it));
    btn('📺 Casten', '', () => castPlay(url, title, it)); acts.lastElementChild.dataset.castUi = '1';
    if (it.kind === 'live' && it.xid != null) btn(it.arch ? '📅 Gids / terugkijken' : '📅 Programmagids', '', () => openEpg(it));
    btn('Kopieer link', '', () => navigator.clipboard.writeText(url).then(() => toast('Link gekopieerd'), () => prompt('Stream-URL', url)));
  };

  if (it.archiveId) {
    $('#dEpisodes').innerHTML = '<div class="loading">Bestanden ophalen…</div>';
    try {
      const { list, meta: m } = await archiveFiles(it.archiveId);
      if (!it.desc && m.description) $('#dDesc').textContent = String(m.description).replace(/<[^>]+>/g, ' ');
      if (!list.length) throw new Error('geen video');
      $('#dEpisodes').innerHTML = '';
      if (it.kind === 'film' || list.length === 1) addPlay(list[0].url);
      if (list.length > 1) episodeList(list.map((f, i) => ({ season: 1, ep: i + 1, title: f.title, url: f.url })), it, it.kind === 'film');
    } catch {
      setStatus(it.statusKey, 'dead'); onStatus(it);
      $('#dEpisodes').innerHTML = '<div class="loading">Niet (meer) beschikbaar — verborgen.</div>';
    }
  } else if (it.xtreamSeries) {
    $('#dEpisodes').innerHTML = '<div class="loading">Afleveringen ophalen…</div>';
    try {
      const x = xt(it.subRef);
      const info = await http(x.api('get_series_info') + '&series_id=' + it.xtreamSeries, { type: 'json' });
      if (info.info && info.info.plot && !it.desc) $('#dDesc').textContent = info.info.plot;
      const eps = [];
      for (const [season, list] of Object.entries(info.episodes || {}))
        for (const e of list) eps.push({ season: +season, ep: +e.episode_num, title: e.title, url: x.series(e.id, e.container_extension), img: e.info && e.info.movie_image });
      if (!eps.length) throw new Error('leeg');
      $('#dEpisodes').innerHTML = '';
      episodeList(eps, it);
    } catch { $('#dEpisodes').innerHTML = '<div class="loading">Geen afleveringen beschikbaar.</div>'; }
  } else if (it.episodes) {
    episodeList(it.episodes, it);
  } else if (it.url) {
    addPlay(it.url);
  }
  if (isTV() && !d.hidden) focusFirst(d, '.d-actions .btn.primary, .ep');
}

function episodeList(eps, it, asParts = false) {
  eps.sort((a, b) => a.season - b.season || a.ep - b.ep);
  const seasons = [...new Set(eps.map(e => e.season))];
  const box = $('#dEpisodes');
  box.innerHTML = `<h3 style="margin:10px 0 6px">${asParts ? 'Delen' : 'Afleveringen'}</h3>` +
    (seasons.length > 1 ? `<select id="seasonSel">${seasons.map(s => `<option value="${s}">Seizoen ${s}</option>`).join('')}</select>` : '') +
    '<div id="epList"></div>';
  const show = s => {
    curSeason = s;
    for (const e of eps) if (e.season === s) dlMeta.set(e.url, { it, title: `${it.title} — ${e.title}`, season: e.season, ep: e.ep, eps });
    $('#epList').innerHTML = eps.filter(e => e.season === s).map(e =>
      `<div class="eprow"><button class="ep" data-url="${esc(e.url)}" data-t="${esc(e.title)}">${e.img ? `<img loading="lazy" src="${esc(e.img)}" alt="">` : ''}<span class="n">${e.ep}</span><span>${esc(e.title)}${getPos(e.url) ? ` <small class="resume">⏵ ${fmtT(getPos(e.url))}</small>` : ''}</span></button><button class="dlb cstb" data-cast="${esc(e.url)}" data-cast-ui="1" title="Casten">📺</button>${dlable(e.url, it) ? `<button class="dlb${dlDone(e.url) ? ' dl-done' : ''}" data-dl="${esc(e.url)}" title="Downloaden">${dlLabel(dlBy(e.url), false)}</button>` : ''}</div>`).join('');
  };
  let curSeason = seasons[0];
  const dlSeasonBtn = document.createElement('button'); dlSeasonBtn.className = 'btn dlseason'; dlSeasonBtn.textContent = '⬇ Hele seizoen downloaden';
  dlSeasonBtn.onclick = () => { const urls = eps.filter(e => e.season === curSeason && dlable(e.url, it)).map(e => e.url); const n = dlEnqueue(urls); toast(n ? `${n} afleveringen in de wachtrij — voortgang bij ⬇` : 'Niets nieuws om te downloaden', 3000); };
  box.insertBefore(dlSeasonBtn, $('#epList'));
  show(seasons[0]);
  const sel = $('#seasonSel'); if (sel) sel.onchange = () => { show(+sel.value); dlUI(); };
  box.onclick = e => { const b = e.target.closest('.ep'); if (b) playAuto(b.dataset.url, `${it.title} — ${b.dataset.t}`, it, eps, b.dataset.url); };
}

// ---------- Speler ----------
let hls = null, idleT = null, playCtx = null;
function play(url, title, it, eps, cur, zap, fromStart) {
  if (mpvOn()) { playMpv(url, title, it, eps, cur, zap, fromStart); return; }
  flushPos();
  noteWatched(it);
  const p = $('#player'), v = $('#video'), msg = $('#pMsg');
  $('#pEpg').hidden = !(it && it.kind === 'live' && it.xid != null);
  playCtx = { it, eps, cur: cur || url, zap: zap && zap.length > 1 ? zap : null, key: it && it.kind === 'live' ? null : url };
  const zi = playCtx.zap ? playCtx.zap.indexOf(it) : -1;
  $('#pTitle').textContent = zi >= 0 ? `${zi + 1} · ${title}` : title; msg.hidden = true;
  if (p.hidden) rememberFocus('player');
  p.hidden = false; p.classList.toggle('zapping', !!playCtx.zap); $('#pList').hidden = true;
  $('#video').controls = !isTV();
  if (isTV()) { try { document.activeElement && document.activeElement.blur(); p.focus(); } catch {} }
  stopPlayback(false);
  const local = dlSrc(url);
  const useHlsJs = !local && isHls(url) && window.Hls && Hls.isSupported() && (!ENV.nativeHls || state.settings.proxy) && !ENV.cap;
  if (useHlsJs) {
    hls = new Hls({
      enableWorker: true, lowLatencyMode: true,
      xhrSetup: state.settings.proxy && !ENV.native ? (xhr, u) => xhr.open('GET', px(u), true) : undefined,
    });
    hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail(it, url, d.type === 'networkError' ? 'Stream niet bereikbaar.' : 'Kan stream niet afspelen.'); });
    hls.loadSource(url); hls.attachMedia(v);
  } else {
    v.src = local || (state.settings.proxy && !ENV.native && ENV.https && /^http:/i.test(url) ? px(url) : url);
  }
  v.play().catch(() => {});
  setupResume(v, fromStart);
  setupSubs(v, it);
  osForPlayer(v, it, playCtx.key);
  v.onerror = () => fail(it, url, /\.(mkv|avi)(\?|$)/i.test(url) ? 'Dit formaat (MKV/AVI) speelt niet in de ingebouwde speler. Kopieer de link en open hem in VLC.' : 'Kan stream niet afspelen.');
  v.onended = () => { clearPos(playCtx && playCtx.key); if (playCtx) playCtx.key = null; playAdjacent(1); }; // volgende aflevering
  if (p.requestFullscreen && matchMedia('(pointer:coarse)').matches && !isTV()) p.requestFullscreen().catch(() => {});
  try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch {}
  poke();
}
/** Eén keer naar de opgeslagen tijd springen zodra de duur bekend is; daarna elke ~5 s bewaren. */
let lastPosSave = 0;
function setupResume(v, fromStart) {
  const key = playCtx && playCtx.key; if (!key) { v.ontimeupdate = null; return; }
  const t0 = fromStart ? 0 : getPos(key);
  if (fromStart) clearPos(key);
  if (t0) {
    const seek = () => { try { v.currentTime = t0; toast('Hervat op ' + fmtT(t0), 2500); } catch {} };
    if (v.readyState >= 1) seek(); else v.addEventListener('loadedmetadata', seek, { once: true });
  }
  v.ontimeupdate = () => {
    const n = Date.now(); if (n - lastPosSave < 5000 || !playCtx || playCtx.key !== key) return;
    lastPosSave = n; if (v.currentTime > 0) savePos(key, v.currentTime, v.duration);
  };
  v.onpause = () => { if (playCtx && playCtx.key === key && v.currentTime > 0 && !v.ended) savePos(key, v.currentTime, v.duration); };
}
function flushPos() {
  const v = $('#video'); if (!playCtx || !playCtx.key || !v || !v.currentTime || v.ended) return;
  savePos(playCtx.key, v.currentTime, v.duration);
}
window.addEventListener('pagehide', flushPos);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushPos(); });

// ---------- Ondertitels van OpenSubtitles (als de stream zelf geen heeft) ----------
const OS_API = 'https://api.opensubtitles.com/api/v1';
const dutchOnlyItem = it => !!(it && it.langs && it.langs.length && it.langs.every(l => /^nl/i.test(l)));
async function osCall(path, body) {
  const key = osKeyVal(); if (!key) throw new Error('geen sleutel');
  const r = await withTimeout(fetch(px(OS_API + path), {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { 'Api-Key': key, 'User-Agent': 'Kijkdoos v1.2', Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }), 15000);
  if (r.status === 406 || r.status === 429) { const e = new Error('limiet'); e.limit = true; throw e; }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
/** Zoek de beste Nederlandse (anders Engelse) ondertitel; geeft { fileId, lang } of null. */
async function osFind(it, se, langs) {
  const title = cleanTitle(it.title);
  for (const lang of (langs || ['nl', 'en'])) {
    // ronde 1: strikt (met jaar, geen slechthorenden); ronde 2: ook slechthorenden; ronde 3 (films): ook zonder jaar (jaar in de lijst klopt vaak niet)
    const rounds = se && se.season != null ? [0, 1] : [0, 1, 2];
    for (const rnd of rounds) {
      const q = new URLSearchParams({ query: title, languages: lang, order_by: 'download_count', order_direction: 'desc', ai_translated: 'exclude', foreign_parts_only: 'exclude' });
      if (rnd === 0) q.set('hearing_impaired', 'exclude');
      if (se && se.season != null) { q.set('type', 'episode'); q.set('season_number', se.season); q.set('episode_number', se.ep); }
      else { q.set('type', 'movie'); if (it.year && rnd < 2) q.set('year', it.year); }
      const j = await osCall('/subtitles?' + q.toString());
      const hit = (j.data || []).find(d => d.attributes && d.attributes.files && d.attributes.files[0]);
      if (hit) return { fileId: hit.attributes.files[0].file_id, lang };
    }
  }
  return null;
}
const osKeyFor = (it, se, fmt, langs) => ['os', fmt, (langs || ['nl', 'en']).join(''), it.kind, cleanTitle(it.title).toLowerCase(), it.year || '', se ? se.season + 'x' + se.ep : ''].join('|');
/** fmt 'webvtt' (voor <track>) of 'srt' (externe speler). Resultaat: { link, lang } of { text, lang }. */
async function osGet(it, se, fmt, ignoreDutch, langs) {
  if (!osKeyVal() || state.settings.osMode === 'off' || !it || it.kind === 'live' || it.kind === 'catchup' || (!ignoreDutch && dutchOnlyItem(it))) return null;
  const k = osKeyFor(it, se, fmt, langs);
  const c = await IDB.get('http', k);
  if (fmt === 'webvtt' && c && c.v && c.v.text) return c.v;                       // al eens opgehaald: geen nieuwe download nodig
  if (fmt === 'srt' && c && c.v && c.v.link && Date.now() - c.t < 3 * 3600e3) return c.v;
  const f = await osFind(it, se, langs); if (!f) return null;
  const d = await osCall('/download', { file_id: f.fileId, sub_format: fmt });
  if (!d.link) return null;
  let v = { lang: f.lang, link: d.link };
  if (fmt === 'webvtt') { const r = await withTimeout(fetch(px(d.link), { cache: 'no-store' }), 15000); if (!r.ok) throw new Error('HTTP ' + r.status); v = { lang: f.lang, text: await r.text() }; }
  IDB.set('http', k, { v, t: Date.now() });
  return v;
}
const epInfo = (eps, cur) => { const e = eps && eps.find(x => x.url === cur); return e && e.season != null ? { season: e.season, ep: e.ep } : null; };
let osLimitToasted = false;
function osError(e) {
  if (e && e.limit) { if (!osLimitToasted) { osLimitToasted = true; toast('OpenSubtitles: daglimiet bereikt', 3500); } }
  else if (e && e.message !== 'geen sleutel') console.warn('OpenSubtitles', e);
}
// ---------- Audiospoor + ondertitels kiezen (ingebouwde speler) ----------
// Volgorde: 1) sporen die in de stream zelf zitten  2) pas als daar niets bruikbaars is: OpenSubtitles.
//  Audio:  gewone titels  → Engels, anders Nederlands;  kinder-titels → Nederlands, anders Engels.
//  Ondertitels: bij Nederlandse audio geen; anders Nederlands, anders Engels.
const RE_NL = /^(nl|nld|dut)(\b|[-_])|dutch|nederl|vlaams|flemish/i;
const RE_EN = /^(en|eng)(\b|[-_])|english|engels/i;
const KIDS_RE = /kinder|kids|children|jeugd|famil|animat|cartoon|junior|peuter|nickelodeon|disney|pixar/i;
const isKids = it => !!it && KIDS_RE.test([it.cat, (it.genres || []).join(' '), it.title].join(' '));
const trackText = t => [t.language, t.lang, t.label, t.name, t.id].filter(x => typeof x === 'string').join(' ');
const langClass = t => !t ? 'unknown' : RE_NL.test(trackText(t)) ? 'nl' : RE_EN.test(trackText(t)) ? 'en' : (t.language || t.lang) && !/^(und|unk)/i.test(t.language || t.lang) ? 'other' : 'unknown';
const pickByLang = (tracks, order) => { for (const re of order) { const i = [...tracks].findIndex(t => re.test(trackText(t))); if (i >= 0) return i; } return -1; };
const textTracksOf = v => [...v.textTracks].filter(t => t.kind === 'subtitles' || t.kind === 'captions');

/** Past audio + ondertitels toe op wat de stream aanbiedt. Geeft { audio, subs } terug ('nl'|'en'|'other'|'unknown' / aantal NL/EN-ondertitels). */
function applyMediaPrefs(v, it) {
  const kids = isKids(it), order = kids ? [RE_NL, RE_EN] : [RE_EN, RE_NL];
  let audio = 'unknown', audioSeen = false;
  if (hls && hls.audioTracks && hls.audioTracks.length) {
    audioSeen = true;
    const i = hls.audioTracks.length > 1 ? pickByLang(hls.audioTracks, order) : -1;
    if (i >= 0 && hls.audioTrack !== i) hls.audioTrack = i;
    audio = langClass(hls.audioTracks[i >= 0 ? i : Math.max(0, hls.audioTrack)]);
  } else if (v.audioTracks && v.audioTracks.length) {
    audioSeen = true;
    const at = [...v.audioTracks], i = at.length > 1 ? pickByLang(at, order) : -1;
    if (i >= 0) at.forEach((t, n) => { t.enabled = n === i; });
    audio = langClass(at[i >= 0 ? i : Math.max(0, at.findIndex(t => t.enabled))]);
  }
  // ondertitels
  const srcTracks = hls && hls.subtitleTracks && hls.subtitleTracks.length ? hls.subtitleTracks : null;
  const tt = textTracksOf(v);
  const pool = srcTracks || tt;
  const si = pickByLang(pool, [RE_NL, RE_EN]);
  const useful = pool.length ? [...pool].filter(t => RE_NL.test(trackText(t)) || RE_EN.test(trackText(t))).length : 0;
  if (audio === 'nl') {                                  // Nederlandse audio: geen ondertitels nodig
    if (srcTracks) { hls.subtitleTrack = -1; } else tt.forEach(t => { t.mode = 'disabled'; });
  } else if (si >= 0) {
    if (srcTracks) { hls.subtitleTrack = si; hls.subtitleDisplay = true; }
    else tt.forEach((t, n) => { t.mode = n === si ? 'showing' : 'disabled'; });
  }
  if (!audioSeen && !srcTracks && !tt.length && playCtx && !playCtx.noTrackToast && !window.__noTrackToast) {
    playCtx.noTrackToast = window.__noTrackToast = true;
    toast('De ingebouwde speler ziet bij deze stream geen audio-/ondertitelsporen. Kies voor sporenkeuze een externe speler (↗).', 5000);
  }
  const nlSubs = pool.length ? [...pool].filter(t => RE_NL.test(trackText(t))).length : 0;
  const res = { audio, subs: useful, nlSubs };
  if (playCtx) playCtx.mp = res;
  return res;
}
function setupSubs(v, it) {
  if (!it || it.kind === 'live') return;
  let timer; const run = () => { clearTimeout(timer); timer = setTimeout(() => { try { applyMediaPrefs(v, it); } catch {} }, 80); };
  try { v.textTracks.onaddtrack = run; } catch {}
  try { if (v.audioTracks) v.audioTracks.onaddtrack = run; } catch {}
  v.addEventListener('loadedmetadata', run, { once: true });
  v.addEventListener('playing', run, { once: true });
  if (hls && window.Hls) for (const ev of ['MANIFEST_PARSED', 'AUDIO_TRACKS_UPDATED', 'SUBTITLE_TRACKS_UPDATED']) hls.on(Hls.Events[ev], run);
}
/** Laatste redmiddel: pas als er na een tijdje echt geen NL/EN-ondertitel in de stream zit (en de audio niet Nederlands is). */
function osForPlayer(v, it, key) {
  if (!osKeyVal() || state.settings.osMode === 'off' || !it || it.kind === 'live' || it.kind === 'catchup') return;
  setTimeout(async () => {
    if (!playCtx || playCtx.key !== key) return;
    let mp; try { mp = applyMediaPrefs(v, it); } catch { mp = playCtx.mp || { audio: 'unknown', subs: 0 }; }
    if (mp.nlSubs > 0) return;                                            // de stream heeft zelf een Nederlandse ondertitel
    if (mp.audio === 'nl') return;                                        // Nederlandse audio
    if (mp.audio === 'unknown' && dutchOnlyItem(it)) return;               // niets bekend, categorie is Nederlands
    if (!playCtx || playCtx.key !== key || v.paused && v.currentTime < 1 && v.readyState < 2) return;
    try {
      // geen Nederlandse ondertitel in de stream → altijd Nederlands ophalen (ook als er al een Engelse is); Engels alleen als er helemaal niets is
      const r = await osGet(it, epInfo(playCtx.eps, playCtx.cur), 'webvtt', true, mp.subs > 0 ? ['nl'] : ['nl', 'en']); if (!r || !r.text) return;
      if (!playCtx || playCtx.key !== key) return;
      const tr = document.createElement('track');
      tr.kind = 'subtitles'; tr.label = r.lang === 'nl' ? 'Nederlands' : 'English'; tr.srclang = r.lang;
      tr.src = URL.createObjectURL(new Blob([r.text], { type: 'text/vtt' }));
      v.querySelectorAll('track').forEach(t => t.remove());
      textTracksOf(v).forEach(t => { t.mode = 'disabled'; });
      v.appendChild(tr); tr.track.__os = true; tr.track.mode = 'showing'; tr.default = true;
      toast('Ondertitels (OpenSubtitles): ' + tr.label, 2500);
    } catch (e) { osError(e); }
  }, 9000);
}
function fail(it, url, text) {
  const msg = $('#pMsg'); msg.hidden = false;
  msg.innerHTML = esc(text) + `<br><br><button class="btn primary" id="pExt">↗ Open in ${esc(extName())}</button> <button class="btn" id="pCopy">Kopieer link</button>`;
  $('#pCopy').onclick = () => navigator.clipboard.writeText(url).then(() => toast('Link gekopieerd'));
  $('#pExt').onclick = () => { const t = $('#pTitle').textContent, c = playCtx && playCtx.it ? { it: playCtx.it, eps: playCtx.eps, cur: playCtx.cur, zap: playCtx.zap } : null; stopPlayback(); openExternal(url, t, c); };
  if (playCtx && playCtx.zap) {
    msg.insertAdjacentHTML('beforeend', ' <button class="btn" id="pSkip">▲ Volgende zender</button>');
    $('#pSkip').onclick = () => zapTo(1);
  }
  if (it && it.kind === 'live' && it.statusKey) { setStatus(it.statusKey, 'dead'); onStatus(it); }
}
// ---------- Externe speler ----------
const ANDROID_PLAYERS = [
  ['chooser', 'Vraag elke keer (kiezer)', ''], ['vlc', 'VLC', 'org.videolan.vlc'], ['mx', 'MX Player', 'com.mxtech.videoplayer.ad'],
  ['mxpro', 'MX Player Pro', 'com.mxtech.videoplayer.pro'], ['just', 'Just Player', 'com.brouken.player'], ['mpv', 'mpv', 'is.xyz.mpv'],
  ['kodi', 'Kodi', 'org.xbmc.kodi'], ['tivimate', 'TiviMate', 'ar.tvplayer.tv'], ['custom', 'Andere app (pakketnaam)…', ''],
];
const isAndroid = /Android/i.test(navigator.userAgent);
const extMode = () => (ENV.cap || isAndroid ? 'android' : ENV.electron ? 'windows' : 'web');
function androidPkg() {
  const e = state.settings.ext;
  if (e.app === 'custom') return e.pkg.trim();
  return (ANDROID_PLAYERS.find(p => p[0] === e.app) || ANDROID_PLAYERS[0])[2];
}
function extName() {
  const e = state.settings.ext, m = extMode();
  if (m === 'android') return e.app === 'custom' ? (e.pkg || 'externe app') : e.app === 'chooser' ? 'externe app' : (ANDROID_PLAYERS.find(p => p[0] === e.app) || [, 'externe app'])[1];
  if (m === 'windows') return e.winPath ? e.winPath.split(/[\\/]/).pop().replace(/\.exe$/i, '').replace(/^vlc$/i, 'VLC') : 'externe speler';
  return 'externe speler';
}
const extPlugin = () => window.Capacitor && ((window.Capacitor.Plugins || {}).ExternalPlayer ||
  (window.Capacitor.registerPlugin && window.Capacitor.registerPlugin('ExternalPlayer')));

// ---------- Programmagids (EPG) + terugkijken ----------
const epgCache = new Map();
const b64txt = t => {
  if (!t || /[^A-Za-z0-9+/=]/.test(t) || t.length % 4) return t || '';
  try { const d = decodeURIComponent(escape(atob(t))); return /[\u0000-\u0008\uFFFD]/.test(d) ? t : d; } catch { return t; }
};
async function epgFor(it) {
  const sub = it.subRef; if (!sub || it.xid == null) return [];
  const key = sub.id + ':' + it.xid, c = epgCache.get(key);
  if (c && Date.now() - c.t < 5 * 60e3) return c.list;
  const x = xt(sub); let rows = [];
  try { const j = await http(x.api('get_simple_data_table') + '&stream_id=' + it.xid, { type: 'json', timeout: 25000 }); rows = (j && j.epg_listings) || []; } catch {}
  if (!rows.length) { try { const j = await http(x.api('get_short_epg') + '&stream_id=' + it.xid + '&limit=60', { type: 'json', timeout: 20000 }); rows = (j && j.epg_listings) || []; } catch {} }
  const ts = (n, str) => +n || (str ? Date.parse(String(str).replace(' ', 'T')) / 1000 : 0);
  const list = rows.map(r => ({ title: b64txt(r.title), desc: b64txt(r.description), start: ts(r.start_timestamp, r.start), stop: ts(r.stop_timestamp, r.end), startStr: r.start || '' }))
    .filter(p => p.title && p.start && p.stop > p.start).sort((a, b) => a.start - b.start);
  epgCache.set(key, { t: Date.now(), list });
  return list;
}
const pad2 = n => String(n).padStart(2, '0');
function catchupUrl(it, p) {
  const x = xt(it.subRef);
  let st = /^\d{4}-\d\d-\d\d \d\d:\d\d/.test(p.startStr) ? p.startStr.slice(0, 10) + ':' + p.startStr.slice(11, 13) + '-' + p.startStr.slice(14, 16)
    : (d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}:${pad2(d.getHours())}-${pad2(d.getMinutes())}`)(new Date(p.start * 1000));
  const mins = Math.max(1, Math.ceil((p.stop - p.start) / 60));
  return `${x.base}/timeshift/${encodeURIComponent(it.subRef.user)}/${encodeURIComponent(it.subRef.pass)}/${mins}/${st}/${it.xid}.${state.settings.catchupExt || 'm3u8'}`;
}
const dayKey = t => { const d = new Date(t * 1000); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const hhmm = t => { const d = new Date(t * 1000); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
const dayLabel = k => {
  const today = dayKey(Date.now() / 1000), yest = dayKey(Date.now() / 1000 - 86400), tom = dayKey(Date.now() / 1000 + 86400);
  if (k === today) return 'Vandaag'; if (k === yest) return 'Gisteren'; if (k === tom) return 'Morgen';
  const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
};
let epgState = null;
async function openEpg(it) {
  rememberFocus('epgView');
  epgState = { it, list: [], day: null, token: Date.now() };
  $('#epgTitle').textContent = '📅 ' + it.title;
  $('#epgNow').textContent = 'Gids laden…'; $('#epgDays').innerHTML = ''; $('#epgList').innerHTML = '';
  $('#epgView').hidden = false;
  const st = epgState;
  const list = await epgFor(it);
  if (epgState !== st) return;
  st.list = list;
  const now = Date.now() / 1000;
  if (!list.length) { $('#epgNow').textContent = 'Geen programmagids beschikbaar voor deze zender.'; return; }
  const cur = list.find(p => p.start <= now && p.stop > now), nxt = list.find(p => p.start > now);
  $('#epgNow').textContent = (cur ? `Nu: ${cur.title} (${hhmm(cur.start)}–${hhmm(cur.stop)})` : '') + (nxt ? `${cur ? ' · ' : ''}Straks: ${nxt.title} (${hhmm(nxt.start)})` : '') +
    (it.arch ? ` · terugkijken ${it.archDays ? 'tot ' + it.archDays + ' dag' + (it.archDays === 1 ? '' : 'en') + ' geleden' : 'beschikbaar'}` : ' · deze zender biedt geen terugkijken');
  const days = [...new Set(list.map(p => dayKey(p.start)))];
  st.day = days.includes(dayKey(now)) ? dayKey(now) : days[days.length - 1];
  st.days = days; renderEpg();
}
function archiveOK(it, p) {
  const now = Date.now() / 1000;
  return !!it.arch && p.stop <= now + 60 && (!it.archDays || p.start > now - it.archDays * 86400 - 3600);
}
function renderEpg() {
  const st = epgState; if (!st) return;
  const { it, list } = st, now = Date.now() / 1000;
  $('#epgDays').innerHTML = st.days.map(k => `<button class="btn${k === st.day ? ' primary' : ''}" data-day="${k}">${dayLabel(k)}</button>`).join('');
  const rows = list.map((p, i) => ({ p, i })).filter(x => dayKey(x.p.start) === st.day);
  $('#epgList').innerHTML = rows.map(({ p, i }) => {
    const live = p.start <= now && p.stop > now, past = p.stop <= now, ok = archiveOK(it, p);
    const act = live ? `<button class="btn primary" data-live="1">● Live</button>${ok || it.arch ? `<button class="btn" data-cu="${i}">⏮ Vanaf begin</button>` : ''}`
      : past ? (ok ? `<button class="btn primary" data-cu="${i}">⏪ Terugkijken</button>` : '<span class="epg-na">niet beschikbaar</span>') : '<span class="epg-na">straks</span>';
    return `<div class="epg-row${live ? ' now' : ''}${past && !ok ? ' gone' : ''}"><span class="epg-t">${hhmm(p.start)}</span>
      <div class="epg-m"><div class="epg-n">${esc(p.title)}</div>${p.desc ? `<div class="epg-d">${esc(p.desc.slice(0, 220))}</div>` : ''}</div><div class="epg-a">${act}</div></div>`;
  }).join('') || '<p class="hint">Niets voor deze dag.</p>';
  const nowRow = $('#epgList .now'); if (nowRow) nowRow.scrollIntoView({ block: 'center' });
}
$('#epgView').addEventListener('click', e => {
  const st = epgState; if (!st) return;
  const d = e.target.closest('[data-day]'); if (d) { st.day = d.dataset.day; renderEpg(); return; }
  if (e.target.closest('[data-live]')) { $('#epgView').hidden = true; if (!$('#player').hidden) stopPlayback(false); playAuto(st.it.url, st.it.title, st.it); return; }
  const c = e.target.closest('[data-cu]'); if (!c) return;
  const p = st.list[+c.dataset.cu]; if (!p) return;
  const it = { ...st.it, kind: 'catchup', uid: 'cu' + hashStr(st.it.url + p.start), title: `${st.it.title} — ${p.title}` };
  $('#epgView').hidden = true;
  playAuto(catchupUrl(st.it, p), it.title, it);
});
$('#pEpg').onclick = () => { if (playCtx && playCtx.it && playCtx.it.xid != null) openEpg(playCtx.it); };

// ---------- Casten naar Chromecast / Google TV (Android-app) ----------
let castOK = false, castState = { connected: false }, castCtx = null, castLastSave = 0;
const castPlug = () => window.Capacitor && window.Capacitor.registerPlugin && (castPlug._p || (castPlug._p = window.Capacitor.registerPlugin('KdCast')));
const castType = url => isHls(url) ? 'application/x-mpegURL' : ({ mkv: 'video/x-matroska', webm: 'video/webm', ts: 'video/mp2t', m3u8: 'application/x-mpegURL' })[(url.split('?')[0].match(/\.(\w{2,4})$/) || [])[1]] || 'video/mp4';
async function castInit() {
  if (!ENV.cap || isTV()) return;
  const p = castPlug(); if (!p) return;
  try {
    p.addListener('castState', onCastState);
    const r = await p.init();
    if (r && r.available) { castOK = true; document.body.classList.add('can-cast'); }
  } catch { /* oude build zonder Cast of geen Play Services: geen cast-knoppen */ }
}
function castPlay(url, title, it, eps, cur) {
  const p = castPlug(); if (!castOK || !p) return toast('Casten is op dit apparaat niet beschikbaar', 3000);
  if (!$('#player').hidden) stopPlayback();
  noteWatched(it);
  const live = !!(it && it.kind === 'live');
  castCtx = { url, title, it, eps, cur: cur || url, done: false };
  p.start({ url, title, poster: it && it.poster || '', live, position: live ? 0 : Math.round(getPos(url) * 1000), contentType: castType(url) })
    .then(() => { if (!castState.connected) toast('Kies je tv in de lijst…', 3000); else toast('Cast gestart op ' + (castState.name || 'tv'), 2500); })
    .catch(e => toast('Casten mislukt' + (e && e.message ? ': ' + e.message : ''), 3500));
}
function onCastState(st) {
  castState = st || { connected: false };
  const bar = $('#castBar');
  const show = castState.connected && castCtx;
  bar.hidden = !show;
  if (!show) { if (!castState.connected) castCtx = null; return; }
  $('#castName').textContent = '📺 ' + (castState.name || 'tv');
  $('#castTitle').textContent = castCtx.title || '';
  $('#castTime').textContent = castState.dur > 0 ? fmtT(castState.pos / 1000) + ' / ' + fmtT(castState.dur / 1000) : (castState.state === 'buffering' ? '…' : '');
  $('#castToggle').textContent = castState.state === 'playing' ? '⏸' : '▶';
  const same = castState.url && castState.url === castCtx.url;
  if (same && !(castCtx.it && castCtx.it.kind === 'live') && castState.state !== 'idle') {
    const n = Date.now(); if (n - castLastSave > 10000 && castState.pos > 0) { castLastSave = n; savePos(castCtx.url, castState.pos / 1000, castState.dur / 1000); }
  }
  if (same && castState.finished && !castCtx.done) {
    castCtx.done = true; clearPos(castCtx.url);
    const eps = castCtx.eps; const i = eps ? eps.findIndex(e => e.url === castCtx.cur) : -1;
    if (i >= 0 && eps[i + 1]) { const nx = eps[i + 1]; castPlay(nx.url, `${castCtx.it.title} — ${nx.title}`, castCtx.it, eps, nx.url); }
  }
}
const castCtl = (action, ms) => { const p = castPlug(); if (p) p.control({ action, ms: ms || 0 }).catch(() => {}); };
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cast]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const url = b.dataset.cast, m = dlMeta.get(url);
  if (m) castPlay(url, m.title, m.it, m.eps, url);
}, true);


// ---------- Ingebouwde speler: mpv (Windows: meegeleverd; Android: libmpv in de app) ----------
let mpvOk = false, mpvList = null, mpvPlug = null;
const mpvPluginOf = () => window.Capacitor && window.Capacitor.registerPlugin && (mpvPluginOf._p || (mpvPluginOf._p = window.Capacitor.registerPlugin('KdMpv')));
if (ENV.electron && window.kdNative && window.kdNative.mpvAvailable) {
  window.kdNative.mpvAvailable().then(v => { mpvOk = !!v; }).catch(() => {});
  window.kdNative.onMpv(m => {
    if (!mpvList) return;
    const x = mpvList[m.idx];
    if (m.type === 'pos' && x && !mpvList.live && m.pos > 0) savePos(x.key, m.pos, m.dur);
    else if (m.type === 'eof' && x && !mpvList.live) clearPos(x.key);
    else if (m.type === 'item' && mpvList[m.idx]) { toast('Volgende: ' + mpvList[m.idx].title, 3000); if (mpvList.it) noteWatched(mpvList.it); }
    else if (m.type === 'needSub') mpvNeedSub(m, (u, lang) => window.kdNative.mpvSub(u, lang));
    else if (m.type === 'closed') { mpvList = null; refreshHist(); }
  });
} else if (ENV.cap && mpvPluginOf()) {
  try {
    mpvPlug = mpvPluginOf();
    mpvPlug.available().then(r => { mpvOk = !!(r && r.ok); }).catch(() => {});
    mpvPlug.addListener('needSub', m => mpvNeedSub(m, (u, lang) => mpvPlug.addSub({ url: u, lang })));
  } catch {}
}
/** mpv/libmpv meldt: geen Nederlandse ondertitel in de stream -> ophalen bij OpenSubtitles en toevoegen */
async function mpvNeedSub(m, add) {
  const x = mpvList && mpvList[m.idx]; if (!x || !mpvList.it || mpvList.live) return;
  try {
    const r = await osGet(mpvList.it, epInfo(mpvList.eps, x.key), 'srt', true, m.other ? ['nl'] : ['nl', 'en']);
    if (r && r.link) { await add(r.link, r.lang); toast('Ondertitel (OpenSubtitles): ' + (r.lang === 'nl' ? 'Nederlands' : 'English'), 2500); }
  } catch (e) { osError(e); }
}
if (ENV.cap) { const r = document.getElementById('rowBuiltin'); if (r) r.style.display = 'none'; }
let mpvSkip = false;
const mpvOn = () => ENV.cap ? !!mpvPlug : mpvOk && !mpvSkip && state.settings.builtin !== 'chromium';   // Android: nooit de webspeler
async function playMpv(url, title, it, eps, cur, zap, fromStart) {
  noteWatched(it);
  const ctx = it ? { it, eps, cur: cur || url, zap } : null;
  const q = extQueue(url, title, ctx);
  const live = !!(q.live || (it && it.kind === 'live'));
  mpvList = q.map(x => ({ key: x.url, title: x.title })); mpvList.eps = eps; mpvList.live = live; mpvList.it = it;
  const starts = q.map((x, i) => live || (fromStart && i === 0) ? 0 : getPos(x.url));
  const fallback = msg => {
    mpvList = null;
    if (ENV.cap) {   // Android: geen webspeler; meld precies wat er mis is en bied een externe speler aan
      if (confirm('De ingebouwde speler (mpv) kon niet starten:\n' + (msg || 'onbekende fout') + '\n\nOpenen in een externe speler?')) openExternal(url, title, ctx, fromStart);
      return;
    }
    mpvSkip = true; try { toast((msg || 'Speler starten mislukt') + ' - eenvoudige speler gebruikt', 3500); play(url, title, it, eps, cur, zap, fromStart); } finally { mpvSkip = false; }
  };
  if (mpvPlug) {
    try {
      const r = await mpvPlug.play({ urls: q.map(x => dlExt(x.url)), titles: q.map(x => x.title), starts, idx: 0, kids: isKids(it), live });
      if (r && r.error) return fallback(r.error);
      for (const p of (r && r.progress) || []) {
        const x = mpvList && mpvList[p.i]; if (!x || live) continue;
        if (p.done) clearPos(x.key); else if (p.pos > 0) savePos(x.key, p.pos, p.dur);
      }
      mpvList = null; refreshHist();
    } catch (e) { fallback(e && e.message); }
    return;
  }
  const r = await window.kdNative.mpvPlay({
    url: dlExt(url), title, playlist: q.map(x => ({ ...x, url: dlExt(x.url) })), starts, kids: isKids(it), live,
  }).catch(e => ({ ok: false, msg: e.message }));
  if (!r.ok) fallback(r.msg);
}
function playAuto(url, title, it, eps, cur, zap, fromStart) {
  noteWatched(it);
  if (state.settings.ext.always) openExternal(url, title, it ? { it, eps, cur: cur || url, zap } : null, fromStart); else play(url, title, it, eps, cur, zap, fromStart);
}

/** Wachtrij voor een externe speler: gekozen aflevering + alle volgende (zodat de speler zelf doorgaat). */
function extQueue(url, title, ctx) {
  if (ctx && ctx.zap && ctx.zap.length > 1) { // zenders: huidige eerst, daarna de rest van de groep (volgende/vorige in de speler = zappen)
    const i = Math.max(0, ctx.zap.indexOf(ctx.it));
    const q = ctx.zap.slice(i).concat(ctx.zap.slice(0, i)).slice(0, 300).map(c => ({ url: c.url, title: c.title }));
    q.live = true; return q;
  }
  if (ctx && ctx.eps && ctx.eps.length) {
    const i = ctx.eps.findIndex(e => e.url === ctx.cur);
    if (i >= 0) return ctx.eps.slice(i, i + 300).map(e => ({ url: e.url, title: `${ctx.it.title} — ${e.title}` }));
  }
  return [{ url, title }];
}

async function openExternal(url, title = '', ctx = null, fromStart = false) {
  const m = extMode(), list = extQueue(url, title, ctx);
  // ondertitel (NL, anders EN) voor de eerste titel, via OpenSubtitles; mag het starten niet te lang ophouden
  let subUrl = '';
  if (ctx && ctx.it && !list.live && osKeyVal() && state.settings.osMode !== 'off' && !dutchOnlyItem(ctx.it) && (m === 'android' || (m === 'windows' && list.length === 1))) {
    toast('Ondertitels zoeken…', 2000);
    try { const r = await Promise.race([osGet(ctx.it, epInfo(ctx.eps, list[0].url), 'srt'), new Promise(res => setTimeout(() => res(null), 9000))]); if (r && r.link) subUrl = r.link; }
    catch (e) { osError(e); }
  }
  if (m === 'android' && ENV.cap) {
    const pkg = androidPkg(), plug = extPlugin();
    if (!plug) return toast('Externe speler niet beschikbaar in deze versie');
    try {
      // Spelers die een afspeellijst begrijpen (MX Player) krijgen alles in één keer; bij de rest
      // start Kijkdoos de volgende aflevering zodra de speler meldt dat de vorige uit is.
      for (let i = 0; i < list.length;) {
        const live = list.live || (ctx && ctx.it && ctx.it.kind === 'live');
        const start = live || (fromStart && i === 0) ? 0 : getPos(list[i].url);
        const r = await plug.open({ url: dlExt(list[i].url), title: list[i].title, package: pkg, urls: list.slice(i).map(x => dlExt(x.url)), titles: list.slice(i).map(x => x.title), position: Math.round(start * 1000), subUrl: i === 0 ? subUrl : '' });
        // onthoud waar je gestopt bent (bij een afspeellijst in de speler zelf weten we niet welk item het was)
        if (!live && (!r.playlist || list.length === 1) && r.position > 0) { if (r.completed) clearPos(list[i].url); else savePos(list[i].url, r.position / 1000, r.duration > 0 ? r.duration / 1000 : 0); }
        if (list.length < 2 || r.playlist || list.live) break;                 // speler regelt het zelf / geen serie
        if (r.completed) { i++; if (i < list.length) toast('Volgende: ' + list[i].title, 3000); continue; }
        if (r.known) break;                                        // vroegtijdig gestopt door jou
        if (i + 1 < list.length && confirm('Volgende aflevering afspelen?\n' + list[i + 1].title)) { i++; continue; }
        break;
      }
    } catch (e) {
      const code = (e && e.code) || '';
      if (pkg && code === 'NOT_INSTALLED') {
        if (confirm(`${extName()} is niet geïnstalleerd. Openen in de Play Store?`)) plug.openStore({ package: pkg }).catch(() => {});
      } else if (pkg && code === 'OPEN_FAILED') {
        // speler is er wel, maar wil dit adres niet via een gericht verzoek: laat Android een speler kiezen
        toast(`${extName()} wil deze stream niet direct openen — kies een speler`, 3500);
        plug.open({ url: list[0].url, title: list[0].title, package: '' }).catch(() => toast('Kon geen speler openen'));
      } else toast('Kon externe speler niet openen' + (e && e.message ? ': ' + e.message : ''), 4000);
    }
    return;
  }
  if (m === 'android') { // browser op Android: intent-link
    const u = new URL(url), pkg = androidPkg();
    location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};type=video/*;` +
      (pkg ? `package=${pkg};` : '') + `S.title=${encodeURIComponent(title)};end`;
    return;
  }
  if (m === 'windows' && window.kdNative) {
    let path = state.settings.ext.winPath;
    if (!path) {
      const found = await window.kdNative.detectPlayers().catch(() => []);
      if (found.length) { path = state.settings.ext.winPath = found[0].path; saveSettings(); }
    }
    if (!path) { toast('Kies eerst een externe speler bij ⚙ Instellingen'); renderSettings(); $('#settings').hidden = false; return; }
    const r = await window.kdNative.openPlayer({ path, args: state.settings.ext.winArgs, url: dlExt(url), title, playlist: list.map(x => ({ ...x, url: dlExt(x.url) })), subUrl, kids: isKids(ctx && ctx.it), live: !!(list.live || (ctx && ctx.it && ctx.it.kind === 'live')) }).catch(e => ({ ok: false, msg: e.message }));
    if (!r.ok) toast('Openen mislukt: ' + (r.msg || 'onbekende fout'), 4000); else toast('Geopend in ' + extName() + (list.length > 1 ? (list.live ? ' — volgende zender: toets “volgende” in de speler' : ' — volgende afleveringen spelen automatisch') : ''));
    return;
  }
  // Browser op de computer: playlistbestand downloaden, opent in je standaard mediaspeler (bijv. VLC)
  const blob = new Blob(['#EXTM3U\n' + list.map(x => `#EXTINF:-1,${x.title}\n${x.url}\n`).join('')], { type: 'audio/x-mpegurl' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = (title || 'stream').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80) + '.m3u'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Playlist gedownload — open hem met VLC of je standaardspeler', 4000);
}

function clearSubTracks(v) {
  v.querySelectorAll('track').forEach(t => { try { if (String(t.src).startsWith('blob:')) URL.revokeObjectURL(t.src); } catch {} t.remove(); });
  try { [...v.textTracks].forEach(t => { t.mode = 'disabled'; }); } catch {}
  v.textTracks.onaddtrack = null;
}
function stopPlayback(hide = true) {
  const v = $('#video');
  clearSubTracks(v);
  if (hide) flushPos();
  if (hls) { hls.destroy(); hls = null; }
  v.onerror = null; v.pause(); v.removeAttribute('src'); v.load();
  if (hide) {
    $('#player').hidden = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch {}
    $('#pList').hidden = true; returnFocus('player');
  }
}
function poke() { const p = $('#player'); p.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => p.classList.add('idle'), 3000); }
['mousemove', 'touchstart', 'keydown'].forEach(ev => $('#player').addEventListener(ev, poke));
$('#pClose').onclick = () => stopPlayback();
$('#pCast').onclick = () => { if (playCtx && playCtx.cur) castPlay(playCtx.cur, $('#pTitle').textContent, playCtx.it, playCtx.eps, playCtx.cur); };
$('#castToggle').onclick = () => castCtl('toggle');
$('#castBack').onclick = () => castCtl('seekBy', -30000);
$('#castFwd').onclick = () => castCtl('seekBy', 30000);
$('#castStop').onclick = () => { castCtl('stop'); castCtl('disconnect'); };
$('#castDev').onclick = () => { if (castCtx) { const p = castPlug(); if (p) p.start({ url: castCtx.url, title: castCtx.title, poster: castCtx.it && castCtx.it.poster || '', live: !!(castCtx.it && castCtx.it.kind === 'live'), position: Math.round((castState.pos || 0)), contentType: castType(castCtx.url), choose: true }).catch(() => {}); } };

// ---------- Zappen (live TV) ----------
function zapTo(d, toIndex) {
  const z = playCtx && playCtx.zap; if (!z) return false;
  let n = toIndex != null ? toIndex : z.indexOf(playCtx.it);
  if (toIndex == null) {
    if (n < 0) n = d > 0 ? -1 : 0;
    for (let k = 0; k < z.length; k++) { n = (n + d + z.length) % z.length; if (itemStatus(z[n]) !== 'dead') break; }
  }
  const c = z[n]; if (!c || c === playCtx.it) return false;
  play(c.url, c.title, c, null, null, z);
  return true;
}
function openZapList() {
  const z = playCtx && playCtx.zap; if (!z) return;
  const box = $('#pList');
  box.innerHTML = '<div class="pl-head">Zenders</div>' + z.map((c, i) =>
    `<button class="zi${c === playCtx.it ? ' cur' : ''}${itemStatus(c) === 'dead' ? ' dead' : ''}" data-i="${i}"><span class="zn">${i + 1}</span>${c.poster ? `<img loading="lazy" src="${esc(c.poster)}" alt="" onerror="this.remove()">` : ''}<span class="zt">${esc(c.title)}</span></button>`).join('');
  box.hidden = false; poke();
  const cur = $('.cur', box) || $('.zi', box);
  if (cur) { cur.focus({ preventScroll: true }); cur.scrollIntoView({ block: 'center' }); }
}
function closeZapList(refocus = true) { $('#pList').hidden = true; if (refocus && isTV()) $('#player').focus(); }
$('#pList').addEventListener('click', e => {
  const b = e.target.closest('.zi'); if (!b) return;
  closeZapList(); zapTo(0, +b.dataset.i);
});
$('#pPrev').onclick = () => zapTo(-1);
$('#pNext').onclick = () => zapTo(1);
$('#pChan').onclick = () => ($('#pList').hidden ? openZapList() : closeZapList(false));
let digitBuf = '', digitT = null;
function zapDigit(dg) {
  digitBuf = (digitBuf + dg).slice(-3);
  const z = playCtx.zap; const z$ = $('#pNum'); z$.textContent = digitBuf; z$.hidden = false;
  clearTimeout(digitT);
  digitT = setTimeout(() => { z$.hidden = true; const n = +digitBuf - 1; digitBuf = ''; if (n >= 0 && n < z.length) zapTo(0, n); }, 1400);
}
// Voortgangsbalk + pauze-indicator (TV-modus heeft geen native bediening)
{
  const v = $('#video');
  const fmt = t => { t = Math.max(0, Math.floor(t)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
  const upd = () => {
    const live = !isFinite(v.duration) || !v.duration;
    $('#pBar').hidden = live || !isTV();
    if (live) return;
    $('#pFill').style.width = (v.currentTime / v.duration * 100) + '%';
    $('#pTime').textContent = fmt(v.currentTime) + ' / ' + fmt(v.duration);
  };
  v.addEventListener('timeupdate', upd); v.addEventListener('durationchange', upd);
  v.addEventListener('pause', () => { $('#pState').hidden = !isTV() || v.ended; poke(); });
  v.addEventListener('play', () => { $('#pState').hidden = true; });
  v.addEventListener('playing', () => { $('#pState').hidden = true; });
}
/** Afstandsbediening/toetsenbord in de speler. Geeft true terug als de toets is afgehandeld. */
function playerKey(e, tv) {
  if (!$('#pList').hidden) return false;                 // zenderlijst heeft de focus
  const v = $('#video'), z = playCtx && playCtx.zap;
  if (z && /^\d$/.test(e.key)) { zapDigit(e.key); e.preventDefault(); return true; }
  const seek = d => { if (isFinite(v.duration)) v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + d)); };
  switch (e.key) {
    case 'ChannelUp': case 'PageUp': case 'MediaTrackNext': if (z) zapTo(1); else if (e.key === 'MediaTrackNext') playAdjacent(1); else return false; break;
    case 'ChannelDown': case 'PageDown': case 'MediaTrackPrevious': if (z) zapTo(-1); else if (e.key === 'MediaTrackPrevious') playAdjacent(-1); else return false; break;
    case 'g': case 'G': case 'Guide': case 'Info': case 'ColorF2Yellow': if (playCtx && playCtx.it && playCtx.it.xid != null) openEpg(playCtx.it); else return false; break;
    case 'MediaPlayPause': v.paused ? v.play().catch(() => {}) : v.pause(); break;
    case 'MediaPlay': v.play().catch(() => {}); break;
    case 'MediaPause': v.pause(); break;
    default:
      if (!tv) return false;
      switch (e.key) {
        case 'ArrowUp': if (z) zapTo(1); break;
        case 'ArrowDown': if (z) zapTo(-1); break;
        case 'Enter': case ' ': if (z) openZapList(); else v.paused ? v.play().catch(() => {}) : v.pause(); break;
        case 'ArrowLeft': case 'MediaRewind': if (z) openZapList(); else seek(-10); break;
        case 'ArrowRight': case 'MediaFastForward': if (z) openZapList(); else seek(10); break;
        default: return false;
      }
  }
  poke(); e.preventDefault(); return true;
}
function playAdjacent(d) {
  if (!playCtx || !playCtx.eps) return false;
  const i = playCtx.eps.findIndex(e => e.url === playCtx.cur);
  const n = playCtx.eps[i + d]; if (!n) return false;
  play(n.url, `${playCtx.it.title} — ${n.title}`, playCtx.it, playCtx.eps, n.url);
  return true;
}

// ---------- Instellingen ----------
function renderSettings() {
  $('#setScan').checked = !!state.settings.scan; $('#setTV').value = state.settings.tvMode; $('#setTVScale').value = String(state.settings.tvScale);
  $('#setCache').checked = cacheOn(); $('#setCacheTTL').value = String(cacheTTL()); $('#setCacheTTL').disabled = !cacheOn();
  $('#setOmdb').value = state.settings.omdbKey || ''; $('#setOsKey').value = state.settings.osKey || ''; $('#setCatchup').value = state.settings.catchupExt || 'm3u8'; $('#setOsMode').value = state.settings.osMode || 'fallback'; if ($('#setBuiltin')) $('#setBuiltin').value = state.settings.builtin || 'mpv';
  $('#setProxy').value = state.settings.proxy || '';
  const e = state.settings.ext, m = extMode();
  $('#setExtAlways').checked = !!e.always;
  $('#extAndroid').hidden = m !== 'android'; $('#extWin').hidden = m !== 'windows'; $('#extWeb').hidden = m !== 'web';
  $('#setExtApp').innerHTML = ANDROID_PLAYERS.map(([id, n]) => `<option value="${id}" ${e.app === id ? 'selected' : ''}>${esc(n)}</option>`).join('');
  $('#setExtPkg').hidden = e.app !== 'custom'; $('#setExtPkg').value = e.pkg || '';
  $('#setWinPath').value = e.winPath || ''; $('#setWinArgs').value = e.winArgs || '';
  if (m === 'windows' && window.kdNative) window.kdNative.detectPlayers().then(list => {
    $('#winFound').innerHTML = list.length ? 'Gevonden: ' + list.map(p => `<button class="linkbtn" data-wp="${esc(p.path)}">${esc(p.name)}</button>`).join(' · ') : 'Geen bekende speler gevonden — kies zelf een .exe.';
  }).catch(() => {});
  $('#webOnly').hidden = ENV.native;
  $('#builtinList').innerHTML = BUILTIN.map(b => `<label class="toggle"><input type="checkbox" data-b="${b.id}" ${state.settings.builtin[b.id] ? 'checked' : ''}>
    <span>${esc(b.name)}<small>${esc(b.desc)}</small></span></label>`).join('');
  $('#subList').innerHTML = state.subs.length ? state.subs.map(s => {
    const st = state.subStatus[s.id] || { msg: s.enabled === false ? 'Uitgeschakeld' : '' };
    return `<div class="sub"><div class="grow"><div class="nm">${esc(s.name)} <small style="color:var(--mut)">${s.type === 'xtream' ? 'Xtream' : 'M3U'}</small></div>
      <div class="st ${st.ok === true ? 'ok' : st.ok === false ? 'bad' : ''}">${esc(st.msg || '')}</div></div>
      <button data-s="${s.id}" data-a="toggle">${s.enabled === false ? 'Aan' : 'Uit'}</button>
      <button data-s="${s.id}" data-a="reload">↻</button>
      <button data-s="${s.id}" data-a="del">🗑</button></div>`;
  }).join('') : '<p class="hint">Nog geen abonnementen. Voeg er hieronder een toe — wat werkt verschijnt automatisch bij Films, Series en Live TV.</p>';
  $('#envInfo').textContent = `Modus: ${ENV.cap ? (isTV() ? 'Android TV' : 'Android-app') : ENV.electron ? 'Windows-app' : 'Browser/PWA'} · native HLS: ${ENV.nativeHls ? 'ja' : 'nee'}\nVersie 1.3.0 · build ${window.KD_BUILD || '?'}`;
}

$('#settings').addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'setCache') { state.settings.cache.on = t.checked; saveSettings(); renderSettings(); if (!t.checked) { IDB.clear('http'); IDB.clear('avail'); IDB.clear('omdb'); } toast(t.checked ? 'Cache aan' : 'Cache uit en geleegd — alles realtime'); }
  if (t.id === 'setCacheTTL') { state.settings.cache.ttl = +t.value; saveSettings(); }
  if (t.id === 'setOsMode') { state.settings.osMode = t.value; saveSettings(); }
  if (t.id === 'setBuiltin') { state.settings.builtin = t.value; saveSettings(); }
  if (t.id === 'setCatchup') { state.settings.catchupExt = t.value; saveSettings(); }
  if (t.id === 'setOsKey') { state.settings.osKey = t.value.trim(); saveSettings(); }
  if (t.id === 'setOmdb') { state.settings.omdbKey = t.value.trim(); saveSettings(); omdbMem.clear(); }
  if (t.id === 'setTV') { state.settings.tvMode = t.value; LS.set('autoTV', false); autoTV = false; saveSettings(); applyTV(); }
  if (t.id === 'setTVScale') { state.settings.tvScale = +t.value; saveSettings(); setUnit(); }
  if (t.id === 'setScan') { state.settings.scan = t.checked; saveSettings(); render(); toast(t.checked ? 'Controle aan — alleen wat in beeld is' : 'Controle uit — alleen de index'); }
  if (t.dataset.b) { state.settings.builtin[t.dataset.b] = t.checked; saveSettings(); reloadSoon(); }
  if (t.id === 'setExtAlways') { state.settings.ext.always = t.checked; saveSettings(); }
  if (t.id === 'setExtApp') { state.settings.ext.app = t.value; saveSettings(); renderSettings(); }
  if (t.id === 'setExtPkg') { state.settings.ext.pkg = t.value.trim(); saveSettings(); }
  if (t.id === 'setWinPath') { state.settings.ext.winPath = t.value.trim().replace(/^"|"$/g, ''); saveSettings(); }
  if (t.id === 'setWinArgs') { state.settings.ext.winArgs = t.value; saveSettings(); }
  if (t.id === 'setProxy') { state.settings.proxy = t.value.trim(); saveSettings(); reloadSoon(); }
  if (t.name === 'stype') document.querySelectorAll('#subForm [data-for]').forEach(d => (d.hidden = d.dataset.for !== t.value));
});
$('#subList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const s = state.subs.find(x => x.id === b.dataset.s); if (!s) return;
  if (b.dataset.a === 'del') { if (!confirm(`Abonnement “${s.name}” verwijderen?`)) return; state.subs = state.subs.filter(x => x !== s); state.rows = state.rows.filter(r => r.src !== s.id); }
  if (b.dataset.a === 'toggle') { s.enabled = s.enabled === false; if (s.enabled) loadSub(s); else { state.rows = state.rows.filter(r => r.src !== s.id); delete state.subStatus[s.id]; } }
  if (b.dataset.a === 'reload') loadSub(s);
  saveSubs(); renderSettings(); scheduleRender();
});
$('#subForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(e.target), type = f.get('stype');
  const sub = { id: 's' + Date.now().toString(36), type, name: f.get('name').trim(), enabled: true };
  if (type === 'xtream') {
    sub.server = f.get('server').trim(); sub.user = f.get('user').trim(); sub.pass = f.get('pass');
    if (!/^https?:\/\//i.test(sub.server)) sub.server = 'http://' + sub.server;
    if (!sub.user || !sub.pass) return toast('Vul gebruikersnaam en wachtwoord in');
  } else {
    sub.url = f.get('url').trim();
    // Xtream-link geplakt als M3U? Haal de gegevens eruit voor een rijkere weergave.
    const m = sub.url.match(/^(https?:\/\/[^/]+)\/get\.php\?(.*)$/i);
    if (m) { const q = new URLSearchParams(m[2]); if (q.get('username') && q.get('password')) Object.assign(sub, { type: 'xtream', server: m[1], user: q.get('username'), pass: q.get('password') }); }
    if (!sub.url && sub.type === 'm3u') return toast('Vul een M3U-link in');
  }
  state.subs.push(sub); saveSubs(); e.target.reset();
  document.querySelectorAll('#subForm [data-for]').forEach(d => (d.hidden = d.dataset.for !== 'xtream'));
  loadSub(sub); toast('Abonnement toegevoegd — wordt gecontroleerd');
});
$('#settings').addEventListener('click', e => {
  const wp = e.target.closest('[data-wp]');
  if (wp) { state.settings.ext.winPath = wp.dataset.wp; saveSettings(); renderSettings(); }
});
$('#btnWinBrowse').onclick = async () => {
  if (!window.kdNative) return;
  const p = await window.kdNative.browsePlayer(); if (p) { state.settings.ext.winPath = p; saveSettings(); renderSettings(); }
};
$('#btnExtTest').onclick = () => openExternal('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'Kijkdoos testbeeld');
$('#btnRecheck').onclick = () => { avail.clear(); archiveCache.clear(); IDB.clear('http'); IDB.clear('avail'); loadAll(); toast('Index wordt opnieuw geladen'); };
$('#btnCacheClear').onclick = async () => { await Promise.all([IDB.clear('http'), IDB.clear('avail'), IDB.clear('omdb')]); avail.clear(); omdbMem.clear(); toast('Cache geleegd'); };
let reloadT; function reloadSoon() { clearTimeout(reloadT); reloadT = setTimeout(loadAll, 600); }

// ---------- Interactie ----------
$('#btnSettings').onclick = () => { rememberFocus('settings'); renderSettings(); $('#settings').hidden = false; if (isTV()) focusFirst($('#settings'), 'input,select'); };
document.addEventListener('click', e => {
  const close = e.target.closest('[data-close]');
  if (close) { closeLayer(close.closest('.modal,.overlay')); return; }
  if (e.target.classList.contains('modal')) { closeLayer(e.target); return; }
  const more = e.target.closest('.more, .rowlink');
  if (more) { openGrid(state.rows.find(r => r.id === more.dataset.row)); return; }
  const c = e.target.closest('[data-uid]');
  if (c && e.target.closest('[data-epgb]')) { const it = itemIndex.get(c.dataset.uid); if (it) openEpg(it); return; }
  if (c) { const it = itemIndex.get(c.dataset.uid); if (it) it.kind === 'live' && it.url ? playAuto(it.url, it.title, it, null, null, zapListFor(c, it)) : openDetail(it); }
});
/** De zenders waar je doorheen kunt zappen: de groep/rij waaruit je deze zender startte. */
function zapListFor(cardEl, it) {
  let list = null;
  if (cardEl.closest('#gridView')) list = gridState.list;
  else { const rowEl = cardEl.closest('.row'); list = rowEl && rowEl._rec ? rowEl._rec.list : null; }
  list = (list || []).filter(i => i.kind === 'live' && i.url && (i === it || itemStatus(i) !== 'dead'));
  return list.length > 1 ? list : null;
}
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.tab = b.dataset.tab; window.scrollTo(0, 0); render();
});
let qT; $('#q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); render(); }, 200); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' && e.key !== 'GoBack' && e.key !== 'BrowserBack') return;
  if (!$('#epgView').hidden) { closeLayer($('#epgView')); return; }
  if (!$('#player').hidden) { if (!$('#pList').hidden) return closeZapList(); return stopPlayback(); }
  if (!$('#catPop').hidden) { $('#catPop').hidden = true; $('#btnCats').focus({ preventScroll: true }); return; }
  if (!$('#langPop').hidden) { $('#langPop').hidden = true; $('#btnLang').focus({ preventScroll: true }); return; }
  for (const id of ['epgView', 'detail', 'settings', 'gridView', 'dlView']) if (!$('#' + id).hidden) { closeLayer($('#' + id)); return; }
});
// Android terugknop (Capacitor)
document.addEventListener('backbutton', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
if (ENV.cap && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
  window.Capacitor.Plugins.App.addListener('backButton', () => {
    const open = !$('#player').hidden || !$('#langPop').hidden || !$('#catPop').hidden || ['epgView', 'detail', 'settings', 'gridView', 'dlView'].some(id => !$('#' + id).hidden);
    if (open) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); else window.Capacitor.Plugins.App.exitApp();
  });
}

// ---------- TV / afstandsbediening ----------
let autoTV = !!(ENV.cap && LS.get('autoTV', false));
let touched = false;
function isTV() { return state.settings.tvMode === 'on' || (state.settings.tvMode === 'auto' && (ENV.tvUA || autoTV)); }
/** 1 'u' = één pixel op een 1080p-scherm, ook als de TV-webview maar ~960 css-pixels breed is. */
function setUnit() {
  const k = +state.settings.tvScale || 1;
  document.documentElement.style.setProperty('--u', (Math.max(320, window.innerWidth) / 1920 * k).toFixed(4) + 'px');
}
window.addEventListener('resize', setUnit);
function applyTV() {
  setUnit();
  document.body.classList.toggle('tv', isTV());
  $('#video').controls = !isTV();
  if (!$('#settings').hidden) renderSettings();
}
// Android-app waarin je pijltjestoetsen gebruikt zonder aanraking → TV-modus aan (en onthouden)
let lastTouch = 0, kbUsed = false;
document.addEventListener('touchstart', () => { touched = true; lastTouch = Date.now(); kbUsed = false; }, { capture: true, passive: true });
document.addEventListener('mousedown', () => { kbUsed = false; }, true);
document.addEventListener('keydown', e => {
  kbUsed = true;                                              // elke toets (ook 'Unidentified' van een afstandsbediening)
  if (!/^(Arrow|Enter|Dpad|Select)/.test(e.key)) return;
  // Android-app waarin je pijltjes gebruikt en al een tijd niet hebt aangeraakt → TV-modus (alleen blijvend als er nooit aangeraakt is)
  if (ENV.cap && !autoTV && state.settings.tvMode === 'auto' && /^Arrow/.test(e.key) && Date.now() - lastTouch > 60000) {
    autoTV = true; if (!touched) LS.set('autoTV', true); applyTV();
  }
}, true);

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
function visibleEls(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}
function focusFirst(root, pref) {
  const els = visibleEls(root);
  const el = (pref && els.find(e => e.matches(pref))) || els[0];
  if (el) el.focus({ preventScroll: true });
}
// Focus onthouden bij openen van een laag en teruggeven bij sluiten
function focusKey() {
  const a = document.activeElement; if (!a || a === document.body) return null;
  const d = a.dataset || {};
  if (d.uid) return `[data-uid="${d.uid}"]`;
  if (d.row) return `.${a.classList[0]}[data-row="${CSS.escape(d.row)}"]`;
  if (d.tab) return `[data-tab="${d.tab}"]`;
  if (a.id) return '#' + a.id;
  return null;
}
function restoreFocus(key, root = document) {
  if (!key) return;
  try { const el = root.querySelector(key); if (el && el.offsetParent !== null) el.focus({ preventScroll: true }); } catch {}
}
const retKeys = {};
function rememberFocus(id) { retKeys[id] = focusKey(); }
function returnFocus(id) { syncLayers(); if ((isTV() || kbUsed) && retKeys[id]) restoreFocus(retKeys[id]); retKeys[id] = null; }
function closeLayer(el) { if (!el) return; el.hidden = true; returnFocus(el.id); }

function activeLayer() {
  if (!$('#epgView').hidden) return $('#epgView');
  if (!$('#player').hidden) return $('#pList').hidden ? $('#player') : $('#pList');
  if (!$('#catPop').hidden) return $('#catPop');
  if (!$('#langPop').hidden) return $('#langPop');
  for (const id of ['epgView', 'detail', 'settings', 'gridView', 'dlView']) if (!$('#' + id).hidden) return $('#' + id);
  return document.body;
}
/** Ruimtelijke navigatie met pijltjes/D-pad: ga naar het dichtstbijzijnde element in die richting. */
function spatial(dir) {
  const root = activeLayer();
  let cur = document.activeElement;
  if (!cur || cur === document.body || !root.contains(cur)) cur = null;
  const els = visibleEls(root).filter(el => root !== document.body || !el.closest('.overlay,.modal,.player'));
  if (!els.length) return false;
  if (!cur) { els[0].focus({ preventScroll: true }); els[0].scrollIntoView({ block: 'nearest' }); return true; }
  const c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of els) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect(), ex = r.left + r.width / 2, ey = r.top + r.height / 2;
    let prim, sec;
    if (dir === 'right') { if (ex <= cx + 2) continue; prim = Math.max(0, r.left - c.right); sec = Math.abs(ey - cy); }
    else if (dir === 'left') { if (ex >= cx - 2) continue; prim = Math.max(0, c.left - r.right); sec = Math.abs(ey - cy); }
    else if (dir === 'down') { if (ey <= cy + 2) continue; prim = Math.max(0, r.top - c.bottom); sec = Math.abs(ex - cx); }
    else { if (ey >= cy - 2) continue; prim = Math.max(0, c.top - r.bottom); sec = Math.abs(ex - cx); }
    const horiz = dir === 'left' || dir === 'right';
    const overlap = horiz ? (r.bottom > c.top && r.top < c.bottom) : (r.right > c.left && r.left < c.right);
    const score = overlap ? prim + sec * 0.2 : 100000 + prim + sec * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (!best) return true; // niets in die richting: toets wel opeten (niet de pagina eronder laten scrollen)
  best.focus({ preventScroll: true });
  best.scrollIntoView({ block: root === document.body || root.id === 'gridView' ? 'center' : 'nearest', inline: 'nearest' });
  return true;
}
document.addEventListener('keydown', e => {
  if (e.defaultPrevented) return;
  const tv = isTV();
  if (!$('#player').hidden && $('#epgView').hidden) { if (playerKey(e, tv)) e.stopPropagation(); if ($('#pList').hidden || !tv) return; }
  const layerOpen = ['epgView', 'detail', 'settings', 'gridView', 'dlView', 'catPop', 'langPop'].some(id => !$('#' + id).hidden);
  if (!tv && !layerOpen) return;
  const t = e.target;
  // D-pad OK op vinkjes
  if (e.key === 'Enter' && t.matches && t.matches('input[type=checkbox],input[type=radio]')) { t.click(); e.preventDefault(); return; }
  const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
  if (!dir) return;
  const typing = t.matches && t.matches('input:not([type=checkbox]):not([type=radio])');
  if (typing && (dir === 'left' || dir === 'right')) { // cursor in tekstveld: pas aan de rand verder navigeren
    const n = t.value.length, a = t.selectionStart, b = t.selectionEnd;
    if (a !== b || (dir === 'right' ? a < n : a > 0)) return;
  }
  // Open laag: focus hoort daarbinnen. Zit die erbuiten (bv. nog op ⚙), haal hem dan eerst naar binnen.
  const L = activeLayer();
  if (layerOpen && L && L !== document.body && L.id !== 'player' && !L.contains(document.activeElement)) {
    e.preventDefault(); focusFirst(L, LAYERS[L.id] || undefined); return;
  }
  if (spatial(dir)) { e.preventDefault(); return; }
  // geen volgend element: scroll alleen de open laag, nooit de pagina erachter
  if (layerOpen && L && L !== document.body) {
    e.preventDefault();
    const sc = L.querySelector('.modal-card, .grid') || L;
    const box = (sc.scrollHeight > sc.clientHeight) ? sc : L;
    if (dir === 'up' || dir === 'down') box.scrollBy({ top: dir === 'down' ? 140 : -140 });
  }
}, true);
// Open laag (instellingen, detail, raster, menu's): achtergrond vergrendelen en focus naar binnen halen,
// ook als TV-modus niet herkend is — anders scrolt de pagina eronder en kun je niets kiezen.
const LAYERS = { epgView: '.epg-a .btn, [data-day]', dlView: '.dl-acts .btn, .btn', settings: 'select, input, .btn', detail: '.d-actions .btn.primary, .ep', gridView: '.card', catPop: '.cat', langPop: 'input, button' };
const MODAL_LAYERS = ['settings', 'detail', 'gridView', 'dlView', 'epgView'];
function syncLayers() {
  const open = Object.keys(LAYERS).filter(id => !$('#' + id).hidden);
  document.body.classList.toggle('lock', open.length > 0);
  // achtergrond onbereikbaar maken voor focus (inert), zolang een scherm open staat
  const bgLocked = MODAL_LAYERS.some(id => open.includes(id));
  for (const el of document.querySelectorAll('.topbar, main, #status')) { if (bgLocked) el.setAttribute('inert', ''); else el.removeAttribute('inert'); }
  for (const id of open) {
    if (!MODAL_LAYERS.includes(id)) continue;
    const el = $('#' + id), go = () => { if (!el.hidden && !el.contains(document.activeElement)) focusFirst(el, LAYERS[id]); };
    go(); setTimeout(go, 60); setTimeout(go, 300);       // ook als de inhoud net pas getekend wordt
  }
}
const layerMO = new MutationObserver(syncLayers);
for (const id of Object.keys(LAYERS)) layerMO.observe($('#' + id), { attributes: true, attributeFilter: ['hidden'] });
// Eerste focus op TV: meteen op de eerste kaart, zodat de afstandsbediening werkt
let tvFocusTries = 0;
const tvFocusTimer = setInterval(() => {
  if (++tvFocusTries > 60) return clearInterval(tvFocusTimer);
  if (!isTV() || activeLayer() !== document.body) return;
  if (document.activeElement && document.activeElement !== document.body) return clearInterval(tvFocusTimer);
  const c = $('#rows .card, #hero button'); if (c) { c.focus({ preventScroll: true }); clearInterval(tvFocusTimer); }
}, 500);

// ---------- Start ----------
let splashGone = false;
function hideSplash(ready) {
  if (splashGone || !ready) return; splashGone = true;
  const s = $('#splash'); if (!s) return;
  setTimeout(() => { s.classList.add('out'); setTimeout(() => s.remove(), 500); }, 400);
}
setTimeout(() => hideSplash(true), 4000);
// In de apps staan de bestanden al lokaal: oude service workers/caches uit eerdere versies opruimen
if (ENV.native && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !ENV.native) navigator.serviceWorker.register('sw.js').catch(() => {});
window.KD = { play, applyMediaPrefs, openDetail, setupSubs, noteWatched, state, parseM3U, classify, ENV }; // voor debuggen/tests
(async () => {
  if (cacheOn()) { const now = Date.now(); for (const [k, v] of await IDB.entries('avail')) if (v && now - v.t < cacheTTL()) avail.set(k, v); }
  loadAll();
})();
applyTV();
refreshHist();
dlInit();
castInit();
