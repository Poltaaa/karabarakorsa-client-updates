'use strict';
// ---------------------------------------------------------------------------
// macro-farmer.js - "Auto Farm" makrosu
//
// Calisma sekli: verilen komutu yazar (or. /ciftci), sunucunun actigi sandik
// ekranini bekler ve kullanicinin sectigi karelere SIRAYLA tiklar. Her adimin
// kendi bekleme suresi ve kendi TIKLAMA TURU vardir (sol / sag / shift+sol /
// shift+sag) - cunku bircok sunucu eklentisi satis icin sag tik veya shift
// tiki bekler. Bir adim yeni bir ekran aciyorsa sonraki adim yeni ekrana
// tiklar, cunku her zaman o an acik olan pencereye tiklanir.
// Tur bitince "tur arasi" kadar beklenir ve bastan baslar.
//
// TIKLAMA NASIL GONDERILIR?
//   1) Once mineflayer'in bot.clickWindow'u denenir (paketi surume gore dogru
//      bicimde yazar). Menu eklentileri tiklamayi "iptal" ettigi icin sunucu
//      genelde onay paketi gondermez; mineflayer bunu hata sayar ama PAKET
//      GITMISTIR. Bu yuzden onay beklemesi 1,5 sn ile sinirlanir ve onay
//      gelmemesi hata sayilmaz (yoksa makro her adimda takilir kalirdi).
//   2) Kutuphane paketi hic yazamazsa (surum/simulasyon hatasi) ayni tiklama
//      ELLE ham "window_click" paketi olarak gonderilir.
//   3) Kullanici isterse ayardan hep ham paket kullanilabilir.
// ---------------------------------------------------------------------------
const { plainText } = require('./dialogs');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Minecraft "window_click" paketindeki (mouseButton, mode) ikilileri
const CLICKS = {
  left: { button: 0, mode: 0, tr: 'sol tık', en: 'left click' },
  right: { button: 1, mode: 0, tr: 'sağ tık', en: 'right click' },
  shift: { button: 0, mode: 1, tr: 'shift + sol tık', en: 'shift + left click' },
  shiftRight: { button: 1, mode: 1, tr: 'shift + sağ tık', en: 'shift + right click' }
};

class MacroFarmer {
  constructor(logger) {
    this.logger = logger;
    this.bot = null;
    this.opts = { command: '', steps: [], cycle: 60, closeAfter: true, rawClick: false };
    this.running = false;
    this.busy = false;
    this.index = -1;
    this.timer = null;
    this.onState = null;          // bot-manager baglar
    this.cycles = 0;
    this.clicks = 0;              // gonderilen toplam tiklama
    this.stateId = 0;             // 1.17+ pencere durum numarasi (ham paket icin)
    this.actionId = 30000;        // <=1.16 islem numarasi (ham paket icin)
    this.itemApi = null;
    this.itemApiVer = '';
  }

  L(tr, en) { return this.logger.L(tr, en); }
  info(msg) { this.logger.info(this.L('Auto Farm: ', 'Auto Farm: ') + msg); }
  warn(msg) { this.logger.warn(this.L('Auto Farm: ', 'Auto Farm: ') + msg); }

  state() {
    return {
      running: this.running,
      index: this.index,
      total: (this.opts.steps || []).length,
      cycles: this.cycles,
      clicks: this.clicks
    };
  }

  emitState() { if (typeof this.onState === 'function') this.onState(this.state()); }

  updateOptions(opts) {
    const before = JSON.stringify(this.opts);
    this.opts = Object.assign({ command: '', steps: [], cycle: 60, closeAfter: true, rawClick: false }, opts || {});
    if (this.running && before !== JSON.stringify(this.opts)) {
      this.info(this.L('ayarlar güncellendi (çalışırken)', 'options updated live'));
    }
  }

  // Adim listesi: {slot, delay, click}
  steps() {
    return (this.opts.steps || [])
      .filter((s) => s && Number.isFinite(Number(s.slot)) && Number(s.slot) >= 0)
      .map((s) => ({
        slot: Math.trunc(Number(s.slot)),
        delay: Math.max(0, Number(s.delay) || 0),
        click: CLICKS[s.click] ? s.click : 'left'
      }));
  }

  // --- baslat / durdur ------------------------------------------------------
  start(bot, opts) {
    if (opts) this.updateOptions(opts);
    this.bot = bot || this.bot;
    if (!this.bot) {
      return { ok: false, error: this.L('Sunucuya bağlı değilsiniz', 'You are not connected to the server') };
    }
    const cmd = String(this.opts.command || '').trim();
    const steps = this.steps();
    if (!cmd) return { ok: false, error: this.L('Önce çalıştırılacak komutu yazın', 'Type the command to run first') };
    if (!steps.length) return { ok: false, error: this.L('Önce tıklanacak kareleri seçin', 'Pick the slots to click first') };

    this.stop(true);
    this.hookBot(this.bot);
    this.running = true;
    this.cycles = 0;
    this.clicks = 0;
    this.info(this.L(
      `başlatıldı · komut ${cmd} · ${steps.length} adım · tur arası ${this.cycleSec()} sn${this.opts.rawClick ? ' · ham paket' : ''}`,
      `started · command ${cmd} · ${steps.length} steps · ${this.cycleSec()} s between cycles${this.opts.rawClick ? ' · raw packet' : ''}`));
    this.emitState();
    this.loop();
    return { ok: true };
  }

  stop(silent) {
    const wasRunning = this.running;
    this.running = false;
    this.index = -1;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (wasRunning && !silent) {
      this.info(this.L('durduruldu', 'stopped'));
      this.emitState();
    }
    return { ok: true };
  }

  cycleSec() { return Math.max(3, Number(this.opts.cycle) || 60); }

  // --- tur dongusu ----------------------------------------------------------
  async loop() {
    if (!this.running) return;
    try { await this.runOnce(); } catch (e) {
      this.warn(this.L('tur tamamlanamadı: ', 'cycle failed: ') + (e && e.message ? e.message : e));
    }
    if (!this.running) return;
    this.index = -1;
    this.emitState();
    this.timer = setTimeout(() => this.loop(), this.cycleSec() * 1000);
  }

  // Bir tur: komutu yaz -> ekrani bekle -> adimlara sirayla tikla
  async runOnce() {
    if (this.busy || !this.bot) return;
    this.busy = true;
    try {
      const bot = this.bot;
      this.hookBot(bot);
      const cmd = String(this.opts.command || '').trim();
      const steps = this.steps();

      // Onceki turdan kalan ekran varsa kapatilir
      await this.closeWindow();

      bot.chat(cmd);
      this.info(this.L('komut gönderildi -> ', 'command sent -> ') + cmd);

      let win = await this.waitWindow(6000);
      if (!win && this.running) {
        // Sunucu bazen ilk komutu yutar: bir kez daha denenir
        this.warn(this.L('ekran açılmadı, komut tekrar gönderiliyor', 'no screen opened, sending the command again'));
        bot.chat(cmd);
        win = await this.waitWindow(6000);
      }
      if (!win) {
        this.warn(this.L(
          'sunucu bir ekran açmadı (komut yanlış olabilir veya sunucu geç açıyor)',
          'the server did not open a screen (wrong command or the server is slow)'));
        return;
      }

      const n = await this.waitItems(win, 1500);
      this.info(this.L(
        `ekran açıldı · "${this.winTitle(win)}" · ${this.winSize(win)} kare · ${n} eşya`,
        `screen opened · "${this.winTitle(win)}" · ${this.winSize(win)} slots · ${n} items`));

      let done = 0;
      for (let i = 0; i < steps.length; i++) {
        if (!this.running) return;
        const st = steps[i];
        this.index = i;
        this.emitState();
        if (st.delay) await wait(st.delay * 1000);
        if (!this.running) return;
        if (await this.clickSlot(st.slot, i + 1, st.click)) done += 1;
      }

      this.cycles += 1;
      if (this.opts.closeAfter !== false) {
        await wait(700);            // sunucu satisi islesin diye kisa bekleme
        await this.closeWindow();
      }
      this.info(this.L(
        `tur tamamlandı (${this.cycles}) · ${done}/${steps.length} tıklama gönderildi`,
        `cycle done (${this.cycles}) · ${done}/${steps.length} clicks sent`));
    } finally {
      this.busy = false;
    }
  }

  // --- tiklama --------------------------------------------------------------
  // Secilen kareye tiklar (o an hangi ekran acikse onun karesine)
  async clickSlot(slot, stepNo, kind) {
    const bot = this.bot;
    const c = CLICKS[kind] || CLICKS.left;
    const how = this.L(c.tr, c.en);

    let win = bot.currentWindow;
    if (!win) win = await this.waitWindow(1500);   // sunucu yeni ekran aciyor olabilir
    if (!win) {
      this.warn(this.L(`${stepNo}. adım · ekran kapalıydı, tıklanamadı`, `step ${stepNo} · the screen was closed, no click`));
      return false;
    }

    const size = this.winSize(win);
    if (slot >= size) {
      this.warn(this.L(
        `${stepNo}. adım · bu ekranda #${slot} karesi yok (ekran ${size} kare) - daha küçük numaralı bir kare seçin`,
        `step ${stepNo} · slot #${slot} does not exist on this screen (${size} slots) - pick a lower slot`));
      return false;
    }

    const item = win.slots && win.slots[slot];
    const name = item ? (this.itemName(item) || item.name) : this.L('boş kare', 'empty slot');

    let sent = false;
    let note = '';
    if (this.opts.rawClick) {
      sent = this.rawClick(win, slot, c.button, c.mode);
      note = this.L('ham paket', 'raw packet');
    } else {
      try {
        // Onay beklemesi kisitli: menu eklentilerinde sunucu onay gondermez
        await this.withTimeout(bot.clickWindow(slot, c.button, c.mode), 1500);
        sent = true;
      } catch (e) {
        const msg = (e && e.message) ? String(e.message) : String(e);
        if (msg === '__timeout__') {
          sent = true;                                 // paket gitti, onay yok (normal)
        } else if (/transaction/i.test(msg)) {
          sent = true;                                 // paket gitti, sunucu reddetti (normal)
          note = this.L('sunucu onaylamadı', 'server did not confirm');
        } else {
          sent = this.rawClick(win, slot, c.button, c.mode);   // kutuphane yazamadi
          note = sent ? this.L('ham paket ile', 'via raw packet') : msg;
        }
      }
    }
    this.resetCursor(win);

    if (sent) {
      this.clicks += 1;
      this.info(this.L(
        `${stepNo}. adım · kare #${slot} · ${how} -> ${name}${note ? ' (' + note + ')' : ''}`,
        `step ${stepNo} · slot #${slot} · ${how} -> ${name}${note ? ' (' + note + ')' : ''}`));
    } else {
      this.warn(this.L(`${stepNo}. adım · kare #${slot} tıklanamadı: `, `step ${stepNo} · could not click slot #${slot}: `) + note);
    }
    return sent;
  }

  // Ham "window_click" paketi (vanilla istemcinin gonderdigi bicimde)
  rawClick(win, slot, button, mode) {
    const bot = this.bot;
    try {
      const Item = this.getItemApi(bot);
      const notch = (x) => (Item ? Item.toNotch(x || null) : { present: false });
      const pkt = { windowId: win.id, slot, mouseButton: button, mode };
      if (this.sf('stateIdUsed')) {                      // 1.17.1+
        pkt.stateId = this.stateId || 0;
        pkt.changedSlots = [];
        pkt.cursorItem = notch(null);
      } else if (this.sf('actionIdUsed')) {              // <= 1.16.5
        this.actionId += 1;
        pkt.action = this.actionId;
        pkt.item = (mode === 2 || mode === 4) ? notch(null) : notch(win.slots && win.slots[slot]);
      } else {                                           // 1.17
        pkt.changedSlots = [];
        pkt.cursorItem = notch(null);
      }
      bot._client.write('window_click', pkt);
      return true;
    } catch (e) {
      this.warn(this.L('ham paket gönderilemedi: ', 'raw packet failed: ') + (e && e.message ? e.message : e));
      return false;
    }
  }

  sf(name) { try { return !!this.bot.supportFeature(name); } catch (_) { return false; } }

  getItemApi(bot) {
    const ver = String(bot.version || '');
    if (this.itemApi && this.itemApiVer === ver) return this.itemApi;
    try {
      this.itemApi = require('prismarine-item')(bot.registry || ver);
      this.itemApiVer = ver;
    } catch (_) { this.itemApi = null; }
    return this.itemApi;
  }

  // 1.17+ pencere durum numarasi ham pakette gerekiyor
  hookBot(bot) {
    if (!bot || !bot._client || bot.__mfHooked) return;
    bot.__mfHooked = true;
    const on = (p) => { if (p && typeof p.stateId === 'number') this.stateId = p.stateId; };
    try {
      bot._client.on('window_items', on);
      bot._client.on('set_slot', on);
    } catch (_) {}
  }

  // Menu eklentileri tiklamayi iptal ettiginde kutuphane "elimde esya var"
  // sanir ve sonraki tiklamalar bozulur; bu yuzden imlec temizlenir.
  resetCursor(win) {
    try {
      if (win && win.selectedItem) win.selectedItem = null;
      const inv = this.bot && this.bot.inventory;
      if (inv && inv !== win && inv.selectedItem) inv.selectedItem = null;
    } catch (_) {}
  }

  withTimeout(p, ms) {
    let t = null;
    return Promise.race([
      Promise.resolve(p).then(
        (v) => { clearTimeout(t); return v; },
        (e) => { clearTimeout(t); throw e; }
      ),
      new Promise((_, rej) => { t = setTimeout(() => rej(new Error('__timeout__')), ms); })
    ]);
  }

  // --- pencere yardimcilari -------------------------------------------------
  winSize(win) {
    if (!win) return 0;
    return Number.isInteger(win.inventoryStart) ? win.inventoryStart : (win.slots ? win.slots.length : 54);
  }

  winTitle(win) { return plainText(win && win.title) || '?'; }

  itemName(item) {
    if (!item) return '';
    return plainText(item.customName) || plainText(item.displayName) || '';
  }

  filled(win) {
    const size = this.winSize(win);
    const s = (win && win.slots) || [];
    let n = 0;
    for (let i = 0; i < size; i++) if (s[i]) n += 1;
    return n;
  }

  // Ekran acildiktan sonra esyalar bir sonraki pakette gelir; kisa beklenir
  async waitItems(win, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (this.filled(win) > 0) break;
      await wait(60);
    }
    return this.filled(win);
  }

  // Sunucunun actigi pencereyi bekler (zaten acik olabilir)
  waitWindow(ms) {
    const bot = this.bot;
    return new Promise((resolve) => {
      if (bot.currentWindow) return resolve(bot.currentWindow);
      let done = false;
      const on = (w) => { if (done) return; done = true; clearTimeout(t); resolve(w); };
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        try { bot.removeListener('windowOpen', on); } catch (_) {}
        resolve(null);
      }, ms);
      bot.once('windowOpen', on);
    });
  }

  async closeWindow() {
    const bot = this.bot;
    if (!bot || !bot.currentWindow) return;
    try { bot.closeWindow(bot.currentWindow); } catch (_) {}
    await wait(250);
  }
}

MacroFarmer.CLICKS = CLICKS;
module.exports = MacroFarmer;
