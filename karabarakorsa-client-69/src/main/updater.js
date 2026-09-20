'use strict';
// ---------------------------------------------------------------------------
// updater.js - "Yeni surum var mi?" kontrolu + kurulum dosyasini indirme.
//
// Uzaktaki bir JSON adresi okunur. Iki bicim de desteklenir:
//   1) kendi dosyan:   { "version": "1.15.0", "notes": "...", "url": "...exe" }
//   2) GitHub Releases API: { "tag_name": "v1.15.0", "body": "...",
//                             "html_url": "...", "assets": [...] }
// Elektron'a bagimli degildir; testlerde 'get' ve 'save' disaridan verilir.
// ---------------------------------------------------------------------------
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const UA = 'KarabarakorsaAFKClient';
const MAX_JSON = 1024 * 1024;              // 1 MB
const MAX_FILE = 400 * 1024 * 1024;        // 400 MB
const MAX_REDIRECT = 5;

// "v1.15.0-beta2" -> [1,15,0]
function parts(v) {
  const m = String(v == null ? '' : v).trim().replace(/^v/i, '').match(/\d+(?:\.\d+)*/);
  if (!m) return [];
  return m[0].split('.').map((x) => parseInt(x, 10) || 0);
}
// a > b ise 1, a < b ise -1, esitse 0
function cmpVersion(a, b) {
  const x = parts(a), y = parts(b);
  const n = Math.max(x.length, y.length);
  if (!x.length && !y.length) return 0;
  for (let i = 0; i < n; i++) {
    const p = x[i] || 0, q = y[i] || 0;
    if (p > q) return 1;
    if (p < q) return -1;
  }
  return 0;
}
function isNewer(remote, current) {
  if (!parts(remote).length) return false;
  return cmpVersion(remote, current) > 0;
}

// Windows kurulum dosyasini sec (once "Setup", sonra herhangi bir .exe)
function pickAsset(assets) {
  const list = Array.isArray(assets) ? assets.filter((a) => a && typeof a === 'object') : [];
  const exes = list.filter((a) => /\.exe$/i.test(String(a.name || a.browser_download_url || '')));
  const pool = exes.length ? exes : list;
  const setup = pool.find((a) => /setup|install|kur/i.test(String(a.name || '')));
  const pick = setup || pool[0];
  if (!pick) return '';
  const u = pick.browser_download_url || pick.url || pick.download_url || '';
  return typeof u === 'string' ? u : '';
}

function safeUrl(u) {
  const s = typeof u === 'string' ? u.trim() : '';
  return /^https?:\/\/\S+$/i.test(s) ? s : '';
}

// Ham JSON -> tek bicimli surum bilgisi
function parseManifest(raw) {
  const j = raw && typeof raw === 'object' ? raw : {};
  const data = Array.isArray(j) ? (j[0] || {}) : j;      // releases listesi de olabilir
  const version = String(data.version || data.tag_name || data.name || '').trim().replace(/^v/i, '');
  const notes = String(data.notes || data.body || data.description || '').slice(0, 4000);
  const page = safeUrl(data.page || data.html_url || data.pageUrl);
  const githubRelease = !!data.tag_name || Array.isArray(data.assets);
  const assetFile = safeUrl(pickAsset(data.assets));
  // GitHub'daki ust seviye url, EXE degil sayisal API kaydidir.
  const directFile = githubRelease
    ? safeUrl(data.file || data.download || data.setup)
    : safeUrl(data.url || data.file || data.download || data.setup);
  const file = assetFile || directFile;
  const date = String(data.date || data.published_at || data.created_at || '').slice(0, 10);
  return {
    version,
    notes: notes.trim(),
    url: file,
    page,
    date,
    mandatory: data.mandatory === true
  };
}

// --- ag ------------------------------------------------------------------
function request(url, opts, cb) {
  const o = opts || {};
  let left = o.redirects === undefined ? MAX_REDIRECT : o.redirects;
  const go = (u) => {
    let parsed;
    try { parsed = new URL(u); } catch (e) { return cb(new Error('bad_url')); }
    const mod = parsed.protocol === 'http:' ? http : https;
    const req = mod.get(u, {
      headers: Object.assign({ 'User-Agent': UA, Accept: 'application/json, */*' }, o.headers || {}),
      timeout: o.timeout || 12000
    }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (left-- <= 0) return cb(new Error('too_many_redirects'));
        let next = res.headers.location;
        try { next = new URL(next, u).toString(); } catch (_) {}
        return go(next);
      }
      if (code !== 200) { res.resume(); return cb(new Error('http_' + code)); }
      cb(null, res, u);
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => cb(e));
  };
  go(url);
}

function fetchJson(url, opts) {
  return new Promise((resolve, reject) => {
    request(url, opts, (err, res) => {
      if (err) return reject(err);
      let size = 0;
      const chunks = [];
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_JSON) { res.destroy(); return reject(new Error('too_big')); }
        chunks.push(c);
      });
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error('bad_json')); }
      });
      res.on('error', reject);
    });
  });
}

// --- ana islemler --------------------------------------------------------
// { ok, update, version, current, notes, url, page, date }
async function check(opts) {
  const o = opts || {};
  const url = safeUrl(o.url);
  if (!url) return { ok: false, error: 'no_url' };
  const get = o.get || fetchJson;
  let raw;
  try { raw = await get(url); } catch (e) { return { ok: false, error: (e && e.message) || 'fetch_failed' }; }
  const info = parseManifest(raw);
  if (!info.version) return { ok: false, error: 'bad_manifest' };
  return Object.assign({ ok: true, current: String(o.current || ''), update: isNewer(info.version, o.current) }, info);
}

function safeName(name) {
  // once sorgu/etiket kismi atilir, sonra yol ayiricilarindan son parca alinir
  const noQuery = String(name || '').split('?')[0].split('#')[0];
  const n = noQuery.split(/[\\/]/).filter(Boolean).pop() || '';
  const clean = n.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '').slice(0, 120);
  return clean || 'karabarakorsa-update.exe';
}

// Kurulum dosyasini indirir. onProgress({ received, total, percent })
function download(opts) {
  const o = opts || {};
  const url = safeUrl(o.url);
  const dir = o.dir;
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error('no_url'));
    if (!dir) return reject(new Error('no_dir'));
    let file = path.join(dir, safeName(o.name || url));
    if (!/\.exe$/i.test(file) && /\.exe$/i.test(url.split('?')[0])) file += '.exe';
    const tmp = file + '.part';
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    request(url, { timeout: o.timeout || 20000, headers: { Accept: '*/*' } }, (err, res) => {
      if (err) return reject(err);
      const total = Number(res.headers['content-length'] || 0);
      if (total && total > MAX_FILE) { res.destroy(); return reject(new Error('too_big')); }
      let received = 0;
      let last = 0;
      let out;
      try { out = fs.createWriteStream(tmp); } catch (e) { res.destroy(); return reject(e); }
      const fail = (e) => {
        try { res.destroy(); } catch (_) {}
        try { out.destroy(); } catch (_) {}
        try { fs.unlinkSync(tmp); } catch (_) {}
        reject(e);
      };
      res.on('data', (c) => {
        received += c.length;
        if (received > MAX_FILE) return fail(new Error('too_big'));
        const now = Date.now();
        if (o.onProgress && (now - last > 250 || received === total)) {
          last = now;
          o.onProgress({ received, total, percent: total ? Math.min(100, Math.round((received / total) * 100)) : 0 });
        }
      });
      // baglanti yarida koptuysa dosya yarim kalmis sayilir
      const cut = (e) => fail(total && received < total ? new Error('incomplete') : (e || new Error('aborted')));
      res.on('aborted', () => cut());
      res.on('error', cut);
      out.on('error', fail);
      out.on('finish', () => {
        try {
          if (total && received !== total) return fail(new Error('incomplete'));
          const fd = fs.openSync(tmp, 'r');
          const sig = Buffer.alloc(2);
          const got = fs.readSync(fd, sig, 0, 2, 0);
          fs.closeSync(fd);
          if (got !== 2 || sig.toString('ascii') !== 'MZ') return fail(new Error('bad_exe'));
          try { fs.unlinkSync(file); } catch (_) {}
          fs.renameSync(tmp, file);
        } catch (e) { return fail(e); }
        if (o.onProgress) o.onProgress({ received, total: total || received, percent: 100 });
        resolve({ ok: true, path: file, bytes: received });
      });
      res.pipe(out);
    });
  });
}

module.exports = { check, download, parseManifest, cmpVersion, isNewer, pickAsset, safeName, fetchJson };
