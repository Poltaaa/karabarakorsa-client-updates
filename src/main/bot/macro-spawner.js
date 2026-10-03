'use strict';
// ---------------------------------------------------------------------------
// macro-spawner.js - "Spawner AFK" makrosu
//
// Auto Farm makrosunun bir varyantidir ama KOMUT YAZMAZ: makro acildiginda
// bot YURUMEZ; sadece en yakin spawner'a doner. Spawner vanilya erisim
// mesafesi icindeyse sag tik atar, sunucu eklentisinin actigi ekranda
// kullanicinin sectigi karelere SIRAYLA tiklar (Auto Farm ile ayni mantik).
// Spawner erisilemeyecek kadar uzaktaysa hareket edilmez, tur atlanir ve
// bir sonraki turda yeniden denenir (cunku "yurumesin" kurali vardir).
//
// INSANSILIK / PAKET GUVENLIGI (paket 75):
//  - DONUS, "Anti AFK -> rastgele etrafa bak" ile AYNI kanitlanmis sistemdir
//    (bot.lookAt(merkez, force=true)). Mineflayer'in kendi koordinat hesabi
//    kullanilir; pitch ters cevrilmez. Hedef spawner blogunun TAM merkezidir.
//  - SATIS EKRANI ACIK KALIR (insan gibi): bir kez tiklanir, sonraki turlarda
//    yalnizca alisveris tiklari gider; spawner'a TEKRAR tiklanmaz. Sunucu
//    ekrani kapatirsa bir sonraki turda yeniden acilir.
//  - Sag tik, vanilla istemcinin "use item on block" (block_place) paketidir.
//    El animasyonu GONDERILMEZ. Gercek yuz/imlec kesişimi ve her etkilesimde
//    artan sequence kullanilir; eklenti bunu normal sag tik olarak gorur.
//  - Gorus kontrolu kutuphanenin gercek raycast'iyle (blockAtCursor) yapilir:
//    yalnizca bakis dogrultusunun FIZIKSEL olarak girdigi bloklar sayilir;
//    zemin/hafif yukseklik farki/yarim bloklar "duvar" zannettirilmez.
// ---------------------------------------------------------------------------
const MacroFarmer = require('./macro-farmer');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

// En yakin spawner kac blok icinde aransin (findBlocks agir bir taramadir;
// uzak bloklar PACKET gondermeden yardimci olamayacagi icin sinirli tutulur)
const SCAN_RADIUS = 16;
// Vanilya Java blok etkilesim (sag tik) mesafesi
const VANILLA_REACH = 4.5;

class MacroSpawner extends MacroFarmer {
  constructor(logger) {
    super(logger);
    this.reach = VANILLA_REACH;
    this.lastRightClickAt = 0;
  }

  L(tr, en) { return this.logger.L(tr, en); }

  info(msg) { this.logger.info(this.L('Spawner AFK: ', 'Spawner AFK: ') + msg); }

  warn(msg) { this.logger.warn(this.L('Spawner AFK: ', 'Spawner AFK: ') + msg); }

  updateOptions(opts) {
    const before = JSON.stringify(this.opts);
    super.updateOptions(opts);
    const r = Number(this.opts && this.opts.reach);
    this.reach = Number.isFinite(r) && r > 0 ? Math.min(8, r) : VANILLA_REACH;
    if (this.running && before !== JSON.stringify(this.opts)) {
      this.info(this.L('ayarlar güncellendi (çalışırken)', 'options updated live'));
    }
  }

  // Erisim mesafesi (var sayilan vanilya 4.5 blok)
  reachSec() {
    const r = Number(this.opts && this.opts.reach);
    return Number.isFinite(r) && r > 0 ? Math.min(8, r) : VANILLA_REACH;
  }

  // Sağ tık denemeleri hiçbir ayarda paket yağmuruna dönüşmesin.
  cycleSec() { return Math.max(10, Number(this.opts && this.opts.cycle) || 60); }

  // --- baslat / durdur ------------------------------------------------------
  // Komut yoktur: yalnizca adim listesi gerekir.
  start(bot, opts) {
    if (opts) this.updateOptions(opts);
    this.bot = bot || this.bot;
    if (!this.bot) {
      return { ok: false, error: this.L('Sunucuya bağlı değilsiniz', 'You are not connected to the server') };
    }
    const steps = this.steps();

    this.stop(true);
    this.hookBot(this.bot);
    this.running = true;
    this.cycles = 0;
    this.clicks = 0;
    this.info(this.L(
      `başlatıldı · ${steps.length} ekran adımı · erim ${this.reachSec()} blok · tur arası ${this.cycleSec()} sn`,
      `started · ${steps.length} screen steps · ${this.reachSec()} block reach · ${this.cycleSec()} s between cycles`));
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

  // --- spawner bulma --------------------------------------------------------
  isSpawner(b) {
    return !!b && (b.name === 'spawner' || b.name === 'mob_spawner');
  }

  // En yakin spawnerin blok konumunu (gercek Vec3) + gozden merkezine
  // mesafeyi doner. Vec3 ozellikleri korunur (blockAt icin gerekli).
  findNearestSpawner(radius) {
    const bot = this.bot;
    if (!bot || !bot.entity || typeof bot.findBlocks !== 'function') return null;
    try {
      const found = bot.findBlocks({ matching: (b) => b && this.isSpawner(b), maxDistance: radius, count: 64 });
      if (!found || !found.length) return null;
      const eye = bot.entity.position.offset(0, bot.entity.height * 0.9, 0);
      let best = null;
      let bestD = Infinity;
      for (const p of found) {
        if (!p) continue;
        const d = p.offset(0.5, 0.5, 0.5).distanceTo(eye);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (!best) return null;
      best.dist = bestD;   // Vec3 + ek mesafe bilgisi
      return best;
    } catch (e) {
      this.warn(this.L('spawner taraması başarısız: ', 'spawner scan failed: ') + (e && e.message ? e.message : e));
      return null;
    }
  }

  // Donus: Mineflayer'in kendi lookAt hesabi kullanilir. Onceki uygulama
  // pitch isaretini ters cevirdigi icin spawner oyuncudan asagidaysa bot
  // yukariya bakabiliyordu. Tam merkez + resmi hesap bu hatayi kaldirir.
  async lookAtHuman(pos) {
    const bot = this.bot;
    if (!bot || !bot.lookAt || !bot.entity || !pos || !pos.offset) return false;
    try {
      const target = pos.offset(0.5, 0.5, 0.5);
      await bot.lookAt(target, true);
      // Bot Physics kapali olsa bile bakis sunucuya kesin ulassin. lookAt
      // entity acilarini Mineflayer duyarliligiyla hesaplar; burada yalnizca
      // o guncel acilar tek bir serverbound look paketine cevrilir.
      if (bot._client && typeof bot._client.write === 'function') {
        const yaw = Math.fround((Math.PI - bot.entity.yaw) * 180 / Math.PI);
        const pitch = Math.fround(-bot.entity.pitch * 180 / Math.PI);
        const onGround = !!bot.entity.onGround;
        bot._client.write('look', {
          yaw,
          pitch,
          onGround,
          flags: { onGround, hasHorizontalCollision: undefined }
        });
      }
      // En az birkaç fizik tiki: sunucu bakis paketini sag tik paketinden
      // once islesin. Bu bekleme yeni bir bakis/tiklama paketi uretmez.
      await wait(rand(220, 320));
      return true;
    } catch (e) {
      this.warn(this.L(
        'spawner merkezine bakılamadı: ',
        'could not look at the spawner center: ') + (e && e.message ? e.message : e));
      return false;
    }
  }

  getBlockAt(pos) {
    try {
      const bot = this.bot;
      if (!bot || !bot.blockAt || !pos) return null;
      return bot.blockAt(pos);
    } catch (_) { return null; }
  }

  // Vanilla "use item on block" paketi. Yuz ve imlec noktasi interactionHit
  // tarafindan gercek bakis isinindan gelir. Ayri animation paketi yoktur.
  sendBlockPlace(block, hit) {
    const bot = this.bot;
    try {
      const p = block.position;
      const f = hit.face;
      const c = hit.cursor;
      let dir = 1;
      if (f.y < 0) dir = 0;
      else if (f.y > 0) dir = 1;
      else if (f.z < 0) dir = 2;
      else if (f.z > 0) dir = 3;
      else if (f.x < 0) dir = 4;
      else if (f.x > 0) dir = 5;

      if (bot.supportFeature('blockPlaceHasHeldItem')) {
        const Item = this.getItemApi(bot);
        bot._client.write('block_place', {
          location: p, direction: dir,
          heldItem: Item ? Item.toNotch(bot.heldItem) : { present: false },
          cursorX: Math.floor(c.x * 16),
          cursorY: Math.floor(c.y * 16),
          cursorZ: Math.floor(c.z * 16)
        });
      } else if (bot.supportFeature('blockPlaceHasHandAndIntCursor')) {
        bot._client.write('block_place', {
          location: p, direction: dir, hand: 0,
          cursorX: Math.floor(c.x * 16),
          cursorY: Math.floor(c.y * 16),
          cursorZ: Math.floor(c.z * 16)
        });
      } else if (bot.supportFeature('blockPlaceHasHandAndFloatCursor')) {
        bot._client.write('block_place', {
          location: p, direction: dir, hand: 0,
          cursorX: c.x, cursorY: c.y, cursorZ: c.z
        });
      } else if (bot.supportFeature('blockPlaceHasInsideBlock')) {
        // 1.19+: vanilla her blok etkilesiminde sequence degerini artirir.
        if (!bot.__spSeq) bot.__spSeq = 0;
        bot.__spSeq = (bot.__spSeq % 100000) + 1;
        bot._client.write('block_place', {
          location: p, direction: dir, hand: 0,
          cursorX: c.x, cursorY: c.y, cursorZ: c.z,
          insideBlock: false, sequence: bot.__spSeq, worldBorderHit: false
        });
      } else {
        throw new Error('Bu Minecraft sürümünün blok etkileşim paketi desteklenmiyor');
      }
      return true;
    } catch (e) {
      this.warn(this.L(
        'sağ tık paketi gönderilemedi, tur atlandı: ',
        'right-click packet failed, cycle skipped: ') + (e && e.message ? e.message : e));
      return false;
    }
  }

  // Oyuncunun gozunden blok merkezine giden isin AABB'ye girdigi GERCEK yuz
  // ve yerel imlec noktasini hesapla. Mineflayer varsayilan olarak hep ust
  // yuzu yollar; bazi eklenti/anti-cheat bir oyuncu yandan bakarken bu paketi
  // reddeder ve spawner menusu acilmaz.
  interactionHit(block) {
    const bot = this.bot;
    const p = block.position;
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0);
    const target = p.offset(0.5, 0.5, 0.5);
    const d = {
      x: target.x - eye.x,
      y: target.y - eye.y,
      z: target.z - eye.z
    };

    let enter = 0;
    let face = { x: 0, y: 1, z: 0 };
    for (const axis of ['x', 'y', 'z']) {
      if (Math.abs(d[axis]) < 1e-9) continue;
      const min = p[axis];
      const max = p[axis] + 1;
      const boundary = d[axis] > 0 ? min : max;
      const t = (boundary - eye[axis]) / d[axis];
      if (t >= enter && t <= 1) {
        enter = t;
        face = { x: 0, y: 0, z: 0 };
        face[axis] = d[axis] > 0 ? -1 : 1;
      }
    }

    const clamp = (n) => Math.max(0, Math.min(1, n));
    const cursor = {
      x: clamp(eye.x + d.x * enter - p.x),
      y: clamp(eye.y + d.y * enter - p.y),
      z: clamp(eye.z + d.z * enter - p.z)
    };

    // block.position bir Vec3'tur; offset-minus ile ayni turde iki Vec3 uret.
    return {
      face: p.offset(face.x, face.y, face.z).minus(p),
      cursor: p.offset(cursor.x, cursor.y, cursor.z).minus(p)
    };
  }

  // Eklenti icin yalnizca GERCEK blok etkilesimini gonder. Mineflayer'in
  // activateBlock() sonundaki fazladan swing/animation burada kullanilmaz.
  async rightClickSpawner(block) {
    const now = Date.now();
    const left = 8000 - (now - this.lastRightClickAt);
    if (left > 0) {
      this.info(this.L(
        `sağ tık paket koruması: ${Math.ceil(left / 1000)} sn bekleniyor`,
        `right-click packet guard: waiting ${Math.ceil(left / 1000)} s`));
      return false;
    }
    try {
      if (!this.bot || !this.bot.entity) throw new Error('Bot etkileşime hazır değil');
      const hit = this.interactionHit(block);

      // Shift basiliyken bazi sunucular blok eklentisini acmaz. Yalnizca
      // etkilesim aninda birak, paketten sonra onceki durumu geri yukle.
      let wasSneaking = false;
      try {
        wasSneaking = !!(this.bot.getControlState && this.bot.getControlState('sneak'));
        if (this.bot.setControlState) this.bot.setControlState('sneak', false);
        await wait(100);
        if (!this.sendBlockPlace(block, hit)) return false;
        await wait(150);
      } finally {
        if (wasSneaking && this.bot.setControlState) this.bot.setControlState('sneak', true);
      }
      this.lastRightClickAt = Date.now();
      return true;
    } catch (e) {
      this.warn(this.L(
        'spawner sağ tıklaması gönderilemedi: ',
        'could not right-click the spawner: ') + (e && e.message ? e.message : e));
      return false;
    }
  }

  // GORUS KONTROLU: botun SU ANKI bakisi (hedefe donuk) boyunca ilk carpilan
  // kati blok spawner'in KENDISI mi? blockAtCursor kutuphanenin gercek AABB
  // raycast'idir - zemine/yarim bloklara takilmaz, yalnizca ray'in FIZIKSEL
  // olarak girdigi bloklari sayar (duvar arkasindan tik imzasi olmaz).
  hasClearView(pos) {
    const bot = this.bot;
    try {
      if (!bot || !bot.blockAtCursor) return true;
      const cursor = bot.blockAtCursor(this.reachSec() + 1);
      if (!cursor) return true;
      const c = cursor.position;
      return c.x === pos.x && c.y === pos.y && c.z === pos.z;
    } catch (_) {
      return true;   // kontrol yapilamadiysa engelleme (tek paketlik risk minimumdur)
    }
  }

  // Yurumez; en yakin spawnera yumusakca doner, erisilebilir uzakliktaysa
  // USTUNE TEK sag tik atar ve acilan ekrani (window) dondurur.
  async activateSpawner() {
    const activeBot = this.bot;
    // Anti-AFK'nin rastgele bakma hareketi bu kisa kritik bolumde spawner
    // bakisini ezmesin. Kilit her cikis yolunda finally ile temizlenir.
    if (activeBot) activeBot.__spawnerAfkInteracting = true;
    try {
    const near = this.findNearestSpawner(SCAN_RADIUS);
    if (!near) {
      this.warn(this.L(
        `yakında spawner bulunamadı (${SCAN_RADIUS} blok içi) - bir spawner'ın yanına gelin (en fazla 4,5 blok)`,
        `no spawner found within ${SCAN_RADIUS} blocks - stand next to a spawner (within 4.5 blocks)`));
      return null;
    }

    // 1) Anti AFK sistemiyle yumusak/garantili donus (spawner ust kismina)
    if (!(await this.lookAtHuman(near))) return null;
    this.info(this.L(
      `spawner'a bakıldı (${near.dist.toFixed(1)} blok)`,
      `looked at the spawner (${near.dist.toFixed(1)} blocks)`));

    const reach = this.reachSec();
    if (near.dist > reach) {
      // Kural: yurumez. Mesafe icinde degilse bekle, bir sonraki turda tekrar dene.
      this.info(this.L(
        `en yakın spawner ${near.dist.toFixed(1)} blok uzakta (erim ${reach.toFixed(1)}) - yürümeden bekleniyor`,
        `nearest spawner is ${near.dist.toFixed(1)} blocks away (reach ${reach.toFixed(1)}) - waiting without moving`));
      return null;
    }

    const block = this.getBlockAt(near);
    if (!block) {
      this.warn(this.L('spawner bloğu okunamadı, tur atlandı', 'could not read the spawner block, skipped this cycle'));
      return null;
    }

    // 2) Duvar kontrolu: araya gercek kati blok girmisse sağ tik atilmaz
    if (!this.hasClearView(near)) {
      this.warn(this.L(
        'spawner ile aramızda duvar var - sağ tık atılmadı (bu tur atlandı)',
        'a wall blocks the spawner - no right-click sent (cycle skipped)'));
      return null;
    }

    // 3) Insancıl bekleme: döndükten hemen SONRA tıklanmaz
    await wait(rand(450, 700));

    // 4) Tek ve GUVENLI sağ tık (anlik donus yok, ham paket yok)
    if (!(await this.rightClickSpawner(block))) return null;
    this.info(this.L(
      `spawner'a sağ tık gönderildi (${near.dist.toFixed(1)} blok)`,
      `right-click sent to the spawner (${near.dist.toFixed(1)} blocks)`));

    const win = await this.waitWindow(6000);
    if (!win) {
      this.warn(this.L(
        'sunucu ekran açmadı (bu sunucuda spawner ekran açmıyor olabilir)',
        'the server did not open a screen (this spawner may not open a screen on this server)'));
      return null;
    }
    return win;
    } finally {
      if (activeBot) activeBot.__spawnerAfkInteracting = false;
    }
  }

  // --- tur dongusu ----------------------------------------------------------
  // Bir tur: acik satis ekrani varsa YALNIZCA alisveris yapilir (spawner'a
  // tekrar tiklanmaz - insan boyle yapar). Ekran kapaliysa yumusakca donulur,
  // tek sag tik atilir, ekran ACIK KALIR (kapatilmaz).
  async runOnce() {
    if (this.busy || !this.bot) return;
    this.busy = true;
    try {
      const bot = this.bot;
      const steps = this.steps();

      // Ilk turda kisacik "yerlesme": makro/yeniden baglanma sonrasi bot daha
      // yerleşmeden ANIDEN hareket etmesin
      if (this.cycles === 0) await wait(900);

      // Ilk turda kalinti ekran varsa kapatilir (temiz bir etkilesim icin);
      // sonraki turlarda ACIK kalan satis ekrani YENIDEN kullanilir.
      if (this.cycles === 0) await this.closeWindow();

      let win = bot.currentWindow;
      if (!win) {
        win = await this.activateSpawner();
      } else {
        this.info(this.L(
          'ekran hâlâ açık - spawner\'a tekrar tıklanmadı, alışveriş sürüyor',
          'screen is still open - no re-click on the spawner, shopping continues'));
      }
      if (!win) return;

      const n = await this.waitItems(win, 1500);
      this.info(this.L(
        `ekran açık · "${this.winTitle(win)}" · ${this.winSize(win)} kare · ${n} eşya`,
        `screen open · "${this.winTitle(win)}" · ${this.winSize(win)} slots · ${n} items`));

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
      // Ekran ACIK kalir (insan gibi); sunucu kapatirsa sonraki turda yeniden acilir
      await wait(rand(450, 900));
      this.info(this.L(
        `tur tamamlandı (${this.cycles}) · ${done}/${steps.length} tıklama gönderildi`,
        `cycle done (${this.cycles}) · ${done}/${steps.length} clicks sent`));
    } finally {
      this.busy = false;
    }
  }
}

module.exports = MacroSpawner;