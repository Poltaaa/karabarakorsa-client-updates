'use strict';
// ---------------------------------------------------------------------------
// auto-sell.js - En yakin sandiktan hizli toplama + /sellall dongusu
//
// Calisma:
//   1) Acilir acilmaz, yurumeden erisimdeki en yakin sandiga bakar ve acar.
//   2) Sandik bolumundeki tum dolu slotlari SHIFT+SOL ile hizla envantere alir.
//      Envanter dolunca kalan esyalara dokunmaz.
//   3) Sandigi kapatir ve /sellall gonderir.
//   4) Sabit veya rastgele aralik kadar bekleyip ayar kapanana kadar tekrarlar.
//
// Tıklamalar Mineflayer clickWindow ile seri ama sirali gonderilir. Boylece
// modern stateId/changedSlots alanlari dogru kalir; ham paket yigini olusmaz.
// ---------------------------------------------------------------------------

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULTS = {
  enabled: false,
  mode: 'fixed',
  interval: 5,
  minDelay: 5,
  maxDelay: 10,
  reach: 4.5
};

class AutoSell {
  constructor(logger) {
    this.logger = logger;
    this.bot = null;
    this.opts = { ...DEFAULTS };
    this.running = false;
    this.busy = false;
    this.timer = null;
    this.cycles = 0;
    this.stacks = 0;
    this.items = 0;
    this.nextAt = 0;
    this.ownedWindow = null;
    this.cycleStartedAt = 0;
    this.captureWindows = false;
    this.onState = null;
    this.lastNoChestLog = 0;
  }

  L(tr, en) { return this.logger.L(tr, en); }

  info(msg) { this.logger.info(this.L('Auto Sell: ', 'Auto Sell: ') + msg); }

  warn(msg) { this.logger.warn(this.L('Auto Sell: ', 'Auto Sell: ') + msg); }

  normalize(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    o.mode = o.mode === 'range' ? 'range' : 'fixed';
    o.interval = Math.max(1, Number(o.interval) || DEFAULTS.interval);
    o.minDelay = Math.max(1, Number(o.minDelay) || DEFAULTS.minDelay);
    o.maxDelay = Math.max(o.minDelay, Number(o.maxDelay) || DEFAULTS.maxDelay);
    o.reach = Math.min(6, Math.max(1, Number(o.reach) || DEFAULTS.reach));
    o.enabled = !!o.enabled;
    return o;
  }

  state() {
    return {
      running: this.running,
      busy: this.busy,
      cycles: this.cycles,
      stacks: this.stacks,
      items: this.items,
      nextAt: this.nextAt
    };
  }

  emitState() {
    if (typeof this.onState === 'function') this.onState(this.state());
  }

  nextDelay() {
    if (this.opts.mode === 'range') {
      return (this.opts.minDelay + Math.random() * (this.opts.maxDelay - this.opts.minDelay)) * 1000;
    }
    return this.opts.interval * 1000;
  }

  start(bot, opts) {
    this.stop(true);
    if (!bot) {
      return { ok: false, error: this.L('Sunucuya bağlı değilsiniz', 'You are not connected to the server') };
    }
    this.bot = bot;
    this.opts = this.normalize(opts);
    this.running = true;
    this.busy = false;
    this.cycles = 0;
    this.stacks = 0;
    this.items = 0;
    this.nextAt = 0;
    this.info(this.L(
      `başlatıldı · ${this.opts.mode === 'range' ? `${this.opts.minDelay}-${this.opts.maxDelay} sn rastgele` : `${this.opts.interval} sn sabit`} · ilk tur hemen`,
      `started · ${this.opts.mode === 'range' ? `${this.opts.minDelay}-${this.opts.maxDelay} s random` : `${this.opts.interval} s fixed`} · first cycle now`
    ));
    this.emitState();
    this.loop(); // ilk tur beklemeden
    return { ok: true };
  }

  apply(opts) {
    this.opts = this.normalize(opts);
    if (!this.running) return false;
    // O anda aktarim yapilmiyorsa yeni aralik hemen gecerli olsun.
    if (!this.busy) {
      if (this.timer) clearTimeout(this.timer);
      this.schedule();
    }
    this.emitState();
    return true;
  }

  stop(silent) {
    const wasRunning = this.running;
    this.running = false;
    this.nextAt = 0;
    this.captureWindows = false;
    this.cycleStartedAt = 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.closeOwnedWindow();
    if (wasRunning && !silent) this.info(this.L('durduruldu', 'stopped'));
    this.emitState();
    return { ok: true };
  }

  schedule() {
    if (!this.running) return;
    const delay = this.nextDelay();
    this.nextAt = Date.now() + delay;
    this.emitState();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.nextAt = 0;
      this.loop();
    }, delay);
  }

  async loop() {
    if (!this.running || this.busy || !this.bot) return;
    this.busy = true;
    this.cycleStartedAt = Date.now();
    this.emitState();
    try {
      // Her alt adim kendi zaman asimina sahiptir. Bu dis koruma da
      // beklenmeyen bir kutuphane davranisinin donguyu saatlerce kilitlemesini
      // engeller.
      await this.withTimeout(this.runOnce(), 15000);
    } catch (e) {
      const timedOut = e && e.message === '__timeout__';
      this.warn(timedOut
        ? this.L('tur zaman aşımına uğradı; sandık zorla kapatılıp devam edilecek',
          'cycle timed out; the chest will be force-closed and the loop will continue')
        : this.L('tur hatası: ', 'cycle error: ') + (e && e.message ? e.message : e));
    } finally {
      await this.closeOwnedWindow(true);
      this.busy = false;
      this.cycleStartedAt = 0;
      this.emitState();
      if (this.running) this.schedule();
    }
  }

  isChest(block) {
    if (!block) return false;
    return block.name === 'chest' || block.name === 'trapped_chest';
  }

  findNearestChest() {
    const bot = this.bot;
    if (!bot || !bot.entity || typeof bot.findBlocks !== 'function') return null;
    const found = bot.findBlocks({
      matching: (b) => this.isChest(b),
      maxDistance: 12,
      count: 32
    }) || [];
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0);
    let best = null;
    let dist = Infinity;
    for (const pos of found) {
      if (!pos) continue;
      const d = pos.offset(0.5, 0.5, 0.5).distanceTo(eye);
      if (d < dist) { best = pos; dist = d; }
    }
    return best ? { pos: best, dist } : null;
  }

  waitWindow(ms) {
    const bot = this.bot;
    return new Promise((resolve) => {
      if (bot && bot.currentWindow) return resolve(bot.currentWindow);
      let done = false;
      const finish = (win) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { bot.removeListener('windowOpen', onOpen); } catch (_) {}
        resolve(win || null);
      };
      const onOpen = (win) => finish(win);
      const timer = setTimeout(() => finish(null), ms);
      bot.once('windowOpen', onOpen);
    });
  }

  trackOwnedWindow(win) {
    if (!win) return null;
    try { win.__autoSellOwned = true; } catch (_) {}
    this.ownedWindow = win;
    return win;
  }

  async closeOwnedWindow(force) {
    const bot = this.bot;
    let win = this.ownedWindow;
    // Bazi sunucu eklentileri sandik acildiktan sonra ayni ekranin yerine
    // ikinci bir ozel pencere acar. Ilk nesneye takili kalmak yerine Auto
    // Sell turunda acilan en son pencereyi kapat.
    if (bot && bot.currentWindow &&
        (bot.currentWindow === win || bot.currentWindow.__autoSellOwned)) {
      win = bot.currentWindow;
    }
    this.ownedWindow = null;
    if (!bot || !win) return true;
    try { win.__autoSellOwned = true; } catch (_) {}

    try {
      await this.withTimeout(bot.closeWindow(win), 800);
    } catch (_) {}
    await wait(80);

    if (bot.currentWindow === win) {
      // closeWindow nadiren bir transaction cevabini beklerken yerel pencereyi
      // acik birakabiliyor. Sunucuya kapatma paketini dogrudan gonder ve
      // Mineflayer'in yerel pencere durumunu da serbest birak.
      try {
        if (bot._client && typeof bot._client.write === 'function') {
          bot._client.write('close_window', { windowId: win.id });
        }
      } catch (_) {}
      try {
        if (typeof win.close === 'function') win.close();
      } catch (_) {}
      try {
        if (bot.currentWindow === win) bot.currentWindow = null;
      } catch (_) {}
      await wait(40);
    }
    return bot.currentWindow !== win;
  }

  async openNearestChest() {
    const bot = this.bot;
    if (bot.currentWindow) {
      if (bot.currentWindow.__autoSellOwned) {
        this.warn(this.L(
          'önceki turdan açık kalan sandık kurtarılıyor',
          'recovering a chest left open by the previous cycle'
        ));
        await this.closeOwnedWindow(true);
      }
    }
    if (bot.currentWindow) {
      // Baska bir ekran aciksa kullanicinin/makronun ekranini kapatip bozma.
      this.warn(this.L(
        'başka bir ekran açık; bu tur sandığa dokunulmadı',
        'another screen is open; skipped the chest this cycle'
      ));
      return null;
    }

    const near = this.findNearestChest();
    if (!near) {
      const now = Date.now();
      if (now - this.lastNoChestLog > 10000) {
        this.lastNoChestLog = now;
        this.warn(this.L('yakında sandık bulunamadı', 'no chest found nearby'));
      }
      return null;
    }
    if (near.dist > this.opts.reach) {
      const now = Date.now();
      if (now - this.lastNoChestLog > 10000) {
        this.lastNoChestLog = now;
        this.warn(this.L(
          `en yakın sandık ${near.dist.toFixed(1)} blok uzakta; erişim ${this.opts.reach.toFixed(1)} blok`,
          `nearest chest is ${near.dist.toFixed(1)} blocks away; reach is ${this.opts.reach.toFixed(1)} blocks`
        ));
      }
      return null;
    }

    const block = bot.blockAt(near.pos);
    if (!this.isChest(block)) return null;

    let wasSneaking = false;
    let win = null;
    try {
      wasSneaking = !!(bot.getControlState && bot.getControlState('sneak'));
      if (bot.setControlState) bot.setControlState('sneak', false);
      await wait(50);
      const target = near.pos.offset(0.5, 0.5, 0.5);
      await this.withTimeout(bot.lookAt(target, true), 1500);
      await wait(120);
      this.captureWindows = true;
      const pending = this.waitWindow(3000);
      try {
        await this.withTimeout(bot.activateBlock(block), 1800);
      } catch (e) {
        // Bazi eklenti sandiklarinda activateBlock promise'i donmese de
        // windowOpen paketi gelir. Asagidaki pencere bekleyicisi karar versin.
        if (!e || e.message !== '__timeout__') throw e;
      }
      win = await pending;
    } finally {
      if (wasSneaking && bot.setControlState) bot.setControlState('sneak', true);
    }
    if (!win) {
      this.warn(this.L('sandık ekranı açılmadı', 'the chest screen did not open'));
      return null;
    }
    // Bekleme sirasinda eklenti pencereyi degistirdiyse en guncelini kullan.
    if (bot.currentWindow) win = bot.currentWindow;
    this.trackOwnedWindow(win);
    // Eklentinin ilk sandigi ikinci bir ozel pencereyle degistirmesi icin
    // kisa bir yakalama araligi birak.
    await wait(120);
    if (bot.currentWindow) win = this.trackOwnedWindow(bot.currentWindow);
    this.captureWindows = false;
    return win;
  }

  canFit(win, item) {
    if (!win || !item) return false;
    const start = Number(win.inventoryStart);
    const end = Number(win.inventoryEnd || (win.slots && win.slots.length));
    if (!Number.isInteger(start) || !Number.isInteger(end)) return true;
    try {
      if (typeof win.findItemRange === 'function' &&
          win.findItemRange(start, end, item.type, item.metadata, true, item.nbt)) return true;
      if (typeof win.firstEmptySlotRange === 'function') return win.firstEmptySlotRange(start, end) !== null;
    } catch (_) {}
    for (let i = start; i < end; i++) {
      const dest = win.slots && win.slots[i];
      if (!dest) return true;
      if (dest.type === item.type && dest.metadata === item.metadata &&
          Number(dest.count) < Number(dest.stackSize || 64)) return true;
    }
    return false;
  }

  withTimeout(promise, ms) {
    let timer;
    return Promise.race([
      Promise.resolve(promise).finally(() => clearTimeout(timer)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('__timeout__')), ms); })
    ]);
  }

  async transferAll(win) {
    const bot = this.bot;
    const chestSlots = Number.isInteger(win.inventoryStart) ? win.inventoryStart : 0;
    let stacks = 0;
    let items = 0;
    let full = false;
    let stalled = false;

    for (let slot = 0; slot < chestSlots && this.running; slot++) {
      if (this.cycleStartedAt && Date.now() - this.cycleStartedAt > 9000) {
        stalled = true;
        this.warn(this.L(
          'sandık aktarımı güvenli süreyi aştı; tur sıfırlanıyor',
          'chest transfer exceeded the safe time; resetting this cycle'
        ));
        break;
      }
      if (!bot.currentWindow || bot.currentWindow !== win) break;
      const item = win.slots && win.slots[slot];
      if (!item) continue;
      // Bu yigin sigmiyorsa sonraki slotlari yine kontrol et: envanterde
      // baska bir esya turunun yarim yigini olabilir ve o esya hâlâ sigabilir.
      if (!this.canFit(win, item)) { full = true; continue; }

      const before = Number(item.count) || 1;
      try {
        // SHIFT+SOL: bir yigini tek tikta sandiktan envantere yollar.
        await this.withTimeout(bot.clickWindow(slot, 0, 1), 1200);
      } catch (e) {
        if (e && e.message === '__timeout__') {
          // Cevapsiz kalan bir clickWindow promise'inden sonra yeni tiklar
          // yollamak transaction kuyrugunu kilitleyebilir. Turu hemen kesip
          // pencereyi kapat; sonraki zamanlayici temiz bir tur baslatir.
          stalled = true;
          this.warn(this.L(
            `kare #${slot} zaman aşımına uğradı; tur güvenli şekilde sıfırlanıyor`,
            `slot #${slot} timed out; safely resetting this cycle`
          ));
          break;
        } else {
          this.warn(this.L(`kare #${slot} taşınamadı: `, `slot #${slot} could not be moved: `) +
            (e && e.message ? e.message : e));
          continue;
        }
      }
      await wait(25);
      const afterItem = win.slots && win.slots[slot];
      const after = afterItem && afterItem.type === item.type ? Number(afterItem.count) || 0 : 0;
      const moved = Math.max(0, before - after);
      if (moved > 0 || !afterItem) {
        stacks += 1;
        items += moved || before;
      }
    }
    return { stacks, items, full, stalled };
  }

  async runOnce() {
    const activeBot = this.bot;
    if (activeBot) activeBot.__autoSellInteracting = true;
    const onWindowOpen = (win) => {
      // activateBlock sonrasinda gelen ikinci/yenilenen eklenti pencerelerini
      // de bu tura ait say. Boylece finally her durumda dogru ekrani kapatir.
      if (this.captureWindows && activeBot === this.bot) this.trackOwnedWindow(win);
    };
    if (activeBot && typeof activeBot.on === 'function') {
      activeBot.on('windowOpen', onWindowOpen);
    }
    try {
      const win = await this.openNearestChest();
      if (!win || !this.running) return;

      const moved = await this.transferAll(win);
      await this.closeOwnedWindow(true);
      await wait(80);
      if (!this.running) return;

      if (moved.stacks > 0 && !moved.stalled) {
        this.bot.chat('/sellall');
        this.cycles += 1;
        this.stacks += moved.stacks;
        this.items += moved.items;
        this.info(this.L(
          `${moved.stacks} yığın / ${moved.items} eşya alındı${moved.full ? ' · envanter doldu' : ''} · /sellall gönderildi · tur ${this.cycles}`,
          `${moved.stacks} stacks / ${moved.items} items taken${moved.full ? ' · inventory full' : ''} · /sellall sent · cycle ${this.cycles}`
        ));
      } else if (moved.stalled) {
        this.info(this.L(
          'sandık işlemi yanıt vermedi; satış yapılmadan sonraki tur beklenecek',
          'the chest transaction stopped responding; waiting for the next cycle without selling'
        ));
      } else {
        this.info(this.L('sandıkta alınabilir eşya yok; /sellall gönderilmedi', 'no transferable items in the chest; /sellall was not sent'));
      }
      this.emitState();
    } finally {
      this.captureWindows = false;
      if (activeBot && typeof activeBot.removeListener === 'function') {
        activeBot.removeListener('windowOpen', onWindowOpen);
      }
      // Hata veya DURDUR olsa bile acik sandik sonraki turlari kilitlemesin.
      await this.closeOwnedWindow(true);
      if (activeBot) activeBot.__autoSellInteracting = false;
    }
  }
}

module.exports = AutoSell;