'use strict';
// ---------------------------------------------------------------------------
// dialogs.js - Sunucu ekranlari (Minecraft "Dialog" sistemi, 1.21.6+)
//
// Bazi sunucular sohbet komutu yerine ekranda bir form acar
// (ornek: "Yeni Hesap Olustur" -> Yeni sifre / Yeni sifre tekrar / Devam Et).
// Vanilla istemci bunu ekranda cizer; bot ise paketi gormezse takilir kalir.
//
// Bu modul:
//  1) show_dialog paketini yakalar,
//  2) icindeki metinleri, giris alanlarini ve butonlari cozer,
//  3) arayuze gonderir (kullanici doldurup gonderebilsin),
//  4) cevabi dogru paketle geri yollar (custom_click_action) veya
//     buton bir komut calistiriyorsa komutu gonderir.
// ---------------------------------------------------------------------------

const { buildCustomClick } = require('./nbt-out');

// Paket bicimi tercihi (uygulama acik kaldigi surece hatirlanir).
// 0 = surume gore dogru bicim, 1 = digeri, 2 = kutuphanenin kendi yazicisi
let encPref = 0;

function textOf(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object') {
    // NBT ({type, value}) veya duz JSON metin bileseni
    if (node.value !== undefined && node.type !== undefined && typeof node.type === 'string') {
      if (node.type === 'list') {
        const inner = node.value && node.value.value !== undefined ? node.value.value : node.value;
        return Array.isArray(inner) ? inner.map(textOf).filter(Boolean).join(' | ') : textOf(inner);
      }
      return textOf(node.value);
    }
    let out = '';
    if (node.text !== undefined) out += textOf(node.text);
    if (node.translate !== undefined && !out) {
      out += textOf(node.translate);
      const args = plain(node.with !== undefined ? node.with : node.args);
      const list = Array.isArray(args) ? args : (args ? [args] : []);
      const parts = list.map(textOf).filter(Boolean);
      if (parts.length) out += ': ' + parts.join(' | ');
    }
    if (node.contents !== undefined) out += textOf(node.contents);
    if (node.extra) out += textOf(node.extra);
    if (!out) {
      // bilinmeyen sekil: string alanlari topla
      const vals = Object.values(node).filter((v) => typeof v === 'string');
      if (vals.length === 1) out = vals[0];
    }
    return out;
  }
  return '';
}

// Chat bileseni / JSON metni / NBT yapisini TEK SATIR duz yaziya cevirir.
// Pencere basliklari ve esya isimleri bazi surumlerde nesne, bazilarinda
// JSON metni olarak gelir; ikisi de dogru cozulmezse arayuzde "[object Object]"
// gorunur. Bu yuzden hem nesne hem de JSON metni burada ele alinir.
function plainText(node) {
  let s = textOf(node);
  if (typeof s === 'string') {
    const t = s.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { s = textOf(JSON.parse(t)); } catch (_) { s = t; }
    }
  }
  if (s === null || s === undefined || typeof s === 'object') s = '';
  return String(s).replace(/§./g, '').replace(/\s+/g, ' ').trim();
}

// NBT ({type:'compound', value:{...}}) yapisini duz nesneye cevirir
function plain(node) {
  if (node === null || node === undefined) return node;
  if (Array.isArray(node)) return node.map(plain);
  if (typeof node !== 'object') return node;
  if (node.type && node.value !== undefined && typeof node.type === 'string') {
    if (node.type === 'compound') return plain(node.value);
    if (node.type === 'list') return plain(node.value && node.value.value !== undefined ? node.value.value : node.value);
    return plain(node.value);
  }
  const out = {};
  for (const k of Object.keys(node)) out[k] = plain(node[k]);
  return out;
}

// --- NBT tiplerini KORUYARAK gezinme (additions'i aynen geri yollamak icin) ---
function rawChild(node, key) {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === 'compound') return node.value ? node.value[key] : undefined;
  if (node.type !== undefined && node.value !== undefined) return undefined;
  return node[key];
}

function rawList(node) {
  if (node === null || node === undefined) return [];
  if (Array.isArray(node)) return node;
  if (node.type === 'list') {
    const inner = node.value && node.value.value !== undefined ? node.value.value : node.value;
    return Array.isArray(inner) ? inner : [inner];
  }
  return [node];
}

function findRaw(node, key, depth) {
  if (!node || typeof node !== 'object' || (depth || 0) > 8) return undefined;
  const direct = rawChild(node, key);
  if (direct !== undefined) return direct;
  let kids;
  if (node.type === 'compound') kids = Object.values(node.value || {});
  else if (node.type === 'list') kids = rawList(node);
  else if (Array.isArray(node)) kids = node;
  else kids = Object.values(node);
  for (const k of kids) {
    const r = findRaw(k, key, (depth || 0) + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

// compound dugumunu {anahtar: NBT dugumu} haritasina cevirir
function compoundMap(node) {
  if (!node || typeof node !== 'object') return {};
  if (node.type === 'compound') return node.value && typeof node.value === 'object' ? node.value : {};
  if (node.type !== undefined && node.value !== undefined) return {};
  return node;
}

function findFirst(obj, key, depth) {
  if (!obj || typeof obj !== 'object' || (depth || 0) > 6) return null;
  if (obj[key] !== undefined) return obj[key];
  for (const v of Object.values(obj)) {
    const r = findFirst(v, key, (depth || 0) + 1);
    if (r) return r;
  }
  return null;
}

function parseDialog(rawPacket) {
  const data = plain(rawPacket);
  const root = plain(findFirst(data, 'dialog') || data);

  const title = textOf(root.title || root.external_title || findFirst(root, 'title'));
  const bodyRaw = root.body || findFirst(root, 'body') || [];
  const bodyList = Array.isArray(bodyRaw) ? bodyRaw : [bodyRaw];
  const body = bodyList.map((b) => textOf(b && (b.contents !== undefined ? b.contents : b))).filter(Boolean);

  const inputsRaw = root.inputs || findFirst(root, 'inputs') || [];
  const inputList = (Array.isArray(inputsRaw) ? inputsRaw : [inputsRaw]).filter(Boolean);
  const inputs = inputList.map((i, idx) => {
    const p = plain(i);
    const type = String(p.type || '').replace('minecraft:', '') || 'text';
    return {
      key: p.key || p.id || ('input' + idx),
      label: textOf(p.label) || p.key || ('Alan ' + (idx + 1)),
      type,
      maxLength: Number(p.max_length || p.maxLength || 0) || 128,
      initial: typeof p.initial === 'string' ? p.initial : '',
      onTrue: typeof p.on_true === 'string' ? p.on_true : 'true',
      onFalse: typeof p.on_false === 'string' ? p.on_false : 'false',
      options: Array.isArray(p.options) ? p.options.map((o) => ({ id: plain(o).id, label: textOf(plain(o).display) || plain(o).id })) : null
    };
  });

  const actionsRaw = root.actions || root.action || [];
  const actionList = (Array.isArray(actionsRaw) ? actionsRaw : [actionsRaw]).filter(Boolean);
  const buttons = actionList.map((a, idx) => {
    const p = plain(a);
    const act = plain(p.action || p.on_click || {});
    return {
      index: idx,
      label: textOf(p.label) || 'Gonder',
      actionType: String(act.type || '').replace('minecraft:', ''),
      id: act.id || act.value || '',
      template: act.template || act.command || '',
      raw: act
    };
  });

  // Butonun ham (NBT tipleri korunmus) "additions" alanini bul: sunucuya
  // aynen geri yollamak gerekiyor, tip degistirmek paketi bozar.
  const rawActions = rawList(findRaw(rawPacket, 'actions') || findRaw(rawPacket, 'action'));
  buttons.forEach((b, i) => {
    const ra = rawActions[i];
    if (!ra) return;
    const act = rawChild(ra, 'action') || rawChild(ra, 'on_click') || ra;
    b.rawAdditions = rawChild(act, 'additions') || rawChild(act, 'addition');
  });

  return { title, body, inputs, buttons, root };
}

// Alanlara bakip klasik sohbet komutunu tahmin eder (/register veya /login)
function suggestCommand(inputs) {
  const pass = inputs.filter((i) => /sifre|şifre|password|pass|parola/i.test(i.key + ' ' + i.label));
  if (pass.length >= 2) return `/register $(${pass[0].key}) $(${pass[1].key})`;
  if (pass.length === 1) return `/login $(${pass[0].key})`;
  if (inputs.length) return '/login $(' + inputs[0].key + ')';
  return '';
}

class DialogHandler {
  constructor(logger, emit) {
    this.logger = logger;
    this.emit = emit;                   // (eventName, payload)
    this.current = null;
    this.bot = null;
    this.autoCfg = null;
  }

  attach(bot, autoCfg) {
    this.bot = bot;
    this.autoCfg = autoCfg || {};
    const client = bot._client;
    if (!client) return;

    client.on('packet', (data, meta) => {
      if (!meta || !meta.name) return;
      const name = String(meta.name);
      if (/^show_dialog$|dialog/i.test(name) === false) return;

      if (/clear/i.test(name)) {
        this.current = null;
        this.emit('dialog-close', {});
        this.logger.info(this.logger.L('Sunucu ekranı kapatıldı', 'Server screen closed'));
        return;
      }

      try {
        const parsed = parseDialog(data);
        this.current = parsed;
        this.logger.warn(this.logger.L(
          `Sunucu ekranı açıldı: ${parsed.title || '(baslik yok)'} · ${parsed.inputs.length} alan, ${parsed.buttons.length} buton`,
          `Server screen opened: ${parsed.title || '(no title)'} · ${parsed.inputs.length} fields, ${parsed.buttons.length} buttons`));
        this.logger.info('Dialog icerigi: ' + JSON.stringify({ title: parsed.title, body: parsed.body, inputs: parsed.inputs.map((i) => i.key), buttons: parsed.buttons.map((b) => b.label) }));
        parsed.buttons.forEach((b) => this.logger.info(
          `Buton [${b.index}] "${b.label}" tip=${b.actionType || '?'} id=${b.id || '-'} komut=${b.template || '-'}`));
        const plan = this.autoPlan(parsed);
        this.emit('dialog', {
          title: parsed.title,
          body: parsed.body,
          inputs: parsed.inputs,
          buttons: parsed.buttons.map((b) => ({ index: b.index, label: b.label })),
          suggestion: suggestCommand(parsed.inputs),
          autoIn: plan.will ? plan.delay : 0
        });
        if (plan.will) this.startAuto(parsed, plan);
      } catch (e) {
        this.logger.error(this.logger.L('Sunucu ekranı çözülemedi: ', 'Could not decode the server screen: ') + e.message);
        this.logger.info(this.logger.L('Ham paket: ', 'Raw packet: ') + safeJson(data).slice(0, 1200));
      }
    });
  }

  // Otomatik cevap plani (sifre isteyen ekranlar icin)
  autoPlan(parsed) {
    const cfg = this.autoCfg || {};
    const isPassField = (i) => /sifre|şifre|password|pass|parola/i.test(i.key + ' ' + i.label);
    if (!cfg.autoAnswer || !cfg.password) return { will: false };
    if (!parsed.inputs.length || !parsed.inputs.some(isPassField)) {
      this.logger.info(this.logger.L('Bu ekran şifre istemiyor, otomatik cevap verilmedi', 'This screen asks for no password, no automatic answer'));
      return { will: false };
    }
    const values = {};
    parsed.inputs.forEach((i) => { values[i.key] = isPassField(i) ? cfg.password : (i.initial || ''); });
    const delay = Math.max(2, cfg.delay === undefined ? 5 : (Number(cfg.delay) || 0));
    return { will: true, delay, values };
  }

  startAuto(parsed, plan) {
    this.cancelAuto(true);
    this.logger.info(this.logger.L(`Sunucu ekranı ${plan.delay} sn sonra otomatik gönderilecek (arayüzden iptal edebilirsiniz)`, `The server screen will be submitted automatically in ${plan.delay} s (you can cancel it in the app)`));
    this.autoTimer = setTimeout(() => {
      this.autoTimer = null;
      const r = this.submit(0, plan.values);
      if (!r || !r.ok) this.logger.error(this.logger.L('Otomatik cevap başarısız: ', 'Automatic answer failed: ') + ((r && r.error) || this.logger.L('bilinmeyen', 'unknown')));
    }, plan.delay * 1000);
  }

  cancelAuto(silent) {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
      if (!silent) this.logger.info(this.logger.L('Otomatik cevap iptal edildi, ekran sizde', 'Automatic answer cancelled, the form is yours'));
    }
    return { ok: true };
  }

  // Baglantinin hangi asamada oldugu: 'login' | 'configuration' | 'play'
  phase() {
    try { return String((this.bot && this.bot._client && this.bot._client.state) || ''); } catch (_) { return ''; }
  }

  submit(buttonIndex, values) {
    if (!this.current || !this.bot) return this.err(this.logger.L('açık bir sunucu ekranı yok', 'no server screen is open'));
    const btn = this.current.buttons[buttonIndex] || this.current.buttons[0];
    if (!btn) return this.err(this.logger.L('buton bulunamadı', 'button not found'));
    const cfg = this.autoCfg || {};
    const vals = values || {};

    const template = (cfg.commandMode && String(cfg.commandTemplate || '').trim())
      || btn.template || (btn.raw && (btn.raw.template || btn.raw.command)) || '';
    const wantsCommand = !!template || btn.actionType.includes('run_command');
    const inPlay = this.phase() === 'play';

    // Oyun asamasinda degilsek sohbet komutu gonderilemez -> once paketi dene
    const order = (wantsCommand && inPlay) ? ['command', 'packet'] : ['packet', 'command'];
    const errors = [];

    for (const route of order) {
      if (route === 'command') {
        if (!template) { errors.push(this.logger.L('komut şablonu yok', 'no command template')); continue; }
        if (!inPlay) {
          this.pending = { template, values: vals };
          this.logger.warn(this.logger.L(
            'Komut şimdi gönderilemez (aşama: ' + (this.phase() || 'bilinmiyor') + '). Oyuna girilince gönderilecek: ' + maskPass(fill(template, vals)),
            'The command cannot be sent right now (phase: ' + (this.phase() || 'unknown') + '). It will be sent once we are in game: ' + maskPass(fill(template, vals))));
          errors.push(this.logger.L('oyun aşamasında değiliz', 'not in the play phase'));
          continue;
        }
        const r = this.sendCommand(template, vals, this.logger.L('buton', 'button'));
        if (r.ok) return r;
        errors.push(this.logger.L('komut: ', 'command: ') + r.error);
      } else {
        const r = this.sendPacket(btn, vals);
        if (r.ok) return r;
        errors.push(this.logger.L('paket: ', 'packet: ') + r.error);
      }
    }
    if (this.pending) {
      this.logger.info(this.logger.L('Cevap kuyruğa alındı: oyuna girilir girilmez gönderilecek.', 'Answer queued: it will be sent as soon as we are in game.'));
      return { ok: true, mode: 'queued' };
    }
    return this.err(this.logger.L('gönderilemedi -> ', 'could not send -> ') + errors.join(' | '));
  }

  // custom_click_action paketi ile cevap
  //
  // ONEMLI: minecraft-data bu paketi yanlis tanimliyor (payload'i "option + NBT"
  // olarak yaziyor). Gercek bicim Identifier + [VarInt uzunluk] + NBT oldugu icin
  // paketi kendimiz uretip client.writeRaw ile yolluyoruz.
  sendPacket(btn, values) {
    const client = this.bot && this.bot._client;
    if (!client) return { ok: false, error: this.logger.L('bağlantı yok', 'no connection') };
    const id = normalizeId(btn.id);
    if (!id) {
      this.logger.info('Buton ham verisi: ' + safeJson(btn.raw).slice(0, 600));
      return { ok: false, error: this.logger.L('buton kimliği (id) yok', 'the button has no id') };
    }

    // 1) Sunucunun butonla birlikte verdigi ek alanlar (additions) aynen geri gider
    const fields = {};
    const rawAdd = compoundMap(btn.rawAdditions);
    Object.keys(rawAdd).forEach((k) => { fields[k] = rawAdd[k]; });
    if (!Object.keys(rawAdd).length) {
      const add = btn.raw && (btn.raw.additions || btn.raw.addition);
      if (add && typeof add === 'object') Object.keys(add).forEach((k) => { fields[k] = add[k]; });
    }
    // 2) Kullanicinin doldurdugu alanlar (vanilla ile ayni NBT tipleriyle)
    Object.keys(values || {}).forEach((k) => { fields[k] = this.inputNode(k, values[k]); });

    const root = { type: 'compound', name: '', value: fields };
    const state = this.phase() || 'play';
    const pid = packetIdFor(this.bot, state, 'custom_click_action');
    const lenFirst = usesLengthPrefix(this.bot);
    const order = [
      { name: lenFirst ? 'uzunluk-onekli' : 'onek-yok', raw: true, len: lenFirst },
      { name: lenFirst ? 'onek-yok' : 'uzunluk-onekli', raw: true, len: !lenFirst },
      { name: 'kutuphane', raw: false, len: false }
    ];
    const plan = order.slice(encPref).concat(order.slice(0, encPref));

    let last = '';
    for (const enc of plan) {
      try {
        let bytes = 0;
        if (enc.raw) {
          if (pid === null) throw new Error(this.logger.L('paket kimliği bulunamadı', 'packet id not found'));
          if (typeof client.writeRaw !== 'function') throw new Error('writeRaw yok');
          const buf = buildCustomClick(pid, id, root, enc.len);
          client.writeRaw(buf);
          bytes = buf.length;
        } else {
          client.write('custom_click_action', { id, nbt: root, payload: root });
        }
        this.lastEncoding = enc.name;
        try { this.emit('trace', { name: 'custom_click_action' }); } catch (_) {}
        this.logger.info(this.logger.L('Sunucu ekranı gönderildi', 'Server screen sent')
          + ' (custom_click_action, ' + this.logger.L('biçim', 'format') + ': ' + enc.name
          + (bytes ? ', ' + bytes + ' ' + this.logger.L('bayt', 'bytes') : '') + ') id=' + id
          + ' ' + this.logger.L('alanlar', 'fields') + '=[' + Object.keys(fields).join(', ') + ']');
        this.close();
        return { ok: true, mode: 'custom_click_action' };
      } catch (e) { last = e.message; }
    }
    return { ok: false, error: last || this.logger.L('bu sürüm desteklemiyor', 'this version does not support it') };
  }

  // Alanin turune gore vanilla ile ayni NBT tipini uretir
  inputNode(key, value) {
    const list = (this.current && this.current.inputs) || [];
    const inp = list.find((i) => i.key === key);
    const type = inp ? String(inp.type || '') : '';
    if (/bool|checkbox/.test(type)) {
      const on = value === true || value === 1 || /^(1|true|on|evet|yes|acik)$/i.test(String(value));
      return { type: 'string', value: String(on ? (inp.onTrue || 'true') : (inp.onFalse || 'false')) };
    }
    if (/number|range|slider/.test(type)) {
      const n = Number(String(value).replace(',', '.'));
      return { type: 'float', value: isFinite(n) ? n : 0 };
    }
    return { type: 'string', value: String(value === undefined || value === null ? '' : value) };
  }

  // Sunucu paketi cozemediyse bir sonraki denemede diger bicim kullanilir
  noteDecodeFailure() {
    encPref = (encPref + 1) % 3;
    this.logger.warn(this.logger.L('Sunucu form paketini çözemedi. Sonraki denemede farklı paket biçimi kullanılacak.', 'The server could not decode the form packet. A different packet format will be used next time.'));
    return encPref;
  }

  // $(key) yer tutucularini doldurup komutu sohbetten gonderir
  sendCommand(template, values, source) {
    let cmd = fill(template, values);
    if (!cmd) return { ok: false, error: this.logger.L('komut boş', 'the command is empty') };
    if (!cmd.startsWith('/')) cmd = '/' + cmd;
    try {
      this.bot.chat(cmd);
      this.logger.info(this.logger.L('Sunucu ekranı komutla cevaplandı (', 'Server screen answered via command (') + source + '): ' + maskPass(cmd));
      this.close();
      return { ok: true, mode: 'command' };
    } catch (e) {
      this.logger.warn(this.logger.L('Komut gönderilemedi: ', 'Could not send the command: ') + e.message);
      return { ok: false, error: e.message };
    }
  }

  // Oyuna girildikten sonra bekleyen komutu gonderir
  flushPending() {
    if (!this.pending) return;
    const { template, values } = this.pending;
    this.pending = null;
    this.logger.info(this.logger.L('Bekleyen sunucu ekranı komutu gönderiliyor...', 'Sending the pending server screen command...'));
    const r = this.sendCommand(template, values, 'bekleyen');
    if (!r.ok) this.logger.error(this.logger.L('Bekleyen komut gönderilemedi: ', 'Could not send the pending command: ') + r.error);
  }

  err(message) {
    this.logger.error(this.logger.L('Sunucu ekranı: ', 'Server screen: ') + message);
    return { ok: false, error: message };
  }

  close() {
    this.cancelAuto(true);
    this.current = null;
    this.lastSubmitAt = Date.now();
    this.emit('dialog-close', {});
  }

  cancel() {
    this.cancelAuto(true);
    this.current = null;
    this.emit('dialog-close', {});
    return { ok: true };
  }
}

// "namespace:yol" bicimini dogrular; gecersizse null doner (sunucuyu hataya sokmamak icin)
function normalizeId(raw) {
  let id = raw;
  if (id && typeof id === 'object') id = id.value !== undefined ? id.value : '';
  id = String(id || '').trim();
  if (!id) return null;
  if (!id.includes(':')) id = 'minecraft:' + id;
  const ok = (v) => /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(v);
  if (ok(id)) return id;                       // sunucunun verdigi hali aynen kullan
  return ok(id.toLowerCase()) ? id.toLowerCase() : null;
}

// Paketin bu asamadaki (configuration/play) numarasini bulur
function packetIdFor(bot, state, name) {
  try {
    const reg = (bot && bot.registry) || null;
    const proto = (reg && reg.protocol) || require('minecraft-data')(bot.version).protocol;
    const mappings = proto[state].toServer.types.packet[1][0].type[1].mappings;
    for (const k of Object.keys(mappings)) {
      if (mappings[k] === name) return parseInt(k, 16);
    }
  } catch (_) {}
  if (name === 'custom_click_action' && state === 'configuration') return 0x08;   // 1.21.6+ sabit
  return null;
}

// 1.21.9 ve sonrasinda NBT'den once VarInt uzunluk gonderiliyor
function usesLengthPrefix(bot) {
  try {
    const v = bot.registry && bot.registry.version;
    if (v && typeof v.isNewerOrEqualTo === 'function') return v.isNewerOrEqualTo('1.21.9');
  } catch (_) {}
  const m = String((bot && bot.version) || '').match(/^1\.(\d+)(?:\.(\d+))?/);
  if (!m) return true;
  const minor = Number(m[1]);
  const patch = Number(m[2] || 0);
  return minor > 21 || (minor === 21 && patch >= 9);
}

function fill(template, values) {
  let cmd = String(template || '').trim();
  Object.keys(values || {}).forEach((k) => { cmd = cmd.split('$(' + k + ')').join(values[k]); });
  return cmd.replace(/\$\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

function maskPass(text) {
  return String(text).replace(/(\/(?:register|reg|login|l|changepass\w*|cp)\s+)\S+(\s+\S+)*/i, '$1********');
}

function safeJson(o) {
  try { return JSON.stringify(o); } catch (_) { return String(o); }
}

module.exports = { DialogHandler, parseDialog, textOf, plainText, suggestCommand };
