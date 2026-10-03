'use strict';
// ---------------------------------------------------------------------------
// spawner-protect.js - Spawner korumasi
// ---------------------------------------------------------------------------
// Secilen AFK hesap(lar)in "triggerRadius" blok yakinina (bu istemcinin
// kendi hesaplari HARIC) bir oyuncu gelirse bot:
//   1) Envanterindeki EN IYI Ipeksi Dokunuslu kazmayi kusanir
//      (netherite > elmas > altin > demir > tas > tahta),
//   2) "breakRadius" yaricipindaki TUM spawner'lari tek tek yaklasip
//      Shift basili tutarak (egilerek) kirar,
//   3) Ulasamadigi spawner'larin yanina yurur; SADECE onunde gercek
//      bir engel varsa ziplar (duzlukte surekli ziplamaz),
//   4) Spawner kalmayana kadar devam eder, sonra yeniden bekler.
//
// SMP sunucularinin stacklenmis spawner sistemleri icin tasarlandi
// (Shift + sol tik = 64'luk grup kırma).
//
// ONEMLI TESPITLER (25.09.2026):
//  * Kullanicida "Bot Physics" kapaliyken (toggles.physics=false)
//    mineflayer fizik tick'ini atlar -> forward/jump HIC hareket
//    ettirmez, sadece sneak/bakma paketleri calisir. Bu modul calisirken
//    fizigi gecici olarak acar (onceki degeri sonra geri verir).
//  * bot.dig() once "digTime(block)" hesaplar; elde spawner'i kazabilecek
//    KAZMA yoksa sure Infinity olur ve dig ANINDA "dig time is Infinity"
//    hatasi firlatir (simdiki "1-2 sn egilip birakma" belirtisi budur).
//    Bu yuzden once kazma kusanilmaya calisilir; kazma YOKSA spawner
//    ham paketlerle (raw block_dig) kesilip YOK EDILIR ama dusmez.
//  * PAKET 75 NOT: digTime() spawner'da KAZMAYLA bile hep Infinity donebiliyor
//    (bu yuzden "Eff5 kazmayla bile 7.5 sn" sorunu vardi). Sure artik VANILLA
//    formulle hesaplanir: sertlik * 1.5 / alet hizi, Verimlilik^2 dahil ->
//    Eff5 elmas ~0.25 sn, tipki gercek oyuncu gibi kirilir.
//  * bot.dig() blok guncellemesi gelmezse SONSUZA KADAR bekler; burada
//    zaman asimi (race) + bot.stopDigging() ile darbe korumasi var.
//  * bot.jumpQueued bir kez true olunca mineflayer onu kendisi
//    temizlemez -> bot havadayken bile otomatik ziplamayi surdurup
//    "surekli zipliyor / havada donuyor" goruntusu verir. Bu modul
//    ziplamayi her biraktiginda bot.jumpQueued/jumpTicks'i sifirlar.
//  * Loop bitince fizik kapatilirken bot havadaysa yerinde donar;
//    burada fizik kapatilmadan once yere inmesi beklenir.
// ENGELLER: 1 blokluk engeli ziplar; 2 blokluk duvara ZIPLAMAZ,
//    sag/sol kayarak etrafindan dolasir (duvar takibi).
// PAKET 77 NOTLARI:
//  * DUVAR ARKASINA KIRMA KALDIRILDI: goNear "ulasildi" demeden ve
//    rawDig'den hemen once bot.blockAtCursor ile GORUS (line of sight)
//    kontrolu yapilir. Bot ile spawner arasinda kati blok (duvar) varsa
//    kazma HIC BASLAMAZ; bot duvar boyunca kayarak etrafindan dolasir.
//    (Önceki paketlerde mesafe <= 2.6 olunca duvarin arkasi da kiriliyordu -
//     sunucu bunu hile olarak goruyordu.)
//  * ANINDA TETIKLEME: tarama araligi 2 sn'den 500 ms'ye indirildi; yaricapla
//    birisi icine girer girmez (en gec yarim saniyede) kirma baslar.
//  * goNear'daki "stuck" sayaci duzeltildi: lastPos artik KOPYALANIYOR
//    (onceki kodda ayni nesne referansiydi -> sayac her zaman artiyordu,
//     bot ulaşsa bile ~6.6 sn sonra pes ediyordu).
//  * exitAfterBreak aciksa TUM spawnerlar kirilinca onExit() cagrilir
//    (BotManager.disconnect() -> otomatik yeniden baglanma engellenir).
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Kazma malzemesi siralamasi (en iyi -> en zayif)
const PICKAXE_TIER = { netherite: 5, diamond: 4, golden: 3, gold: 3, iron: 2, stone: 1, wooden: 0 };

function tierOf(name) {
  const m = /^(.+)_pickaxe$/.exec(String(name || ''));
  if (!m) return -1;
  const t = PICKAXE_TIER[m[1]];
  return t === undefined ? -1 : t;
}

function isPickaxe(name) {
  return /_pickaxe$/.test(String(name || ''));
}

// Vanilla alet hizlari (Minecraft ToolMaterial). Kazma hizi:
//   tahta 2, tas 4, demir 6, elmas 8, netherit 9, altin 12
const TOOL_SPEED = {
  wooden_pickaxe: 2, stone_pickaxe: 4, iron_pickaxe: 6, diamond_pickaxe: 8,
  netherite_pickaxe: 9, golden_pickaxe: 12, gold_pickaxe: 12
};
function toolSpeedOf(name) {
  return TOOL_SPEED[name] !== undefined ? TOOL_SPEED[name] : 1;
}

// Verimlilik (Efficiency) buyu seviyesi. Sayisal id: efficiency = 35 (1.13+).
// Kaynaklar hasSilkTouch ile ayni: .enchants / NBT ench / 1.21+ components.
function effLevelOf(item) {
  try {
    const enc = item && item.enchants;
    if (Array.isArray(enc)) {
      for (const e of enc) {
        if (!e) continue;
        const id = e.id !== undefined ? e.id : (e.name !== undefined ? e.name : null);
        if (id === 35 || id === 'efficiency' || id === 'minecraft:efficiency') {
          const lvl = Number(e.lvl !== undefined ? e.lvl : e.level);
          return Math.max(1, Number.isFinite(lvl) && lvl > 0 ? lvl : 1);
        }
      }
    }
    const v = item && item.nbt && item.nbt.value;
    if (!v) return 0;
    const lists = [];
    const pushList = (t) => {
      if (!t) return;
      if (Array.isArray(t)) lists.push(t);
      else if (Array.isArray(t.value)) lists.push(t.value);
    };
    pushList(v.ench);
    pushList(v.Enchantments);
    pushList(v.enchantments);
    for (const list of lists) {
      for (const e of list) {
        if (!e || typeof e !== 'object') continue;
        let raw = e && e.id;
        if (raw && typeof raw === 'object' && raw.value !== undefined) raw = raw.value;
        if (raw === 35 || raw === 'efficiency' || raw === 'minecraft:efficiency') {
          let lvl = e && (e.lvl !== undefined ? e.lvl : e.level);
          if (lvl && typeof lvl === 'object' && lvl.value !== undefined) lvl = lvl.value;
          return Math.max(1, Number(lvl) > 0 ? Number(lvl) : 1);
        }
      }
    }
    const comps = v.components && v.components.value;
    const enchC = comps && comps['minecraft:enchantments'] && comps['minecraft:enchantments'].value;
    const levels = enchC && enchC.levels && enchC.levels.value;
    if (levels && typeof levels === 'object') {
      for (const k of Object.keys(levels)) {
        if (k === 'minecraft:efficiency' || k.endsWith('efficiency')) {
          return Math.max(1, Number(levels[k]) > 0 ? Number(levels[k]) : 1);
        }
      }
    }
  } catch (_) { /* yoksay */ }
  return 0;
}

// Enchant'ta Ipeksi Dokunus (silk touch) var mi?
// Kaynaklar:
//   1.13+ NBT "ench"   (sayisal id, silk_touch = 33)
//   eski  NBT "Enchantments"
//   1.21+ "enchantments" / item.components (prismarine-item ".enchants" da var)
function hasSilkTouch(item) {
  try {
    // prismarine-item'in normalize ettigi liste (id sayisal veya string olabilir)
    const enc = item && item.enchants;
    if (Array.isArray(enc)) {
      for (const e of enc) {
        if (!e) continue;
        const id = e.id !== undefined ? e.id : (e.name !== undefined ? e.name : null);
        if (id === 33 || id === 'silk_touch' || id === 'minecraft:silk_touch') return true;
      }
    }
    const v = item && item.nbt && item.nbt.value;
    if (!v) return false;
    const lists = [];
    const pushList = (t) => {
      if (!t) return;
      if (Array.isArray(t)) lists.push(t);
      else if (Array.isArray(t.value)) lists.push(t.value);
    };
    pushList(v.ench);
    pushList(v.Enchantments);
    pushList(v.enchantments);
    for (const list of lists) {
      for (const e of list) {
        if (!e || typeof e !== 'object') continue;
        let raw = e && e.id;
        if (raw && typeof raw === 'object' && raw.value !== undefined) raw = raw.value;
        if (raw === 33 || raw === 'silk_touch' || raw === 'minecraft:silk_touch') return true;
      }
    }
    // 1.21.5+ item components: components."minecraft:enchantments".levels
    const comps = v.components && v.components.value;
    const enchC = comps && comps['minecraft:enchantments'] && comps['minecraft:enchantments'].value;
    const levels = enchC && enchC.levels && enchC.levels.value;
    if (levels && typeof levels === 'object') {
      for (const k of Object.keys(levels)) {
        if (k === 'minecraft:silk_touch' || k.endsWith('silk_touch')) return true;
      }
    }
  } catch (_) { /* yoksay */ }
  return false;
}

// En iyi kazma: once Ipeksi Dokunuslular, sonra en yuksek malzeme.
// Ipeksi Dokunuslu yoksa en iyi kazmaya geri dusulur.
function bestPickaxe(items) {
  let best = null;
  let fallback = null;
  for (const it of items || []) {
    const tier = tierOf(it && it.name);
    if (tier < 0) continue;
    const silk = hasSilkTouch(it);
    if (silk && (!best || tier > best.tier)) best = { item: it, tier };
    if (!fallback || tier > fallback.tier) fallback = { item: it, tier };
  }
  return best ? best.item : (fallback ? fallback.item : null);
}

function norm(section) {
  const s = section || {};
  return {
    triggerRadius: Math.min(50, Math.max(1, Number(s.triggerRadius) || 50)),
    breakRadius: Math.min(32, Math.max(1, Number(s.breakRadius) || 20)),
    exitAfterBreak: !!s.exitAfterBreak       // paket 77: spawnerlar bitince oyundan cik
  };
}

class SpawnerProtect {
  constructor(logger) {
    this.logger = logger;
    this.bot = null;
    this.cfg = norm(null);
    this.friends = new Set();   // panel hesaplari (paket 80: TETIKLERLER, trusted kisitlar)
    this.trusted = new Set();   // "guvenilir kisiler" -> bunlar yakindayken koruma AKTIVE OLMAZ
    this.lastTrustedLog = 0;    // guvenilir kisi logu bekleme (spam olmasin)
    this.running = false;
    this.busy = false;
    this.armed = false;
    this.timer = null;
    this.rearmTimer = null;
    this.warnedNoPickaxe = false;
    this.onExit = null;      // exitAfterBreak -> Baglanan/BotManager tarafindan atanir
    this._spawnerCache = null;   // paket 77: spawner taramasi onbellegi (500 ms)
    this._spawnerCacheTs = 0;
    this._lastDigAt = 0;         // paket 77: block_dig paketleri arasi asgari sure
    this.lastTriggerLog = 0;      // paket 77/4: tetiklenme uyarisi kisit (15 sn)
    this.lastSkipLog = 0;         // paket 77/4: "atlandi" logu kisit (30 sn)
    this.lastDoneLog = 0;         // paket 77/4: "tamam" logu kisit (30 sn)
    this.lastPhysLog = 0;         // paket 77/4: fizik ac/kapa logu kisit (60 sn)
    this.gaveUp = new Map();      // paket 77/5: ulasilamayan spawner -> 120 sn deneme yok
    this.lastNoIntruderLog = 0;   // paket 78: "tetikleyici yok" aciklamasi (30 sn'de bir)
    this.lastPickaxeFail = null;  // paket 79: kusanilamayan kazma adi/hatasi (log icin)
    // paket 72: rubber-band teshisi - sunucu "flight" sanip konumumuzu geri cekiyor mu?
    this.rbActive = false;   // yurume (goNear) sirasinda sayac aktif
    this.rbCount = 0;        // bu yurume sirasindaki konum duzeltme sayisi
    this.rbLogAt = 0;        // canli rubber-band uyarisi kisit (20 sn)
    this.lastRbLog = 0;      // yurume sonu ozet kisit (30 sn)
    this.rbHooked = false;   // dinleyici her bot icin bir kez baglanir
  }

  start(bot, fullCfg) {
    this.stop();
    this.bot = bot;
    this.cfg = norm((fullCfg && fullCfg.spawnerProtect) || fullCfg || {});
    // Kendi istemcimizin diger hesaplari burada toplanir (yalnizca log icin;
    // paket 80'den beri tetiklemeyi ENGELLEMEZLER - trusted haric herkes tetikler).
    this.friends = new Set();
    try {
      const al = (fullCfg && fullCfg.accounts && fullCfg.accounts.list) || [];
      al.forEach((a) => { if (a && a.username) this.friends.add(a.username); });
    } catch (_) { /* yoksay */ }
    this.trusted = new Set();
    try {
      const t = (fullCfg && fullCfg.spawnerProtect && fullCfg.spawnerProtect.trusted) || [];
      if (Array.isArray(t)) t.forEach((n) => { if (n) this.trusted.add(String(n).trim()); });
    } catch (_) { /* yoksay */ }
    this.lastTrustedLog = 0;
    if (bot && bot.username) this.friends.add(bot.username);
    this.warnedNoPickaxe = false;
    this.lastPickaxeFail = null;      // paket 79: her baslangicta temiz
    this.lastPickaxeOkName = null;    // paket 80: bu tur kusanan kazmanin adi (hiz icin)
    this.running = true;
    this.armed = true;
    this.busy = false;
    this.logger.info(this.logger.L(
      `Spawner Protect acik (algilama: ${this.cfg.triggerRadius} blok, kirma yaricapi: ${this.cfg.breakRadius} blok)`,
      `Spawner Protect on (detect: ${this.cfg.triggerRadius} blocks, break radius: ${this.cfg.breakRadius} blocks)`));
    // Paket 78: gamemode'u logla - kirma suresi buna gore degisir (creative=ANINDA,
    // survival=eldeki kazmaya gore vanilla: kazmayla 0.25-3.75 sn, kazmasiz 7.5 sn).
    try {
      const gm78 = this.detectGameMode(bot);
      this.logger.info(this.logger.L('Bot gamemode: ', 'Bot gamemode: ') + this.modeLabel(gm78) +
        (gm78 === 1
          ? this.logger.L(' — spawner kirma ANINDA olur.', ' — spawner breaking is INSTANT.')
          : this.logger.L(' — creative degil; sure eldeki kazmaya gore vanilla (kazma yoksa 7,5 sn).',
            ' — not creative; time is vanilla, based on the held pickaxe (7.5s with no pickaxe).')));
    } catch (_) { /* yoksay */ }
    // Paket 80: panel hesaplari + trusted listesi gorunur olsun. Kendi hesaplarin
    // "tetiklemez" DEGIL - trusted haric yari captaki her oyuncu korumayi tetikler.
    try {
      const fl = [...this.friends].filter((n) => n !== (bot && bot.username));
      const tl = [...this.trusted];
      this.logger.info(this.logger.L('Panel hesaplari (tetikleyebilir): ', 'Panel accounts (can trigger): ') + (fl.length ? fl.join(', ') : '-') +
        this.logger.L(' | Trusted (tetiklemez): ', ' | Trusted (do not trigger): ') + (tl.length ? tl.join(', ') : '-'));
    } catch (_) { /* yoksay */ }
    // Paket 77: 500 ms tarama -> yaricapla birisi icine girer girmez kirma baslar
    this.timer = setInterval(() => this.tick(), 500);
  }

  // Calisirken secenekler degistiyse bir sonraki taramada uygulanir
  apply(cfg) {
    const sp = (cfg && cfg.spawnerProtect) ? cfg.spawnerProtect : (cfg || {});
    this.cfg = norm(sp);
    this.trusted = new Set();
    try {
      const t = sp.trusted || [];
      if (Array.isArray(t)) t.forEach((n) => { if (n) this.trusted.add(String(n).trim()); });
    } catch (_) { /* yoksay */ }
    return this.running;
  }

  stop() {
    this.running = false;
    this.armed = false;
    this.busy = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.rearmTimer) { clearTimeout(this.rearmTimer); this.rearmTimer = null; }
    if (this.bot) { try { this.clearControls(); this.restorePhysics(); } catch (_) {} }
    this.bot = null;
  }

  // Paket 78: cok katmanli gamemode tespiti.
  // Sunucular/surumler farkli yerlerde tutar: bot.player.gamemode (player_info),
  // bot.game.gameMode (login), eski protokolde gameType. Hicbiri yoksa null.
  detectGameMode(bot) {
    let gm = null;
    try { gm = bot.player && bot.player.gamemode; } catch (_) { /* yoksay */ }
    try {
      if (gm === null || gm === undefined) {
        const g = bot && bot.game;
        if (g) gm = g.gameMode !== undefined ? g.gameMode : g.gameType;
      }
    } catch (_) { /* yoksay */ }
    const n = Number(gm);
    return Number.isFinite(n) ? n : null;
  }

  modeLabel(gm) {
    const m = { 0: 'survival', 1: 'creative', 2: 'adventure', 3: 'spectator' };
    return (gm === null || gm === undefined || m[gm] === undefined) ? String(gm) : m[gm];
  }

  tick() {
    if (!this.running || this.busy || !this.armed) return;
    const bot = this.bot;
    if (!bot || !bot.entity || !bot.players) return;
    const intruder = this.scanPlayers(bot);
    if (!intruder) {
      // Paket 80: "neden hic kazmiyor?" sorusuna DETAYLI logla cevap - yakindaki
      // oyunculari trusted/oyuncu + mesafe bilgisiyle listeler (30 sn'de bir).
      // Boylece "ben yakindayim ama kirilmiyor" diyen kullanici SEBEBI gorur:
      // oyuncu trusted ise, uzaktaysa, ya da entity yuklenmemisse. Yakindaki
      // trusted-disi gorunur biri varken tetiklenmemesi artik mumkun degil
      // (sadece kok musluk/entity yuklenmeme kalir, mesafe kolonunda gorulur).
      let spN = 0;
      try { spN = this.findSpawners().length; } catch (_) { /* yoksay */ }
      if (spN > 0) {
        const now = Date.now();
        if (now - this.lastNoIntruderLog >= 30000) {
          this.lastNoIntruderLog = now;
          let parts = [];
          try {
            const radius = this.cfg.triggerRadius;
            const me = bot.username;
            for (const nm of Object.keys(bot.players || {})) {
              const p = bot.players[nm];
              if (!p) continue;
              const tag = nm === me ? 'ben' : (this.trusted.has(nm) ? 'trusted' : 'oyuncu');
              let d = '?';
              try {
                if (p.entity && p.entity.position && bot.entity) d = Math.round(bot.entity.position.distanceTo(p.entity.position));
              } catch (_) { /* yoksay */ }
              parts.push(nm + '[' + tag + '/' + (p.entity ? 'ent' : 'entYOK') + '/' + d + 'm/' + radius + 'm]');
            }
          } catch (_) { /* yoksay */ }
          this.logger.info(this.logger.L(
            `Spawner var (${spN}) ama koruma tetiklenmedi. Oyuncular: `,
            `Spawner(s) present (${spN}) but protect not triggered. Players: `) +
            (parts.length ? parts.join(' ') : this.logger.L('(gorunur oyuncu yok)', '(no visible players)')) +
            this.logger.L(' — trusted OLMAYAN ve yari captaki gorunur bir oyuncu gerekiyor; kendi hesaplarin da sayilir (TEST butonu kaldirildi).',
              ' — a visible, non-trusted player within the radius is required; your own accounts count too (TEST button was removed).'));
        }
      }
      return;
    }
    this.armed = false;
    let d = 0;
    try { d = Math.round(bot.entity.position.distanceTo(intruder.entity.position)); } catch (_) {}
    // Paket 77/4: ayni intruder oradayken tetiklenme uyarisi logu 15 sn'de bir
    // yazilir (davranis degismez, sadece konsol su baskini olmaz).
    const now = Date.now();
    if (now - this.lastTriggerLog >= 15000) {
      this.lastTriggerLog = now;
      this.logger.warn(this.logger.L(
        `Spawner korumasi tetiklendi: ${intruder.username} ~${d} blok yakinda. Spawner'lar kiriliyor...`,
        `Spawner protect triggered: ${intruder.username} is ~${d} blocks away. Breaking spawners...`));
    }
    // Paket 80: beklenmedik bir hata donguyu OLU halinde birakmasin (armed=false
    // kalip "kapat-ac yapinca calisiyor" sorununun tekrarlanmamasi icin).
    try {
      const pr = this.breakLoop();
      if (pr && typeof pr.catch === 'function') pr.catch(() => {});
    } catch (_) { /* yoksay */ }
  }

  scanPlayers(bot) {
    const radius = this.cfg.triggerRadius;
    const me = bot.username;
    // Once guvenilir kisiler: bunlardan biri yaricipdaysa koruma AKTIVE OLMAZ.
    for (const name of Object.keys(bot.players || {})) {
      if (name === me || !this.trusted.has(name)) continue;
      const p = bot.players[name];
      if (!p || !p.entity || !p.entity.position) continue;
      try {
        if (bot.entity.position.distanceTo(p.entity.position) <= radius) {
          const now = Date.now();
          if (now - this.lastTrustedLog > 30000) {
            this.lastTrustedLog = now;
            this.logger.info(this.logger.L(
              `Güvenilir kişi yakında (${name}); Spawner koruması şu an AKTİVE OLMAZ.`,
              `Trusted player nearby (${name}); Spawner protect stays inactive right now.`));
          }
          return null;
        }
      } catch (_) { /* yoksay */ }
    }
    // Paket 80: kendi hesaplarimiz da korumayi tetikler - kullanici "mod acikken
    // yanina spawner koydum, yari capta oldugum halde kirilmiyor" diyor. Sadece
    // TRUSTED listesi engeller; botlarin birbirini tetiklemesini istemiyorsan
    // o hesaplari trusted listesine ekle (istenen davranis acikca bu).
    for (const name of Object.keys(bot.players || {})) {
      if (name === me) continue;
      const p = bot.players[name];
      if (!p || !p.entity || !p.entity.position) continue;
      try {
        if (bot.entity.position.distanceTo(p.entity.position) <= radius) return p;
      } catch (_) { /* yoksay */ }
    }
    return null;
  }

  isSpawner(b) {
    return !!b && (b.name === 'spawner' || b.name === 'mob_spawner');
  }

  findSpawners() {
    const bot = this.bot;
    if (!bot || !bot.entity) return [];
    // Paket 77: agir findBlocks taramasi onbellekle sinirli - en fazla 500 ms'de
    // bir taranir. Bu sure icinde kirilan spawner zaten blok kontrolunde elenir.
    const tNow = Date.now();
    if (this._spawnerCache && tNow - this._spawnerCacheTs < 500) return this._spawnerCache;
    const r = this.cfg.breakRadius;
    let list = [];
    try {
      const found = bot.findBlocks({ matching: (b) => b && this.isSpawner(b), maxDistance: r, count: 64 });
      const me = bot.entity.position;
      list = (found || [])
        .filter((p) => p && me.distanceTo(p) <= r)
        .sort((a, b) => me.distanceTo(a) - me.distanceTo(b));
    } catch (_) { /* yoksay */ }
    this._spawnerCache = list;
    this._spawnerCacheTs = tNow;
    return list;
  }

  // Bot ile hedef arasinda DUVAR var mi? (line of sight)
  // blockAtCursor: botun baktigi yonde CARPILAN ILK kati blogu doner.
  // O blok spawner'in kendisi ise gorus ACIK (kirilabilir); baska bir kati
  // blok (duvar/tepe) ise KAPALI -> kazma baslatilmaz.
  hasClearView(bot, pos) {
    try {
      const center = pos.offset(0.5, 0.5, 0.5);
      // Paket 77: force=false - bakis her seferinde PAKET GONDERMEZ; yon
      // istemcide aninda degisir (blockAtCursor yerel isinladigi icin yeterli),
      // paket ise yalnizca gercek degisim olunca (vanilla esigi) gider. Boylece
      // ping arttiginda "look paket tufani" kaynakli sunucu kick'leri onlenir.
      try { bot.lookAt(center, false); } catch (_) { /* yoksay */ }
      const cursor = bot.blockAtCursor(5);
      if (!cursor) return true;
      const c = cursor.position;
      return c.x === pos.x && c.y === pos.y && c.z === pos.z;
    } catch (_) {
      return true;   // hata olursa toleransli davran (ancak kirmadan once yine kontrol var)
    }
  }

  // Fizik ASLA gecici acilmaz (paket 77/5: freeze->move imzasi gx01'i cekiyor).
  // Kullanici fizigi kapaliysa bot HIC yurumez; restorePhysics yalnizca
  // stop() temizligi/havada kalan eski durumlar icin korunmustur.

  restorePhysics() {
    const bot = this.bot;
    if (bot && this._prevPhysics !== undefined) {
      const was = bot.physicsEnabled;
      try { bot.physicsEnabled = !!this._prevPhysics; } catch (_) {}
      if (was === true && this._prevPhysics === false) {
        // Paket 77/4: bu log 60 sn'de bir (her dongude degil - konsol bogulmasin)
        const now = Date.now();
        if (now - this.lastPhysLog >= 60000) {
          this.lastPhysLog = now;
          this.logger.info(this.logger.L(
            'Fizik eski haline donduruldu (kapali).',
            'Physics restored (off).'));
        }
      }
    }
    this._prevPhysics = undefined;
  }

  async ensurePickaxe(bot) {
    // heldItem bazen gec guncellenir; hem bot.heldItem hem bot.inventory.heldItem
    // dogrulanir (paket 79). Paket 80: kusanma basarisi lastPickaxeOkName ile
    // hatirlanir; heldItem gecikse bile digMs hiz hesabi dogru cikar.
    const heldNow = () => {
      try {
        const h = bot && bot.heldItem;
        if (h) return h;
        return (bot.inventory && bot.inventory.heldItem) || null;
      } catch (_) { return null; }
    };
    this.lastPickaxeOkName = null;   // bu turda kusanma olmazsa hiz tahmini yapilmaz
    // Elde zaten uygun kazma varsa degistirme
    const held = heldNow();
    if (held && isPickaxe(held.name)) {
      this.lastPickaxeOkName = held.name;
      return true;
    }
    let pick = null;
    try { pick = bestPickaxe(bot.inventory.items()); } catch (_) { pick = null; }
    if (!pick) return false;
    let equipped = false;
    let lastErr = '';
    // Paket 80: kazma ZATEN hotbar'daysa window-click tasima GEREKMEZ -
    // hotbar degisimi tek pakettir ve her sunucuda isler. "7,5 sn" sorununun
    // bilinen kaynagi envanter->hotbar tasima reddiydi; hotbar yolu o riski atlar.
    let hotbar = null;
    try {
      const slots = bot.inventory && bot.inventory.slots;
      if (slots) {
        const hb = [];
        for (let i = 36; i <= 44; i++) {
          const it = slots[i];
          if (it && isPickaxe(it.name)) hb.push({ it, idx: i - 36 });
        }
        if (hb.length) {
          const champ = bestPickaxe(hb.map((h) => h.it));
          const entry = champ ? hb.find((h) => h.it === champ) : null;
          if (entry) hotbar = { name: entry.it.name, slot: entry.idx };
        }
      }
    } catch (_) { /* yoksay */ }
    if (hotbar) {
      for (let i = 0; i < 2 && !equipped; i++) {
        try {
          await bot.setQuickBarSlot(hotbar.slot);
          await sleep(250);
          const nh = heldNow();
          equipped = !!(nh && nh.name === hotbar.name);
          if (!equipped && nh && isPickaxe(nh.name)) equipped = true;
        } catch (e) {
          lastErr = (e && e.message) || String(e);
          await sleep(250);
        }
      }
      if (equipped) {
        this.lastPickaxeOkName = hotbar.name;
        this.lastPickaxeFail = null;
        this.logger.info(this.logger.L('Kazma kusanildi (hotbar): ', 'Pickaxe equipped (hotbar): ') + hotbar.name);
        return true;
      }
    }
    // Hotbar'da yoksa envanterden kusan (window-click tasima; bazi sunucular
    // reddedebilir - o zaman asagidaki uyari gorunur, kalici cozum hotbar).
    // Paket 79: kusanma 3 kez denenir (sunucu/envanter senkronu gecikebilir).
    for (let i = 0; i < 3 && !equipped; i++) {
      try {
        await bot.equip(pick, 'hand');
        await sleep(200);
        const nh = heldNow();
        equipped = !!(nh && nh.name === pick.name);
        if (!equipped && nh && isPickaxe(nh.name)) equipped = true;
      } catch (e) {
        lastErr = (e && e.message) || String(e);
        await sleep(300);
      }
    }
    if (equipped) {
      this.lastPickaxeOkName = pick.name;
      this.lastPickaxeFail = null;
      this.logger.info(this.logger.L('Kazma kusanildi: ', 'Pickaxe equipped: ') + pick.name);
      return true;
    }
    // Kazma var ama kusanilamadi - nedenini sakla ve logla (tespit icin).
    this.lastPickaxeFail = pick.name + (lastErr ? (' / ' + lastErr) : '');
    this.logger.warn(this.logger.L('Kazma kusanilamadi: ', 'Could not equip pickaxe: ') + pick.name +
      (lastErr ? (' — ' + lastErr) : '') +
      this.logger.L('. Sunucu eli bos goruyor; kalici cozum: kazmayi 1. hotbar slotuna koy ve yeniden tetikle.',
        '. The server sees an empty hand; permanent fix: put the pickaxe in hotbar slot 1 and retrigger.'));
    return false;
  }

  loggerWarnNoPickaxe(bot) {
    if (this.warnedNoPickaxe) return;
    this.warnedNoPickaxe = true;
    // Paket 78: creative modda kazmaya hic gerek yok - kirma aninda olur.
    if (this.detectGameMode(bot) === 1) {
      this.logger.info(this.logger.L(
        'Kazma gerekmiyor: bot CREATIVE modda — spawnerlar aninda kirilir.',
        'No pickaxe needed: bot is in CREATIVE mode — spawners break instantly.'));
      return;
    }
    let inv = '';
    try {
      inv = (bot && bot.inventory && bot.inventory.items()
        ? bot.inventory.items().map((i) => i.name).slice(0, 12).join(', ')
        : '');
    } catch (_) { /* yoksay */ }
    this.logger.warn(this.logger.L(
      'Envanterde kazma YOK; spawner kazmasiz kesilip YOK EDILIYOR (dusmez). Kazmasiz VANILLA kirma 7,5 sn surer; hizli kirma icin bota Ipeksi Dokunuslu kazma verin (elmas+Eff5 ~0,25 sn).',
      'No pickaxe in inventory; the spawner will be DESTROYED without a drop. Vanilla bare-hand breaking takes 7.5s; give the bot a silk touch pickaxe for fast breaking (~0.25s with diamond+Eff5).') +
      (inv ? (' Envanter: ' + inv) : ''));
  }

  // Kazma olmadan kirmak zorunda kalindiginda ham paketlerle kirmayi dener.
  // (mineflayer'in bot.dig() kazma yokken "dig time is Infinity" firlatir.)
  // Not: kazmasiz kirilan spawner DUSMEZ (yok edilir).
  _swingSafe(bot) {
    try {
      const p = bot.swingArm && bot.swingArm();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* yoksay */ }
  }

  // Vanilla kazma suresi (ms). Minecraft formulu:
  //   dogru alet: sertlik * 1.5 / hiz   (hiz = alet hizi + Eff^2 + 1)
  //   kazma yok (survival): 7.5 sn (spawner sertlik 5 x 1.5 -> vanilla; "yanlis
  //   alet" resmi 25 sn, makul yedek olarak 7.5 sn kullanilir).
  // Paket 77/7: YARATICI modda kirma ANINDA olur (vanilla) - alet/eff onemsiz;
  // sunucu status-0'i alir almaz blogu kirdigi icin bekleme suresi 150 ms.
  // Sure asla keyfi degil, botun ELINDEKI alete gore hesaplanir:
  //   tas kazma ~3.75 sn / demir ~1.25 sn / elmas ~0.95 sn / elmas+Eff5 ~0.25 sn.
  computeDigMs(block, equippedOk) {
    try {
      const bot = this.bot;
      // Paket 78: cok katmanli gamemode tespiti (player.gamemode / game.gameMode
      // / game.gameType) - surum ve sunucu farklarina karsi dayanikli.
      if (this.detectGameMode(bot) === 1) return 150;     // creative: instant kirma
      // Paket 80: hiz kaynagi sirasiyla -
      //   (a) elde gorulen kazma,
      //   (b) bu sefer basariyla kusanan kazma (heldItem gec guncellenirse
      //       lastPickaxeOkName kullanilir; hotbar yolu sunucuda kesindir),
      //   (c) equippedOk (envanterden kusma basarisi).
      // Hic kazma kusanilamadiysa vanilla 7,5 sn - sunucu eli bos goruyorken
      // hizli status-2 "aninda kirma" (gx01) imzasi ceker, o yuzden hiz yok.
      let item = null;
      try {
        const held = bot && bot.heldItem;
        if (held && isPickaxe(held.name)) item = held;
        else if (this.lastPickaxeOkName && isPickaxe(this.lastPickaxeOkName)) item = { name: this.lastPickaxeOkName };
        else if (equippedOk) item = bestPickaxe(bot.inventory.items());
      } catch (_) { item = null; }
      // Sertlik: prismarine-block "diggingTime" bazi surumlerde ms (5000) doner,
      // bazilarinda fonksiyon/NaN olur. Spawner sertligi 5'tir; ms geldiyse sn'ye.
      let hardness = 5;
      try {
        const dt = Number(block && block.diggingTime);
        hardness = Number.isFinite(dt) && dt > 0 ? (dt > 200 ? dt / 1000 : dt) : 5;
      } catch (_) { hardness = 5; }
      if (item && isPickaxe(item.name)) {
        let speed = toolSpeedOf(item.name);
        const eff = effLevelOf(item);
        if (eff > 0) speed += eff * eff + 1;
        speed = Math.max(1, speed);
        const sec = (hardness * 1.5) / speed;
        return Math.min(10000, Math.max(200, Math.ceil((sec * 1000) / 50) * 50));
      }
      return 7500;                                      // kazma yok (survival): vanilla 7.5 sn
    } catch (_) {
      return 7500;
    }
  }

  // Paket 77(2): VANILLA kirma oncelikli.
  // Modern protokolde (1.19.4+) istemci "status 2 (finish)" paketini GONDERMEZ;
  // sunucu kazma suresi bitince blogu kendisi kirar ve block update yollar.
  // "status 2" paketi sunucuyu ANINDA kirdirir ve anticheat tarafindan
  // "aninda kirma / dogal olmayan dig" imzasi olarak isaretlenebilir (NexoMC
  // "gx01" gibi). Bu yuzden ILK DENEME tamamen vanilladir; sunucu blok
  // guncellemesi gonderip kirmazsa SONRAKI denemelerde status 2 ile kirilir
  // (bu sunucularda hala calistigi bilinen yol). Boylece normal calismada
  // hicbir hile imzasi yok, gerektiginde eski yol devreye girer.
  async rawDig(block, digMs, useFinishPacket) {
    const bot = this.bot;
    if (!bot || !bot._client) return false;
    const pos = block.position;
    // Bosluga kazmasin: blok artik spawner degilse "zaten kirilmis" say.
    try {
      const cur = bot.blockAt(pos);
      if (!cur || cur.type === 0 || !this.isSpawner(cur)) return true;
    } catch (_) { /* yoksay */ }
    // Vanilla gibi: botun baktigi YUZU hesapla (yanlis yuz anticheat ceker)
    let face = 1;                                       // top
    try {
      const eye = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
      const c = pos.offset(0.5, 0.5, 0.5);
      const d = c.minus(eye);
      const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
      if (ay > ax && ay > az) face = d.y > 0 ? 1 : 0;   // top / bottom
      else if (ax > az) face = d.x > 0 ? 5 : 4;         // east / west
      else face = d.z > 0 ? 3 : 2;                      // south / north
    } catch (_) { /* yoksay */ }
    try {
      await bot.lookAt(
        pos.offset(
          0.5 + (face === 5 ? 0.5 : face === 4 ? -0.5 : 0),
          0.5 + (face === 1 ? 0.5 : face === 0 ? -0.5 : 0),
          0.5 + (face === 3 ? 0.5 : face === 2 ? -0.5 : 0)
        ), false);
    } catch (_) { /* yoksay */ }
    // Paket 77: ard arda block_dig paketlerini biriktirme - en az 250 ms ara
    try {
      const tNow = Date.now();
      if (this._lastDigAt && tNow - this._lastDigAt < 250) await sleep(250 - (tNow - this._lastDigAt));
    } catch (_) { /* yoksay */ }
    try {
      bot._client.write('block_dig', { status: 0, location: pos, face }); // start digging
      this._lastDigAt = Date.now();
    } catch (_) { return false; }
    // Paket 77(3): fizik artik kazma sirasinda KAPATILMAZ - gercek oyuncu kazma
    // boyunca konum paketlerini gonderir; ani dusurup acmak anticheat'e garip
    // gelir. (Hareket paketlerinin patlamasi zaten global tavanda duzlestirilir.)
    const swingTimer = setInterval(() => this._swingSafe(bot), 300);
    const eventName = 'blockUpdate:' + pos;
    return await new Promise((resolve) => {
      let settled = false;
      let finishTimer = null;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearInterval(swingTimer);
        if (finishTimer) clearTimeout(finishTimer);
        bot.removeListener(eventName, onUpd);
        clearTimeout(timeoutTimer);
        resolve(ok);
      };
      const onUpd = (oldB, newB) => {
        if (newB && newB.type !== 0) return;            // blok havayla degismedi, bekle
        finish(true);                                   // sunucu kirdigini bildirdi
      };
      // Paket 77/3: vanilla ilk denemede sunucunun DOGAL kirma suresi biraz
      // daha uzun olabileceginden timeout genisletildi (digMs+3500); sunucu
      // kendisi kirmadan force-finish'e gecilmez.
      const timeoutTimer = setTimeout(() => finish(false), digMs + 3500);
      bot.on(eventName, onUpd);
      // "status 2" yalnizca gercekten gerektiginde (tekrar denemeler) gonderilir.
      if (useFinishPacket) {
        finishTimer = setTimeout(() => {
          try {
            const cur = bot.blockAt(pos);
            if (cur && cur.type !== 0 && this.isSpawner(cur)) {
              bot._client.write('block_dig', { status: 2, location: pos, face }); // force finish
            }
          } catch (_) { /* yoksay */ }
        }, digMs);
      }
    });
  }

  // Spawner kalmayana kadar kir; bitince yeniden bekle.
  async breakLoop() {
    if (this.busy) return;
    this.busy = true;
    const bot = this.bot;
    // Paket 77/5: FIZIK ASLA GECICI AÇILMAZ. 77/4 testinde goruldu: fizik
    // ac/kapa = "donup sonra hareket etme" (freeze->move) imzasi; NexoMC gx01
    // bunu ~30 sn icinde yakaliyor (kazma gonderilmeden bile). Fizik kapaliysa
    // bot HIC yurumez (sadece dokunma mesafesindeki spawner'lari kirar); fizik
    // KULLANICI tarafindan aciksa yuruyup kirar (gercek oyuncu gibi surekli
    // hareket, gecis yok). Ulasilamayan spawner 120 sn tekrar denenmez ->
    // ardisik "burst yurume" dongusu de yok.
    let exitNow = false;
    try {
      if (!(await this.ensurePickaxe(bot))) this.loggerWarnNoPickaxe(bot);

      const failed = new Set();   // ulasilamayan spawner'lar tekrar denenmesin
      let foundAny = false;       // paket 77: hic spawner bulunamadiysa cikma
      let brokeAny = false;       // paket 77/4: bu turda kirilabilen oldu mu?
      let guard = 0;
      while (this.running && this.busy && bot && bot.entity) {
        if (++guard > 240) break;                       // guvenlik valfi (~3 dk)
        const spawners = this.findSpawners();
        if (!spawners.length) break;
        foundAny = true;
        if (guard === 1) {
          this.logger.info(this.logger.L('Tespit edilen spawner sayisi: ', 'Spawners found: ') + spawners.length);
        }
        let progressed = false;
        for (const pos of spawners) {
          if (!this.running || !this.busy || !bot || !bot.entity) return;
          const key = pos.x + ',' + pos.y + ',' + pos.z;
          if (failed.has(key)) continue;
          const block = bot.blockAt(pos);
          if (!block || !this.isSpawner(block)) continue;
          progressed = true;
          const ok = await this.breakSpawner(block);
          if (!ok) failed.add(key); else brokeAny = true;
          await sleep(150);
          break;                                        // her turda bir tane; sonra yeni tara
        }
        if (!progressed) break;
      }
      // Paket 77: "exitAfterBreak" aciksa tum spawnerlar kirildi -> oyundan cik.
      if (this.running && this.cfg.exitAfterBreak && foundAny) {
        exitNow = true;
        this.logger.info(this.logger.L(
          'Tüm spawnerlar kırıldı; ayar gereği oyundan çıkılıyor.',
          'All spawners broken; exiting the game (as configured).'));
      }
    } catch (e) {
      this.logger.warn(this.logger.L('Spawner korumasi hatasi: ', 'Spawner protect error: ') + ((e && e.message) || String(e)));
    } finally {
      try { this.clearControls(); } catch (_) {}
      // Havada donup kalmasin: fizik hala acikken yere inmesi beklenir,
      // sonra fizik eski haline dondurulur.
      try {
        const b2 = this.bot;
        const waitEnd = Date.now() + 3000;
        while (b2 && b2.entity && b2.physicsEnabled && !b2.entity.onGround && Date.now() < waitEnd) {
          await sleep(100);
        }
      } catch (_) { /* yoksay */ }
      this.restorePhysics();
      this.busy = false;
      if (exitNow) {
        // Ayar geregi oyundan cik: onExit (BotManager.disconnect -> otomatik
        // yeniden baglanma engellenir) veya dogrudan bot.quit
        if (this.onExit) { try { this.onExit(); } catch (_) {} }
        else if (this.bot) { try { this.bot.quit('spawner protect: all broken'); } catch (_) {} }
        this.running = false;
        this.armed = false;
      } else if (this.running) {
        // Paket 77/4: hicbir spawner kirilamadiysa konsolu bogma - 10 sn bekle
        // (intruder hala oradaysa dongu tekrar tetiklenir ama loglar kisilir).
        const delay = brokeAny ? 2000 : 10000;
        this.rearmTimer = setTimeout(() => { this.armed = true; }, delay);
        const dn = Date.now();
        if (dn - this.lastDoneLog >= 30000) {
          this.lastDoneLog = dn;
          this.logger.info(this.logger.L('Spawner korumasi tamam; yeniden bekleniyor.', 'Spawner protect done; waiting again.'));
        }
      }
    }
  }

  // Tek spawner'a dogru yuru (engel varsa zipla) ve egilerek kir.
  async breakSpawner(block) {
    const bot = this.bot;
    if (!bot || !bot.entity || !this.running || !this.busy) return false;
    const target = block.position;
    const center = target.offset(0.5, 0.5, 0.5);
    // Paket 77/5: VANILLA ERISIM SINIRI (3.5 blok).
    //  * Fizik KAPALIYSA: bot HIC yurumez, fizigi acip kapatmaz (freeze->move
    //    imzasi gx01'i cekiyor - 77/4'te kazmasiz bile kick geldi). Sadece
    //    erisim mesafesi icindeki spawner'lar kirilir; uzaklar atlanir.
    //  * Fizik ACIKSA (kullanici acmis): sinirli yurume (<8 sn) + kazma.
    //  * Ulasilamayan spawner 120 sn "gaveUp" kuyruguna girer: o surede tekrar
    //    denendiginde yurume gonderilmez (burst yurume dongusu yok).
    const REACH = 3.5;
    let dist = 999;
    try { dist = bot.entity.position.distanceTo(center); } catch (_) {}
    const gaveKey = target.x + ',' + target.y + ',' + target.z;
    // Paket 77/7: erisim mesafesi ICINDE olan spawner her zaman denenir - onceki
    // "vazgectim" kuyrugu (120 sn) YALNIZCA yurume gereken durumlar icindir;
    // yoksa yakinindaki spawner kuyruga takilip HIC kazilmaz kalabiliyordu.
    if (dist > REACH) {
      const gUpTs = this.gaveUp.get(gaveKey) || 0;
      if (Date.now() - gUpTs < 120000) return false;               // son 120 sn: yurume denenmiyor
      if (!bot.physicsEnabled) {
        this.gaveUp.set(gaveKey, Date.now());
        const now = Date.now();
        if (now - this.lastSkipLog >= 30000) {
          this.lastSkipLog = now;
          this.logger.info(this.logger.L(
            'Fizik kapalı, yürünmedi (spawner uzakta, atlandı): ',
            'Physics off, no walk (spawner too far, skipped): ') + target.toString() +
            this.logger.L(' — karakter spawnerların yakınındaysa kırılır; uzak spawnerlara yürümek için Bot Physics açılmalı.',
              ' — will break when the character stands near the spawner; enable Bot Physics to walk to distant ones.'));
        }
        return false;
      }
      const reached = await this.goNear(target, 8000);
      if (!reached) {
        this.gaveUp.set(gaveKey, Date.now());
        const now = Date.now();
        if (now - this.lastSkipLog >= 30000) {
          this.lastSkipLog = now;
          this.logger.info(this.logger.L(
            'Spawner ulaşılamadı (atlandı): ', 'Spawner unreachable (skipped): ') + target.toString());
        }
        return false;
      }
      try { dist = bot.entity.position.distanceTo(center); } catch (_) {}
      if (dist > REACH) {
        this.gaveUp.set(gaveKey, Date.now());
        const now = Date.now();
        if (now - this.lastSkipLog >= 30000) {
          this.lastSkipLog = now;
          this.logger.warn(this.logger.L('Spawner hala cok uzakta (atlandi): ', 'Spawner still too far (skipped): ') + target.toString());
        }
        return false;
      }
    }
    // Erisim saglandi -> "ulasilamadi" kuyrugundan cikar.
    this.gaveUp.delete(gaveKey);
    if (!this.running || !this.busy || !bot || !bot.entity) return false;

    // Paket 77: DUVAR ARKASINA KIRMA ENGELLENDI - goNear gorusu saglamadan
    // "ulasildi" demez; buradaki kontrol son guvenlik katmani:
    // arada hala kati blok varsa kazma HIC baslatilmaz (hileye benzemez).
    if (!this.hasClearView(bot, target)) {
      this.logger.warn(this.logger.L(
        'Spawner duvar arkasinda kaldigi icin atlandi (gorus yok): ',
        'Spawner skipped - behind a wall (no line of sight): ') + target.toString());
      return false;
    }
    if (!this.running || !this.busy || !bot || !bot.entity) return false;

    // Kazmayi kusan; ardindan VANILLA kirma suresini eldeki alete gore hesapla.
    // (Mineflayer bu surumde spawner icin digTime() hep Infinity veriyor -
    //  "Eff5 kazmayla bile 7.5 sn" sorununun kaynagi buydu. Sure artik formulle
    //  hesaplanir: Eff5 elmas ~0.25 sn, tipki gercek oyuncu gibi.)
    let pickOk = false;
    try {
      pickOk = await this.ensurePickaxe(bot);
    } catch (_) { pickOk = false; }
    if (!pickOk) this.loggerWarnNoPickaxe(bot);
    // Paket 79: kazma GERCEKTEN kusanilamadiysa hizli finish oyunu YOK - sunucu
    // eli bos goruyorsa hizli status-2 "aninda kirma" (gx01) imzasi ceker; o
    // durumda vanilla 7,5 sn'de kazmasiz kirilir (sunucunun kendi suresi).
    const digMs = this.computeDigMs(block, pickOk);

    try { await bot.lookAt(target.offset(0.5, 0.5, 0.5), false); } catch (_) {}
    bot.setControlState('sneak', true);                 // shift basili tut
    let attempts = 0;
    let broken = false;
    // Paket 78: loga gamemode + eldeki alet eklenir - "neden uzun suruyor?" sorusu
    // konsolda kendiliginden cevaplanir. Paket 80: heldItem gecikirse kusanan
    // kazmanin adi (lastPickaxeOkName) kullanilir, kusanilamadiysa nedeni.
    const heldTxt = (bot.heldItem && bot.heldItem.name) || this.lastPickaxeOkName || this.lastPickaxeFail || 'bos el/empty hand';
    this.logger.info(this.logger.L('Spawner kirilmayi deniyor: ', 'Attempting to break spawner: ') + target.toString() +
      this.logger.L(
        ` (vanilla sure ~${Math.round(digMs / 100) / 10} sn | mod: ${this.modeLabel(this.detectGameMode(bot))} | el: ${heldTxt})`,
        ` (vanilla time ~${Math.round(digMs / 100) / 10}s | mode: ${this.modeLabel(this.detectGameMode(bot))} | held: ${heldTxt})`));
    while (this.running && this.busy && attempts < 3) {
      attempts++;
      // Kullanici ya da baskasi bu arada kirarsa boslugu kazmayi birak.
      try {
        const cur = bot.blockAt(block.position);
        if (!cur || cur.type === 0 || !this.isSpawner(cur)) { broken = true; break; }
      } catch (_) { /* yoksay */ }
      try {
        // Paket 77(2): ilk deneme VANILLA (status 2 yok), tekrarlarda force-finish.
        const ok = await this.rawDig(block, digMs, attempts > 1);
        if (ok) { broken = true; break; }
        if (!this.running || !this.busy) break;
        await sleep(400);
      } catch (e) {
        if (!this.running || !this.busy) break;
        await sleep(400);
      }
    }
    bot.setControlState('sneak', false);                // kirma bitti, yurume serbest
    if (broken) {
      this.logger.info(this.logger.L('Spawner kirildi: ', 'Spawner broken: ') + target.toString());
    }
    return broken;
  }

  // Hedefe erisim mesafesine gelene kadar yuru.
  // - Onunde 1 blokluk engel varsa ZIPLAR (sadece yerdeyken),
  // - 2 blokluk duvar varsa ZIPLAMAZ; sag/sol kayarak etrafindan dolasir
  //   (duvar takibi - hile gibi duvarin arkasini kirip gorunmez),
  // - Ziplama kuyrugu (jumpQueued) her birakista temizlenir -> havada donma yok.
  // Paket 77/4: sinirli yurume - maxMs icinde erisim mesafesine varilamazsa
  // pes edilir (surekli duvara surtup "hareket paketi tufani" yaratmaz).
  // Paket 72: goNear sarmalayicisi - yurume boyunca rubber-band sayacini acik
  // tutar, sonunda ozetler. Sunucu "flight" sanip konumu geri cekiyorsa bu
  // kanit logda gorunur ("Sunucu konumu geri cekiyor (rubber-band)").
  async goNear(pos, maxMs = 12000) {
    this.rbActive = true;
    this.rbCount = 0;
    this.hookRubberBand(this.bot);
    try {
      return await this.goNearInner(pos, maxMs);
    } finally {
      this.rbActive = false;
      const now = Date.now();
      if (this.rbCount >= 3 && now - this.lastRbLog > 30000) {
        this.lastRbLog = now;
        this.logger.warn(this.logger.L(
          `Yurume sirasinda sunucu konumu ${this.rbCount} kez geri cekti -> flight korumasi yurumeyi reddediyor olabilir. Spawner'lari botun 3,5 blok icindeki acik yerine koyun; bu sunucuda fizik kapali profil daha guvenli.`,
          `The server pulled our position back ${this.rbCount} times during walking -> anti-flight may be rejecting movement. Place spawners within 3.5 blocks in the open; physics-off profile is safer on this server.`));
      }
    }
  }

  // Paket 72: yurume (rbActive) sirasinda gelen clientbound position
  // duzeltmelerini sayar. Normal yurumede boyle duzeltme GELMEZ; geliyorsa
  // sunucu bizim hareketimizi gecersiz (ucma) sayiyor demektir.
  hookRubberBand(bot) {
    if (!bot || !bot._client || this.rbHooked) return;
    this.rbHooked = true;
    bot._client.on('position', () => {
      try {
        if (!this.rbActive || !this.running) return;
        this.rbCount++;
        const now = Date.now();
        if (now - this.rbLogAt > 20000) {
          this.rbLogAt = now;
          this.logger.warn(this.logger.L(
            `Sunucu konumumuzu geri cekiyor (rubber-band) -> yurume flight korumasi tarafindan reddediliyor olabilir (${this.rbCount} kez).`,
            `Server is correcting our position (rubber-band) -> walking may be rejected by anti-flight (${this.rbCount} times).`));
        }
      } catch (_) { /* yoksay */ }
    });
  }

  async goNearInner(pos, maxMs = 12000) {
    const bot = this.bot;
    if (!bot || !bot.entity) return false;
    const reach = 2.6;
    const start = bot.entity.position;
    const startedAt = Date.now();
    // Paket 77: mesafe yeterli olsa bile GORUS yoksa (duvar arada) durma;
    // duvar takibi ile etrafindan dolas.
    if (start.distanceTo(pos) <= reach && this.hasClearView(bot, pos)) return true;
    let guard = 0;
    let stuck = 0;
    let lastPos = null;
    let lastJumpAt = -9999;
    let strafeSide = 0;          // -1: duvar boyunca sola, +1: saga, 0: duz
    let strafeTicks = 0;
    this._releaseJump(bot);
    while (this.running && this.busy && bot && bot.entity) {
      if (Date.now() - startedAt > maxMs) { this.stopMoving(); return false; }
      const p = bot.entity.position;
      const dist = p.distanceTo(pos);
      const visible = dist <= reach + 0.5 ? this.hasClearView(bot, pos) : false;
      if (dist <= reach && visible) { this.stopMoving(); return true; }
      // ilerleme yok mu? (duvara/yigina surtuyor) - lastPos KOPYALANIYOR,
      // yoksa stuck sayaci her turda artar (paket 77 duzeltmesi)
      if (lastPos && p.distanceTo(lastPos) < 0.05) stuck++;
      else stuck = 0;
      lastPos = p.clone();
      if (stuck > 60) {                                   // ~6.6 sn hic ilerlemedi
        this.stopMoving();
        return dist <= 3.5 && this.hasClearView(bot, pos); // gorunuyorsa kirma dene (paket 77/3: erisim siniri)
      }
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const len = Math.hypot(dx, dz);
      if (!len) { this.stopMoving(); return true; }
      const yaw = Math.atan2(-dx, -dz);
      // Paket 77: force=false -> bakis paketi yalnizca gercek degisimde gider
      // (hareketle birlikte yigilip anticheat kick'i tetikleyen look tufani yok).
      try { await bot.look(yaw, 0, false); } catch (_) {}
      bot.setControlState('forward', true);
      // Paket 77/6: koruma yuruyusunde SPRINT YOK. Sprint hem ekstra
      // entity_action paketi yollar hem davranisi "scriptli" gosterir;
      // normal yurume hizi (4.3 m/s) kisa mesafeler icin yeterli.

      // Onumuzdeki bloklari tara
      const fx = dx / len, fz = dz / len;
      let lowBlock = false, headBlock = false;
      try {
        const ahead = bot.blockAt(p.offset(fx * 1.4, 0.1, fz * 1.4));
        const aheadHead = bot.blockAt(p.offset(fx * 1.4, 1.1, fz * 1.4));
        lowBlock = !!ahead && ahead.boundingBox === 'block';
        headBlock = !!aheadHead && aheadHead.boundingBox === 'block';
      } catch (_) { /* yoksay */ }

      // Paket 77: 2 blokluk duvar YA DA kisa mesafede arada duvar kalmis
      // (görüş yok): ziplamadan sag/sol kayarak etrafindan dolas.
      if ((lowBlock && headBlock) || (dist <= reach && !visible)) {
        const lx = -fz, lz = fx;                          // onun sol yonu
        let leftOpen = false, rightOpen = false;
        try {
          const l1 = bot.blockAt(p.offset(lx * 1.5, 0.1, lz * 1.5));
          const l2 = bot.blockAt(p.offset(lx * 1.5, 1.1, lz * 1.5));
          leftOpen = !(l1 && l1.boundingBox === 'block') && !(l2 && l2.boundingBox === 'block');
          const r1 = bot.blockAt(p.offset(-lx * 1.5, 0.1, -lz * 1.5));
          const r2 = bot.blockAt(p.offset(-lx * 1.5, 1.1, -lz * 1.5));
          rightOpen = !(r1 && r1.boundingBox === 'block') && !(r2 && r2.boundingBox === 'block');
        } catch (_) { /* yoksay */ }
        if (leftOpen && !rightOpen) strafeSide = -1;
        else if (rightOpen && !leftOpen) strafeSide = 1;
        else if (strafeSide === 0) strafeSide = rightOpen ? 1 : -1;
        if (stuck > 20 && strafeTicks > 40) {             // cikmaz: yon degistir
          strafeSide = -strafeSide;
          strafeTicks = 0;
          stuck = 0;
          lastPos = null;
        }
        strafeTicks++;
        bot.setControlState(strafeSide === -1 ? 'left' : 'right', true);
        bot.setControlState(strafeSide === -1 ? 'right' : 'left', false);
        this._releaseJump(bot);
      } else {
        // Engel yok ya da 1 blokluk (ziplanabilir) engel var
        bot.setControlState('left', false);
        bot.setControlState('right', false);
        let wantJump = false;
        try {
          if (lowBlock && !headBlock && bot.entity.onGround) wantJump = true;   // 1 blok: zipla
        } catch (_) { /* yoksay */ }
        // Sadece yerdeyken zipla; havadayken yeni ziplama emri verme.
        const grounded = bot.entity.onGround === true
          || (Math.abs((bot.entity.velocity || { y: 0 }).y) < 0.001 && (p.y - Math.floor(p.y)) < 0.05);
        if (wantJump && grounded && Date.now() - lastJumpAt > 600) {
          bot.setControlState('jump', true);
          lastJumpAt = Date.now();
        } else if (!wantJump || !grounded) {
          this._releaseJump(bot);
        }
      }
      await sleep(110);
      if (++guard > 360) {                                // ~40 sn tavan
        this.stopMoving();
        return dist <= 3.5 && this.hasClearView(bot, pos);
      }
    }
    this.stopMoving();
    return false;
  }

  // Ziplama emrini birak ve mineflayer'in kalici "jump kuyrugu"nu sifirla.
  // (jumpQueued temizlenmezse bot zipladiktan sonra bile otomatik ziplamaya
  //  devam eder -> gorunurde surekli ziplayip havada takilir.)
  _releaseJump(bot) {
    try {
      bot.setControlState('jump', false);
      bot.jumpQueued = false;
      bot.jumpTicks = 0;
    } catch (_) { /* yoksay */ }
  }

  stopMoving() {
    const bot = this.bot;
    if (!bot) return;
    try {
      bot.setControlState('forward', false);
      bot.setControlState('sprint', false);
      this._releaseJump(bot);
    } catch (_) { /* yoksay */ }
  }

  clearControls() {
    const bot = this.bot;
    if (!bot) return;
    try {
      bot.setControlState('forward', false);
      bot.setControlState('sprint', false);
      bot.setControlState('sneak', false);
      this._releaseJump(bot);
    } catch (_) { /* yoksay */ }
  }
}

module.exports = SpawnerProtect;