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
    this.emitState();
    try {
      await this.runOnce();
    } catch (e) {
      this.warn(this.L('tur hatası: ', 'cycle error: ') + (e && e.message ? e.message : e));
    } finally {
      this.busy = false;
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

  async closeOwnedWindow() {
    const bot = this.bot;
    const win = this.ownedWindow;
    this.ownedWindow = null;
    if (!bot || !win || bot.currentWindow !== win) return;
    try { await bot.closeWindow(win); } catch (_) {}
  }

  async openNearestChest() {
    const bot = this.bot;
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
      await bot.lookAt(target, true);
      await wait(120);
      const pending = this.waitWindow(3000);
      await bot.activateBlock(block);
      win = await pending;
    } finally {
      if (wasSneaking && bot.setControlState) bot.setControlState('sneak', true);
    }
    if (!win) {
      this.warn(this.L('sandık ekranı açılmadı', 'the chest screen did not open'));
      return null;
    }
    this.ownedWindow = win;
    await wait(80);
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

    for (let slot = 0; slot < chestSlots && this.running; slot++) {
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
        if (!e || e.message !== '__timeout__') {
          this.warn(this.L(`kare #${slot} taşınamadı: `, `slot #${slot} could not be moved: `) +
            (e && e.message ? e.message : e));
          continue;
        }
        // Paket gitti; yuksek pingde slot guncellemesi gecikebilir.
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
    return { stacks, items, full };
  }

  async runOnce() {
    const activeBot = this.bot;
    if (activeBot) activeBot.__autoSellInteracting = true;
    try {
      const win = await this.openNearestChest();
      if (!win || !this.running) return;

      const moved = await this.transferAll(win);
      await this.closeOwnedWindow();
      await wait(80);
      if (!this.running) return;

      if (moved.stacks > 0) {
        this.bot.chat('/sellall');
        this.cycles += 1;
        this.stacks += moved.stacks;
        this.items += moved.items;
        this.info(this.L(
          `${moved.stacks} yığın / ${moved.items} eşya alındı${moved.full ? ' · envanter doldu' : ''} · /sellall gönderildi · tur ${this.cycles}`,
          `${moved.stacks} stacks / ${moved.items} items taken${moved.full ? ' · inventory full' : ''} · /sellall sent · cycle ${this.cycles}`
        ));
      } else {
        this.info(this.L('sandıkta alınabilir eşya yok; /sellall gönderilmedi', 'no transferable items in the chest; /sellall was not sent'));
      }
      this.emitState();
    } finally {
      // Hata veya DURDUR olsa bile acik sandik sonraki turlari kilitlemesin.
      await this.closeOwnedWindow();
      if (activeBot) activeBot.__autoSellInteracting = false;
    }
  }
}

module.exports = AutoSell;