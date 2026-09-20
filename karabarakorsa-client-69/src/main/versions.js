'use strict';
// ---------------------------------------------------------------------------
// versions.js - Desteklenen Minecraft surumleri: 1.21 -> 26.11 araligi
// minecraft-data kuruluysa GERCEK desteklenen liste kullanilir.
// ---------------------------------------------------------------------------

const MIN = [1, 21];      // 1.21
const MAX = [26, 11];     // 26.11

function parse(v) {
  const m = String(v).trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)];
}

function cmp(a, b) {
  for (let i = 0; i < 3; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

// Sadece ana (release) surumler: 1.21, 1.21.4, 26.11 ...
// Snapshot / pre / rc / beta / alpha bicimleri elenir: 24w14a, 1.21-pre1, 1.21-rc2, b1.7.3
const RELEASE_RE = /^\d+(?:\.\d+){0,2}$/;
function isRelease(v) {
  const str = String(v).trim();
  if (!RELEASE_RE.test(str)) return false;
  return !/(w\d|pre|rc|snapshot|beta|alpha|exp|combat|infinite)/i.test(str);
}

function inRange(v) {
  if (!isRelease(v)) return false;
  const p = parse(v);
  if (!p) return false;
  return cmp(p, [MIN[0], MIN[1], 0]) >= 0 && cmp(p, [MAX[0], MAX[1], 99]) <= 0;
}

// minecraft-data yoksa kullanilacak liste
function fallback() {
  const out = ['1.21'];
  for (let i = 1; i <= 12; i++) out.push('1.21.' + i);
  for (let y = 25; y <= 26; y++) {
    for (let m = 1; m <= 12; m++) {
      const v = y + '.' + m;
      if (inRange(v)) out.push(v);
    }
  }
  return out;
}

function list() {
  try {
    const mcData = require('minecraft-data');
    const supported = mcData.versions.pc
      .filter((v) => v.releaseType === 'release' || !v.releaseType)   // snapshot'lari ele
      .map((v) => v.minecraftVersion)
      .filter((v, i, arr) => v && arr.indexOf(v) === i)
      .filter(inRange)
      .sort((a, b) => cmp(parse(a), parse(b)));
    if (supported.length) return { versions: supported, source: 'minecraft-data' };
  } catch (_) {}
  return { versions: fallback(), source: 'fallback' };
}

function isSupported(v) {
  try {
    const mcData = require('minecraft-data');
    return mcData.versions.pc.some((x) => x.minecraftVersion === v);
  } catch (_) { return true; }
}

// Kutuphanenin destekledigi en yeni surum (oneri icin)
function newestSupported() {
  const l = list();
  return l.versions.length ? l.versions[l.versions.length - 1] : '';
}

module.exports = { list, isSupported, inRange, isRelease, newestSupported };
