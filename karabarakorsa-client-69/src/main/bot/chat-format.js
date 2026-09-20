'use strict';
// ---------------------------------------------------------------------------
// chat-format.js - Minecraft sohbet bilesenlerini renkli parcalara cevirir.
// Cikti: [{ t:'metin', c:'#rrggbb', b:1, i:1, u:1, s:1, o:1 }, ...]
//   c = renk, b = kalin, i = italik, u = alti cizili, s = ustu cizili,
//   o = karisik (obfuscated). Sadece dolu olan alanlar yazilir.
// Arayuz bu parcalari kendisi kacisla (escape) basar; HTML uretmiyoruz.
// ---------------------------------------------------------------------------

const NAMED = {
  black: '#000000', dark_blue: '#0000AA', dark_green: '#00AA00', dark_aqua: '#00AAAA',
  dark_red: '#AA0000', dark_purple: '#AA00AA', gold: '#FFAA00', gray: '#AAAAAA',
  grey: '#AAAAAA', dark_gray: '#555555', dark_grey: '#555555', blue: '#5555FF',
  green: '#55FF55', aqua: '#55FFFF', red: '#FF5555', light_purple: '#FF55FF',
  yellow: '#FFFF55', white: '#FFFFFF'
};
// Eski (§) renk kodlari
const LEGACY = {
  0: 'black', 1: 'dark_blue', 2: 'dark_green', 3: 'dark_aqua', 4: 'dark_red',
  5: 'dark_purple', 6: 'gold', 7: 'gray', 8: 'dark_gray', 9: 'blue',
  a: 'green', b: 'aqua', c: 'red', d: 'light_purple', e: 'yellow', f: 'white'
};
const LEGACY_STYLE = { k: 'o', l: 'b', m: 's', n: 'u', o: 'i' };

const MAX_SPANS = 120;
const MAX_CHARS = 2000;

const FALLBACK_TRANSLATES = {
  'chat.type.text': '<%s> %s',
  'chat.type.announcement': '[%s] %s',
  'commands.message.display.incoming': '%s whispers: %s',
  'commands.message.display.outgoing': 'You whisper to %s: %s',
  'commands.teammsg.format': '[%s] %s',
  'commands.me': '* %s %s',
  'commands.ban.success': 'Banned %s',
  'commands.ban.ip.success': 'Banned IP %s',
  'commands.pardon.success': 'Unbanned %s',
  'commands.kick.success': 'Kicked %s',
  'commands.whitelist.add.success': 'Added %s to the whitelist',
  'commands.whitelist.remove.success': 'Removed %s from the whitelist',
  'multiplayer.player.joined': '%s joined the game',
  'multiplayer.player.left': '%s left the game'
};

function colorOf(c) {
  if (!c) return '';
  const s = String(c).trim().toLowerCase();
  if (NAMED[s]) return NAMED[s];
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  return '';
}

function styleFrom(node, inherit) {
  const pick = (v, old) => (v === undefined || v === null ? old : !!v);
  return {
    c: colorOf(node.color) || inherit.c || '',
    b: pick(node.bold, inherit.b),
    i: pick(node.italic, inherit.i),
    u: pick(node.underlined, inherit.u),
    s: pick(node.strikethrough, inherit.s),
    o: pick(node.obfuscated, inherit.o)
  };
}

function same(a, b) {
  return a.c === b.c && !!a.b === !!b.b && !!a.i === !!b.i
    && !!a.u === !!b.u && !!a.s === !!b.s && !!a.o === !!b.o;
}

function emit(out, text, st) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && same(last.__st, st)) { last.t += text; return; }
  if (out.length >= MAX_SPANS) { if (last) last.t += text; return; }
  out.push({ t: text, __st: st });
}

// Metnin kendi icindeki § kodlari da islenir (bircok sunucu boyle yollar)
function pushText(out, text, st) {
  const str = String(text);
  if (str.indexOf('\u00a7') === -1) { emit(out, str, st); return; }
  let cur = st;
  let buf = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch !== '\u00a7' || i + 1 >= str.length) { buf += ch; continue; }
    const raw = str[i + 1];
    const code = String(raw).toLowerCase();
    // §x§R§R§G§G§B§B  (BungeeCord hex)
    if (code === 'x' && /^(\u00a7[0-9a-fA-F]){6}/.test(str.slice(i + 2))) {
      let hex = '#';
      for (let k = 0; k < 6; k++) hex += str[i + 3 + k * 2];
      emit(out, buf, cur); buf = '';
      cur = Object.assign({}, cur, { c: hex.toLowerCase() });
      i += 13;
      continue;
    }
    // §#RRGGBB  (bazi eklentiler)
    if (code === '#' && /^[0-9a-fA-F]{6}/.test(str.slice(i + 2))) {
      emit(out, buf, cur); buf = '';
      cur = Object.assign({}, cur, { c: ('#' + str.substr(i + 2, 6)).toLowerCase() });
      i += 7;
      continue;
    }
    if (LEGACY[code]) {
      emit(out, buf, cur); buf = '';
      // renk kodu bicimleri de sifirlar (vanilya davranisi)
      cur = { c: NAMED[LEGACY[code]], b: false, i: false, u: false, s: false, o: false };
      i++;
      continue;
    }
    if (LEGACY_STYLE[code]) {
      emit(out, buf, cur); buf = '';
      cur = Object.assign({}, cur, { [LEGACY_STYLE[code]]: true });
      i++;
      continue;
    }
    if (code === 'r') {
      emit(out, buf, cur); buf = '';
      cur = { c: '', b: false, i: false, u: false, s: false, o: false };
      i++;
      continue;
    }
    buf += ch;
  }
  emit(out, buf, cur);
}

function walk(node, inherit, out, lang, depth) {
  if (node === null || node === undefined || depth > 16) return;
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    pushText(out, String(node), inherit);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, inherit, out, lang, depth + 1));
    return;
  }
  // prismarine-chat uses ChatMessage instances inside translate `with` args.
  // Their rendered component is stored in `.json`; walking the wrapper itself
  // would silently drop player names and other arguments.
  if (node && node.json !== undefined && node.json !== node) {
    walk(node.json, inherit, out, lang, depth + 1);
    return;
  }
  const st = styleFrom(node, inherit);

  if (typeof node.text === 'string') pushText(out, node.text, st);
  else if (typeof node.translate === 'string') {
    const args = Array.isArray(node.with) ? node.with : [];
    const pat = (lang && typeof lang[node.translate] === 'string') ? lang[node.translate] : null;
    if (pat === null) {
      // Dil dosyasında yoksa yaygın Minecraft mesaj şablonlarını kullan; böylece
      // /msg göndereni, banlanan oyuncu ve benzeri argümanlar kaybolmaz.
      const fallback = FALLBACK_TRANSLATES[node.translate];
      if (fallback) {
        const re = /%s/g; let last = 0; let ix = 0; let m;
        while ((m = re.exec(fallback)) !== null) {
          if (m.index > last) pushText(out, fallback.slice(last, m.index), st);
          if (args[ix] !== undefined) walk(args[ix], st, out, lang, depth + 1); else pushText(out, '?', st);
          ix++; last = m.index + 2;
        }
        if (last < fallback.length) pushText(out, fallback.slice(last), st);
        for (; ix < args.length; ix++) { pushText(out, ' ', st); walk(args[ix], st, out, lang, depth + 1); }
      } else if (args.length) {
        args.forEach((a, ix) => { if (ix) pushText(out, ' ', st); walk(a, st, out, lang, depth + 1); });
      } else pushText(out, node.translate, st);
    } else {
      const re = /%(?:(\d+)\$)?s|%%/g;
      let last = 0, auto = 0, m;
      while ((m = re.exec(pat)) !== null) {
        if (m.index > last) pushText(out, pat.slice(last, m.index), st);
        if (m[0] === '%%') pushText(out, '%', st);
        else {
          const ix = m[1] ? Number(m[1]) - 1 : auto++;
          if (args[ix] !== undefined) walk(args[ix], st, out, lang, depth + 1);
        }
        last = m.index + m[0].length;
      }
      if (last < pat.length) pushText(out, pat.slice(last), st);
    }
  } else if (typeof node.keybind === 'string') pushText(out, node.keybind, st);
  else if (node.score && node.score.value !== undefined) pushText(out, String(node.score.value), st);
  else if (typeof node.selector === 'string') pushText(out, node.selector, st);

  if (node.extra) walk(node.extra, st, out, lang, depth + 1);
}

// ChatMessage / JSON bileseni -> parca listesi
function spansOf(msg, lang) {
  let json = msg && typeof msg === 'object' && msg.json ? msg.json : msg;
  if (typeof json === 'string') {
    try { json = JSON.parse(json); } catch (_) {}
  }
  const out = [];
  try {
    walk(json, { c: '', b: false, i: false, u: false, s: false, o: false }, out, lang || null, 0);
  } catch (_) { /* bozuk bilesen: bos don */ }
  const clean = [];
  let total = 0;
  for (const sp of out) {
    if (!sp.t) continue;
    let t = sp.t;
    if (total + t.length > MAX_CHARS) t = t.slice(0, Math.max(0, MAX_CHARS - total));
    if (!t) break;
    total += t.length;
    const st = sp.__st || {};
    const o = { t };
    if (st.c) o.c = st.c;
    if (st.b) o.b = 1;
    if (st.i) o.i = 1;
    if (st.u) o.u = 1;
    if (st.s) o.s = 1;
    if (st.o) o.o = 1;
    clean.push(o);
    if (total >= MAX_CHARS) break;
  }
  return clean;
}

// Parcalari duz metne cevirir (kayitlar icin)
function flatten(spans) {
  return (spans || []).map((s) => s.t).join('');
}

// Duz metni parcalara cevirir (§ kodlari korunur) - kendi mesajlarimiz icin
function spansOfText(text, color) {
  return spansOf({ text: String(text === undefined || text === null ? '' : text), color: color || undefined });
}

module.exports = { spansOf, spansOfText, flatten, NAMED, LEGACY };
