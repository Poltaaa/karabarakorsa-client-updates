'use strict';
// ---------------------------------------------------------------------------
// spawner-protect.js - Spawner korumasi
// ---------------------------------------------------------------------------
// Seçilen AFK hesabının "triggerRadius" blok yakınına whitelist'te olmayan
// görünür bir oyuncu gelirse bot:
//   1) Envanterindeki en iyi İpeksi Dokunuşlu kazmayı kuşanır; İpeksi bilgisi
//      yoksa kullanıcının isteğiyle en hızlı normal kazmaya geri düşer,
//   2) Sabit 150 blok koruma alanindaki TUM spawner'lari tek tek yaklasip
//      Shift basili tutarak (egilerek) kirar,
//   3) Ulasamadigi spawner'larin yanina yurur; SADECE onunde gercek
//      bir engel varsa ziplar (duzlukte surekli ziplamaz),
//   4) Merkezdeki koruma alaninda spawner kalmayana kadar devam eder;
//      exitAfterBreak açıksa hesabı güvenli biçimde oyundan çıkarır.
//
// SMP sunucularinin stacklenmis spawner sistemleri icin tasarlandi
// (Shift + sol tik = 64'luk grup kırma).
//
// ONEMLI TESPITLER (25.09.2026):
//  * Yürüme için fizik bağlantı kurulurken bu hesapta açık başlar. Özellik
//    bağlı hesaba sonradan açılırsa koruma ömrü boyunca açılır ve kapanınca
//    kullanıcının önceki fizik ayarına geri dönülür.
//  * İpeksi Dokunuşlu kazma her zaman önceliklidir. Sunucu büyü bilgisini
//    göndermiyorsa en hızlı normal kazma denenir; spawner eşya olarak düşmeyebilir.
//  * PAKET 75 NOT: digTime() spawner'da KAZMAYLA bile hep Infinity donebiliyor
//    (bu yuzden "Eff5 kazmayla bile 7.5 sn" sorunu vardi). Sure artik VANILLA
//    formulle hesaplanir: sertlik * 1.5 / alet hizi, Verimlilik^2 dahil ->
//    Eff5 elmas ~0.25 sn, tipki gercek oyuncu gibi kirilir.
//  * Kazma tek bir vanilla START -> süre -> FINISH akışıdır; blok güncellemesi
//    gelmezse zaman aşımı ve CANCEL paketiyle temizlenir.
//  * bot.jumpQueued bir kez true olunca mineflayer onu kendisi
//    temizlemez -> bot havadayken bile otomatik ziplamayi surdurup
//    "surekli zipliyor / havada donuyor" goruntusu verir. Bu modul
//    ziplamayi her biraktiginda bot.jumpQueued/jumpTicks'i sifirlar.
//  * Yürüyüş bitince forward/back/left/right/jump durumlarının tamamı temizlenir.
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
const SpawnerIndex = require('./spawner-index');

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

// Sunucu/proxy oyuncuyu bot.players icinde UUID, gecici anahtar veya farkli
// buyuk-kucuk harfle tutabilir. Guvenilir kontrolu gorunen username ile de
// yapilabilsin diye tek kanonik bicim.
function normPlayerName(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC')
    .replace(/§[0-9a-fk-or]/gi, '')
    // Proxy/tab listesi gorunmeyen LRM/RLM/word-joiner gibi baska Unicode
    // format karakterleri de ekleyebilir. Logda ayni gorunen "poltaaa"nin
    // trusted eslesmesini kacirmamasi icin tum Cf karakterlerini kaldir.
    .replace(/\p{Cf}/gu, '')
    .trim()
    .toLocaleLowerCase('en-US');
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

// Sunucu/protokol sürümüne göre büyüler farklı yapılarda gelebiliyor:
// item.enchants, item.components, componentMap, eski NBT ench/Enchantments,
// 1.21+ minecraft:enchantments.levels veya yalnızca eşya lore'u.
// Bilinen kökleri sınırlı ve döngü güvenli biçimde tarayarak tek biçime çevir.
function enchantToken(value) {
  let v = value;
  for (let i = 0; i < 4 && v && typeof v === 'object' && !Array.isArray(v) && 'value' in v; i++) {
    const keys = Object.keys(v);
    if (keys.length > 3 && !('type' in v)) break;
    v = v.value;
  }
  if (v === null || v === undefined || typeof v === 'object') return '';
  return String(v).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/^minecraft:/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// 1.20.5+ item componentlerinde büyü "id" alanı eski sabit enchant ID'si
// değildir; o sürümün registry sıra numarasıdır. Örneğin Silk Touch 1.21.4'te
// 33, 1.21.11'de 34'tür. Bu yüzden sayıyı bot.registry üzerinden ada çevir.
function registryEnchantName(registry, rawId) {
  const id = Number(rawId);
  if (!registry || !Number.isInteger(id) || id < 0) return '';
  const pools = [
    registry.enchantments,
    registry.enchantmentsById,
    registry.enchantmentsArray
  ];
  for (const pool of pools) {
    if (!pool) continue;
    let entry = null;
    if (Array.isArray(pool)) {
      const direct = pool[id];
      entry = direct && (direct.id === undefined || Number(direct.id) === id)
        ? direct
        : pool.find((e) => e && Number(e.id) === id);
    }
    else if (pool instanceof Map) entry = pool.get(id) || pool.get(String(id));
    else if (typeof pool === 'object') entry = pool[id] || pool[String(id)];
    if (!entry && typeof pool === 'object') {
      try { entry = Object.values(pool).find((e) => e && Number(e.id) === id); } catch (_) {}
    }
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') {
      const name = entry.name || entry.key || entry.resourceLocation || entry.displayName;
      if (name) return String(name);
    }
  }
  const byName = registry.enchantmentsByName;
  if (byName && typeof byName === 'object') {
    try {
      const entry = Object.values(byName).find((e) => e && Number(e.id) === id);
      if (entry) return String(entry.name || entry.key || entry.displayName || '');
    } catch (_) {}
  }
  return '';
}

// 1.20.5+ item componentleri bazi proxylerde normalize `.enchants` getter'ina
// eksik yansirken Prismarine'in ham ağ çıktısında korunur.
function rawNotchItem(item) {
  try {
    const ctor = item && item.constructor;
    return ctor && typeof ctor.toNotch === 'function' ? ctor.toNotch(item) : null;
  } catch (_) {
    return null;
  }
}

function scanEnchantLevel(item, aliases, legacyNumericIds, registry) {
  if (!item) return 0;
  const wanted = aliases.map(enchantToken);
  const legacyIds = (Array.isArray(legacyNumericIds) ? legacyNumericIds : [legacyNumericIds])
    .map(Number).filter(Number.isFinite);
  const matches = (v) => {
    const t = enchantToken(v);
    return !!t && wanted.some((x) => t === x || t.endsWith('_' + x) || t.includes(x));
  };
  // prismarine-item 1.17'de item.enchants bir getter'dır ve 1.20.5+
  // component sürümlerinde NBT büyüsü yokken hata fırlatabilir. Tek bir getter
  // hatası component taramasını iptal etmesin; her kökü ayrı ve güvenli oku.
  const get = (obj, key) => {
    try { return obj && obj[key]; } catch (_) { return undefined; }
  };
  const nbt = get(item, 'nbt');
  const rawNotch = rawNotchItem(item);
  const roots = [
    get(item, 'components'), get(item, 'componentMap'),
    get(item, 'enchantments'), get(item, 'enchants'),
    rawNotch, nbt && get(nbt, 'value'), get(item, 'tag'),
    get(item, 'lore'), get(item, 'customLore'),
    get(item, 'displayName'), get(item, 'customName'), get(item, 'itemName')
  ].filter((x) => x !== null && x !== undefined);
  const stack = roots.map((value) => ({ value, depth: 0 }));
  const seen = new Set();
  let visited = 0;
  while (stack.length && visited++ < 900) {
    const { value, depth } = stack.pop();
    if (depth > 10 || value === null || value === undefined) continue;
    if (typeof value !== 'object') {
      if (matches(value)) return 1;
      continue;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    if (value instanceof Map) {
      for (const [key, child] of value.entries()) {
        stack.push({ value: { id: key, value: child }, depth: depth + 1 });
      }
      continue;
    }
    if (value instanceof Set) {
      for (const child of value.values()) stack.push({ value: child, depth: depth + 1 });
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => stack.push({ value: v, depth: depth + 1 }));
      continue;
    }
    const idRaw = value.id !== undefined ? value.id
      : (value.name !== undefined ? value.name
        : (value.enchantment !== undefined ? value.enchantment : value.key));
    const idToken = enchantToken(idRaw);
    const idNumber = Number(enchantToken(idRaw));
    const registryName = Number.isFinite(idNumber) ? registryEnchantName(registry, idNumber) : '';
    // Registry adı bulunduysa yalnızca ada güven. Registry yoksa eski NBT
    // sürümleri için legacy sayısal ID yedeğini kullan.
    const numericMatches = Number.isFinite(idNumber)
      && (registryName ? matches(registryName) : legacyIds.includes(idNumber));
    if (numericMatches || (idToken && matches(idToken))) {
      const lvlRaw = value.lvl !== undefined ? value.lvl
        : (value.level !== undefined ? value.level : value.value);
      const lvl = Number(enchantToken(lvlRaw));
      return Number.isFinite(lvl) && lvl > 0 ? lvl : 1;
    }
    for (const [key, child] of Object.entries(value)) {
      const keyToken = enchantToken(key);
      if (matches(keyToken)) {
        const lvl = Number(enchantToken(child));
        return Number.isFinite(lvl) && lvl > 0 ? lvl : 1;
      }
      // Sayısal eski enchant id'si yalnızca id alanında kabul edilir; başka
      // NBT sayılarının yanlışlıkla büyü sayılmasını engeller.
      if ((keyToken === 'id' || keyToken === 'enchantment_id')
        && (() => {
          const n = Number(enchantToken(child));
          if (!Number.isFinite(n)) return false;
          const resolved = registryEnchantName(registry, n);
          return resolved ? matches(resolved) : legacyIds.includes(n);
        })()) return 1;
      stack.push({ value: child, depth: depth + 1 });
    }
  }
  return 0;
}

// Verimlilik (Efficiency) buyu seviyesi. Sayisal id: efficiency = 35 (1.13+).
// Kaynaklar hasSilkTouch ile ayni: .enchants / NBT ench / 1.21+ components.
function effLevelOf(item, registry) {
  try {
    // Eski Java NBT ID 32; component registry ID'si 1.20.x'te 20,
    // 1.21+'da 8'dir. Aktif registry varsa her zaman onun adı önceliklidir.
    const scanned = scanEnchantLevel(item, ['efficiency', 'verimlilik'], [8, 20, 32], registry);
    if (scanned > 0) return scanned;
    const enc = item && item.enchants;
    if (Array.isArray(enc)) {
      for (const e of enc) {
        if (!e) continue;
        const id = e.id !== undefined ? e.id : (e.name !== undefined ? e.name : null);
        const numericId = Number(id);
        const resolved = Number.isFinite(numericId) ? registryEnchantName(registry, numericId) : '';
        if (id === 'efficiency' || id === 'minecraft:efficiency'
          || (resolved && enchantToken(resolved).includes('efficiency'))
          || (!resolved && [8, 20, 32].includes(numericId))) {
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
        const numericId = Number(raw);
        const resolved = Number.isFinite(numericId) ? registryEnchantName(registry, numericId) : '';
        if (raw === 'efficiency' || raw === 'minecraft:efficiency'
          || (resolved && enchantToken(resolved).includes('efficiency'))
          || (!resolved && [8, 20, 32].includes(numericId))) {
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
function hasSilkTouch(item, registry) {
  try {
    // Eski NBT ID 33; component registry ID'si 1.20.x'te 21,
    // 1.21.4'te 33, 1.21.11'de 34'tür.
    if (scanEnchantLevel(item,
      ['silk_touch', 'silk touch', 'ipeksi_dokunus', 'ipeksi dokunus'],
      [21, 33, 34], registry) > 0) return true;
    // prismarine-item'in normalize ettigi liste (id sayisal veya string olabilir)
    const enc = item && item.enchants;
    if (Array.isArray(enc)) {
      for (const e of enc) {
        if (!e) continue;
        const id = e.id !== undefined ? e.id : (e.name !== undefined ? e.name : null);
        const numericId = Number(id);
        const resolved = Number.isFinite(numericId) ? registryEnchantName(registry, numericId) : '';
        if (id === 'silk_touch' || id === 'minecraft:silk_touch'
          || (resolved && enchantToken(resolved).includes('silk_touch'))
          || (!resolved && [21, 33, 34].includes(numericId))) return true;
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
        const numericId = Number(raw);
        const resolved = Number.isFinite(numericId) ? registryEnchantName(registry, numericId) : '';
        if (raw === 'silk_touch' || raw === 'minecraft:silk_touch'
          || (resolved && enchantToken(resolved).includes('silk_touch'))
          || (!resolved && [21, 33, 34].includes(numericId))) return true;
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

// En iyi Ipeksi kazma: önce malzeme, eşitse Verimlilik seviyesi.
function bestPickaxe(items, registry) {
  let best = null;
  for (const it of items || []) {
    const tier = tierOf(it && it.name);
    if (tier < 0 || !hasSilkTouch(it, registry)) continue;
    const eff = effLevelOf(it, registry);
    if (!best || tier > best.tier || (tier === best.tier && eff > best.eff)) {
      best = { item: it, tier, eff };
    }
  }
  return best ? best.item : null;
}

// İpeksi Dokunuş yoksa gerçek kazma hızına göre en güçlü normal kazma.
// Verimlilik vanilla hızına Eff^2+1 eklediği için yalnızca malzeme sırası
// kullanılamaz (ör. Eff4 elmas, büyüsüz netheritten daha hızlıdır).
function bestAvailablePickaxe(items, registry) {
  let best = null;
  for (const it of items || []) {
    const tier = tierOf(it && it.name);
    if (tier < 0) continue;
    const eff = effLevelOf(it, registry);
    const speed = toolSpeedOf(it.name) + (eff > 0 ? eff * eff + 1 : 0);
    if (!best || speed > best.speed
      || (speed === best.speed && tier > best.tier)
      || (speed === best.speed && tier === best.tier && eff > best.eff)) {
      best = { item: it, speed, tier, eff };
    }
  }
  return best ? best.item : null;
}

function compactEnchantDebug(item, registry) {
  if (!item) return '';
  const safe = (fn) => { try { return fn(); } catch (_) { return undefined; } };
  const enc = safe(() => item.enchants);
  const components = safe(() => item.components);
  const componentTypes = Array.isArray(components)
    ? components.map((c) => c && c.type).filter(Boolean).join(',')
    : '';
  const replacer = (_key, value) => {
    if (typeof value === 'bigint') return String(value);
    if (value instanceof Map) return Object.fromEntries(value);
    if (Buffer.isBuffer(value)) return `<buffer:${value.length}>`;
    return value;
  };
  const short = (value, max = 220) => {
    try {
      const text = typeof value === 'string' ? value : JSON.stringify(value, replacer);
      return String(text || '').replace(/[\r\n\t]+/g, ' ').slice(0, max);
    } catch (_) { return ''; }
  };
  const ids = [];
  const list = Array.isArray(enc) ? enc
    : (enc && Array.isArray(enc.enchantments) ? enc.enchantments : []);
  for (const e of list) {
    if (!e) continue;
    const id = e.id !== undefined ? e.id : e.name;
    const lvl = e.level !== undefined ? e.level : e.lvl;
    const resolved = Number.isFinite(Number(id)) ? registryEnchantName(registry, Number(id)) : '';
    ids.push(`${id}${resolved ? '=' + resolved : ''}:${lvl === undefined ? '?' : lvl}`);
  }
  const lore = safe(() => item.customLore) || safe(() => item.lore);
  return [
    `${item.name || 'item'}@${item.slot === undefined ? '?' : item.slot}`,
    `ench=[${ids.join(',') || short(enc, 120) || '-'}]`,
    `components=[${componentTypes || '-'}]`,
    `lore=${short(lore, 120) || '-'}`
  ].join(' ');
}

function norm(section) {
  const s = section || {};
  return {
    triggerRadius: Math.min(50, Math.max(1, Number(s.triggerRadius) || 50)),
    // Paket 99: ayri spawner yaricapi secenegi kaldirildi. Koruma alani
    // sabit 150 blok; fizik kapaliysa erisim disindaki hedefler zaten yurunmeden
    // guvenli bicimde atlanir.
    breakRadius: 150,
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
    this._runEpoch = 0;
    this.busy = false;
    this.armed = false;
    // Aynı oyuncu yarıçap içinde dururken koruma tekrar tekrar tetiklenmez.
    // Yeni bir koruma olayı için alanın en az 2 sn boş kalması gerekir.
    this.waitingForClear = false;
    this.clearSince = 0;
    this._noSpawnerUntil = 0;
    this.timer = null;
    this.rearmTimer = null;
    this.warnedNoPickaxe = false;
    this.warnedSilkFallback = false;
    this.onExit = null;      // exitAfterBreak -> Baglanan/BotManager tarafindan atanir
    this._spawnerCache = null;   // paket 77: spawner taramasi onbellegi (500 ms)
    this._spawnerCacheTs = 0;
    this._spawnerIndex = null;
    this._spawnerCacheRevision = -1;
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
    this._protectPrevPhysics = undefined;
    this.protectOrigin = null; // tetik anındaki merkez; bot yürürken yarıçap kaymaz
    // Koruma zaten acikken yanina yeni spawner konursa normal oyuncu
    // tetigini beklemeden kir. Dinleyici start/stop ile birlikte yasamali;
    // aksi halde her ac-kapada ayni olay birden fazla kez calisir.
    this._placementHandler = null;
    this._placementTimer = null;
    this._placementQueue = new Map();
    // ChickenNW kaydinda 3 dakika icinde 12 otomatik spawner kirildiktan
    // sonra gx01 geldi. Yeni-yerlestirme akisini guvenli bir butceyle yay.
    this._successfulBreaks = [];
    this._lastPlacementSessionAt = 0;
    this._lastPlacementThrottleLog = 0;
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
      if (Array.isArray(t)) t.forEach((n) => {
        const key = normPlayerName(n);
        if (key) this.trusted.add(key);
      });
    } catch (_) { /* yoksay */ }
    this.lastTrustedLog = 0;
    if (bot && bot.username) this.friends.add(bot.username);
    this.warnedNoPickaxe = false;
    this.warnedSilkFallback = false;
    this.lastPickaxeFail = null;      // paket 79: her baslangicta temiz
    this.lastPickaxeOkName = null;    // paket 80: bu tur kusanan kazmanin adi (hiz icin)
    this.lastPickaxeOkItem = null;
    this.lastPickaxeHasSilk = false;
    this.running = true;
    this.armed = true;
    this.busy = false;
    this.waitingForClear = false;
    this.clearSince = 0;
    this._noSpawnerUntil = 0;
    this.protectOrigin = null;
    // Koruma Bot Physics ayarini ASLA kendi kendine degistirmez. ChickenNW'de
    // uzun sure sabit duran botun fizik acilip yurumesi gx01 tetikleyebiliyor.
    // Fizik kapaliysa erisimdeki spawner dogrudan kirilir, uzaga yurunmez.
    this._protectPrevPhysics = undefined;
    this.logger.info(this.logger.L(
      `Spawner Protect acik (algilama: ${this.cfg.triggerRadius} blok, koruma alani: sabit 150 blok)`,
      `Spawner Protect on (detect: ${this.cfg.triggerRadius} blocks, protection area: fixed 150 blocks)`));
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
    // Yeni yerlesen spawner'i olaydan yakala. Mevcut/chunk ile yuklenen
    // spawner'lar kendiliginden kirilmaz; yalnizca air/baska blok -> spawner
    // gecisi korumayi baslatir.
    this.attachPlacementWatcher(bot);
    this._spawnerIndex = new SpawnerIndex(bot);
    // Paket 77: 500 ms tarama -> yaricapla birisi icine girer girmez kirma baslar
    this.timer = setInterval(() => this.tick(), 500);
  }

  // Calisirken secenekler degistiyse bir sonraki taramada uygulanir
  apply(cfg) {
    const sp = (cfg && cfg.spawnerProtect) ? cfg.spawnerProtect : (cfg || {});
    this.cfg = norm(sp);
    // Kismi bir ayar guncellemesi (yalnizca enabled/radius gibi) trusted
    // alanini tasimiyorsa mevcut whitelist'i silme. Logda baslangicta
    // "Trusted: poltaaa" gorunmesine ragmen 23 sn sonra ayni ad tetiklemisti.
    if (Object.prototype.hasOwnProperty.call(sp, 'trusted')) {
      const nextTrusted = new Set();
      try {
        const t = sp.trusted;
        if (Array.isArray(t)) t.forEach((n) => {
          const key = normPlayerName(n);
          if (key) nextTrusted.add(key);
        });
        this.trusted = nextTrusted;
      } catch (_) { /* yoksay; mevcut listeyi koru */ }
    }
    return this.running;
  }

  stop() {
    ++this._runEpoch;
    const wasBusy = this.busy;
    this.detachPlacementWatcher();
    if (this._spawnerIndex) this._spawnerIndex.stop();
    this._spawnerIndex = null;
    this._spawnerCache = null;
    this._spawnerCacheTs = 0;
    this.running = false;
    this.armed = false;
    this.busy = false;
    this.waitingForClear = false;
    this.clearSince = 0;
    this._noSpawnerUntil = 0;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.rearmTimer) { clearTimeout(this.rearmTimer); this.rearmTimer = null; }
    if (this.bot) {
      try {
        // Bos durumdaki OFF/ON islemi global movement/sneak durumuna dokunmasin.
        // Onceki kod her stop() cagrisinda bes ayri kontrol birakma paketi
        // uretebiliyor, start() da yeniden stop() cagirdigi icin ac-kapa aninda
        // gereksiz player_input/stance degisimi olusabiliyordu.
        if (wasBusy) this.clearControls();
        if (this._protectPrevPhysics !== undefined) this.bot.physicsEnabled = !!this._protectPrevPhysics;
        this.restorePhysics();
      } catch (_) {}
    }
    this._protectPrevPhysics = undefined;
    this.protectOrigin = null;
    this.bot = null;
  }

  attachPlacementWatcher(bot) {
    this.detachPlacementWatcher();
    if (!bot || typeof bot.on !== 'function') return;
    this._placementHandler = (oldBlock, newBlock) => {
      try {
        if (!this.running || this.bot !== bot) return;
        // oldBlock yoksa bu genellikle chunk/dunya yuklemesidir. Yeniden
        // baglaninca mevcut spawner'lari kazmamak icin yalnizca gercek bir
        // blok gecisini kabul et.
        if (!oldBlock || !newBlock || !this.isSpawner(newBlock) || this.isSpawner(oldBlock)) return;
        const pos = newBlock.position;
        if (!pos || !bot.entity || !bot.entity.position) return;
        if (bot.entity.position.distanceTo(pos) > this.cfg.breakRadius) return;

        const key = `${pos.x},${pos.y},${pos.z}`;
        this._placementQueue.set(key, pos);

        // Yeni blok findBlocks onbellegine ve "spawner yok" beklemesine takilmasin.
        this._spawnerCache = null;
        this._spawnerCacheTs = 0;
        this._noSpawnerUntil = 0;
        // Yan yana hizla konulan spawnerlari tek bir guvenli grup olarak
        // toplayabilmek icin kisa bir yerlesim penceresi birak.
        this.schedulePlacementBreak(bot, 1200);
      } catch (_) { /* bozuk blok olayi korumayi durdurmasin */ }
    };
    bot.on('blockUpdate', this._placementHandler);
  }

  placementBudget(now = Date.now()) {
    this._successfulBreaks = this._successfulBreaks.filter((ts) => now - ts < 120000);
    const slots = Math.max(0, 5 - this._successfulBreaks.length);
    const budgetWait = slots > 0 ? 0 : Math.max(0, this._successfulBreaks[0] + 120000 - now);
    const gapWait = this._lastPlacementSessionAt
      ? Math.max(0, this._lastPlacementSessionAt + 6500 - now)
      : 0;
    return { slots, waitMs: Math.max(budgetWait, gapWait) };
  }

  schedulePlacementBreak(bot, minimumDelay = 0) {
    if (!this.running || this.bot !== bot || !this._placementQueue.size || this._placementTimer) return;
    const now = Date.now();
    const budget = this.placementBudget(now);
    const delay = Math.max(0, minimumDelay, budget.waitMs);
    if (delay > 5000 && now - this._lastPlacementThrottleLog > 15000) {
      this._lastPlacementThrottleLog = now;
      this.logger.info(this.logger.L(
        `Spawner Koruma guvenli beklemede: tekrarlanan yeni spawner kirmalari yayiliyor; siradaki deneme ~${Math.ceil(delay / 1000)} sn sonra.`,
        `Spawner Protect safety delay: repeated new-spawner breaks are being paced; next attempt in ~${Math.ceil(delay / 1000)}s.`));
    }
    this._placementTimer = setTimeout(async () => {
      this._placementTimer = null;
      if (!this.running || this.bot !== bot || !bot.entity) return;
      if (this.busy) {
        this.schedulePlacementBreak(bot, 1000);
        return;
      }

      const currentBudget = this.placementBudget();
      if (currentBudget.waitMs > 0 || currentBudget.slots < 1) {
        this.schedulePlacementBreak(bot, currentBudget.waitMs || 1000);
        return;
      }
      const targets = [];
      for (const [key, queuedPos] of this._placementQueue) {
        let block = null;
        try { block = bot.blockAt(queuedPos); } catch (_) { block = null; }
        this._placementQueue.delete(key);
        if (block && this.isSpawner(block)) targets.push(queuedPos);
        // Mevcut iki dakikalik guvenlik butcesinde yer oldugu kadar yan yana
        // yeni spawneri ayni gruba al. En fazla bes hedef olur.
        if (targets.length >= currentBudget.slots) break;
      }
      if (!targets.length) {
        if (this._placementQueue.size) this.schedulePlacementBreak(bot, 1000);
        return;
      }

      this.waitingForClear = false;
      this.clearSince = 0;
      this.armed = false;
      this._lastPlacementSessionAt = Date.now();
      try { this.protectOrigin = bot.entity.position.clone(); } catch (_) { this.protectOrigin = bot.entity.position; }
      const first = targets[0];
      this.logger.warn(this.logger.L(
        `Yakina ${targets.length === 1 ? 'yeni spawner' : targets.length + ' yeni spawner'} yerlestirildi: ${first.toString ? first.toString() : ''}. Koruma hedefli kirma islemini baslatiyor...`,
        `${targets.length === 1 ? 'A new spawner was' : targets.length + ' new spawners were'} placed nearby: ${first.toString ? first.toString() : ''}. Protection is starting a targeted break...`));
      try {
        await this.breakLoop(targets);
      } catch (_) { /* yoksay */ }
      if (this._placementQueue.size) this.schedulePlacementBreak(bot, 1000);
    }, delay);
  }

  detachPlacementWatcher() {
    if (this._placementTimer) {
      clearTimeout(this._placementTimer);
      this._placementTimer = null;
    }
    if (this.bot && this._placementHandler && typeof this.bot.removeListener === 'function') {
      try { this.bot.removeListener('blockUpdate', this._placementHandler); } catch (_) {}
    }
    this._placementHandler = null;
    this._placementQueue.clear();
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
    if (!this.running || this.busy) return;
    const bot = this.bot;
    if (!bot || !bot.entity || !bot.players) return;
    const intruder = this.scanPlayers(bot);

    // Bir oyuncu aynı bölgede kalırken her 10-20 saniyede yeniden kazma
    // başlatmak hem gereksizdi hem de ChickenNW gx01 davranış puanını
    // yükseltiyordu. İlk olay bittikten sonra oyuncunun gerçekten ayrılmasını
    // ve alanın iki saniye boş kalmasını bekle.
    if (this.waitingForClear) {
      if (intruder) {
        this.clearSince = 0;
        return;
      }
      if (!this.clearSince) {
        this.clearSince = Date.now();
        return;
      }
      if (Date.now() - this.clearSince < 2000) return;
      this.waitingForClear = false;
      this.clearSince = 0;
      this.armed = true;
      this._spawnerCache = null;
      this._spawnerCacheTs = 0;
      return;
    }
    if (!this.armed) return;
    if (!intruder) {
      // Paket 80: "neden hic kazmiyor?" sorusuna DETAYLI logla cevap - yakindaki
      // oyunculari trusted/oyuncu + mesafe bilgisiyle listeler (30 sn'de bir).
      // Boylece "ben yakindayim ama kirilmiyor" diyen kullanici SEBEBI gorur:
      // oyuncu trusted ise, uzaktaysa, ya da entity yuklenmemisse. Yakindaki
      // trusted-disi gorunur biri varken tetiklenmemesi artik mumkun degil
      // (sadece kok musluk/entity yuklenmeme kalir, mesafe kolonunda gorulur).
      // 150 blokluk spawner taraması pahalıdır. Yakında güvenilir olmayan bir
      // oyuncu yokken dünyayı sürekli taramayız; tetik gelince tek seferde aranır.
      return;
    }

    // Kalabalık lobi/spawn dünyasında yakında oyuncu olması tek başına
    // korumayı tetiklemesin. Bölgede gerçek spawner yoksa kazma/kazma seçme
    // paketi gönderme ve 5 saniye sonra tekrar kontrol et.
    const now = Date.now();
    // New chunks/placed blocks invalidate the negative cache immediately.
    const scanOrigin = this.protectOrigin || bot.entity.position;
    const scanMe = bot.entity.position;
    const centerKey = `${scanOrigin.x},${scanOrigin.y},${scanOrigin.z}|${scanMe.x},${scanMe.y},${scanMe.z}`;
    if (now < this._noSpawnerUntil && (!this._spawnerIndex ||
      (this._spawnerCacheRevision === this._spawnerIndex.revision && this._spawnerCacheCenter === centerKey))) return;
    let nearbySpawners = [];
    try {
      nearbySpawners = this.findSpawners().filter((p) => {
        const b = bot.blockAt(p);
        return b && this.isSpawner(b);
      });
    } catch (_) { nearbySpawners = []; }
    if (!nearbySpawners.length) {
      if (this._spawnerIndex && !this._spawnerIndex.ready) return;
      this._noSpawnerUntil = now + 5000;
      return;
    }
    this._noSpawnerUntil = 0;
    this.armed = false;
    try { this.protectOrigin = bot.entity.position.clone(); } catch (_) { this.protectOrigin = bot.entity.position; }
    let d = 0;
    try { d = Math.round(bot.entity.position.distanceTo(intruder.entity.position)); } catch (_) {}
    // Paket 77/4: ayni intruder oradayken tetiklenme uyarisi logu 15 sn'de bir
    // yazilir (davranis degismez, sadece konsol su baskini olmaz).
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
    const me = normPlayerName(bot.username);
    // Whitelist yalnızca listedeki oyuncuyu yok sayar. Güvenilir biri yakındayken
    // başka bir yabancı da gelirse yabancı yine korumayı tetikler.
    for (const name of Object.keys(bot.players || {})) {
      const p = bot.players[name];
      if (!p || !p.entity || !p.entity.position) continue;
      // Mineflayer tablo anahtari her sunucuda username olmak zorunda degil.
      // Logdaki vaka: Trusted listesinde "poltaaa" gorunmesine ragmen tablo
      // anahtari farkli oldugu icin p.username=poltaaa tetikleyici oluyordu.
      const aliases = [
        normPlayerName(name),
        normPlayerName(p.username),
        normPlayerName(p.profile && p.profile.name)
      ].filter(Boolean);
      if (aliases.includes(me) || aliases.some((n) => this.trusted.has(n))) continue;
      try {
        if (bot.entity.position.distanceTo(p.entity.position) <= radius) {
          if (p.username) return p;
          return Object.assign({}, p, { username: name });
        }
      } catch (_) { /* yoksay */ }
    }
    return null;
  }

  isSpawner(b) {
    return !!b && (b.name === 'spawner' || b.name === 'mob_spawner');
  }

  // Vanilla blok erisimi oyuncunun AYAGINDAN blok merkezine degil, gozunden
  // blogun en yakin noktasina olculur. Eski merkez hesabi yanindaki/altindaki
  // spawneri yanlislikla "uzak" sayip gereksiz yuruyus baslatabiliyordu.
  blockReachDistance(bot, pos) {
    try {
      const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0);
      const axisGap = (v, min, max) => v < min ? min - v : (v > max ? v - max : 0);
      const dx = axisGap(eye.x, pos.x, pos.x + 1);
      const dy = axisGap(eye.y, pos.y, pos.y + 1);
      const dz = axisGap(eye.z, pos.z, pos.z + 1);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    } catch (_) {
      return 999;
    }
  }

  findSpawners() {
    const bot = this.bot;
    if (!bot || !bot.entity) return [];
    if (!this._spawnerIndex) this._spawnerIndex = new SpawnerIndex(bot);
    const index = this._spawnerIndex;
    const origin = this.protectOrigin || bot.entity.position;
    const me = bot.entity.position;
    const centerKey = `${origin.x},${origin.y},${origin.z}|${me.x},${me.y},${me.z}`;
    const tNow = Date.now();
    if (this._spawnerCache && this._spawnerCacheRevision === index.revision &&
      this._spawnerCacheCenter === centerKey && tNow - this._spawnerCacheTs < 500) return this._spawnerCache;
    const r = this.cfg.breakRadius;
    const list = index.query(origin, me, r, 512);
    this._spawnerCache = list;
    this._spawnerCacheTs = tNow;
    this._spawnerCacheRevision = index.revision;
    this._spawnerCacheCenter = centerKey;
    return list;
  }

  // Bot ile hedef arasinda DUVAR var mi? (line of sight)
  // blockAtCursor: botun baktigi yonde CARPILAN ILK kati blogu doner.
  // O blok spawner'in kendisi ise gorus ACIK (kirilabilir); baska bir kati
  // blok (duvar/tepe) ise KAPALI -> kazma baslatilmaz.
  hasClearView(bot, pos) {
    try {
      const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0);
      const center = pos.offset(0.5, 0.5, 0.5);
      const delta = center.minus(eye);
      const dist = Math.max(0.001, Math.sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z));
      const dir = delta.scaled(1 / dist);
      const cursor = bot.world && typeof bot.world.raycast === 'function'
        ? bot.world.raycast(eye, dir, Math.min(5, dist + 0.15))
        : null;
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
    this.lastPickaxeOkItem = null;
    this.lastPickaxeHasSilk = false;
    let pick = null;
    let requireSilk = false;
    try {
      const items = bot.inventory.items();
      pick = bestPickaxe(items, bot.registry);
      requireSilk = !!pick;
      if (!pick) pick = bestAvailablePickaxe(items, bot.registry);
    } catch (_) { pick = null; }
    if (!pick) return false;

    if (!requireSilk && !this.warnedSilkFallback) {
      this.warnedSilkFallback = true;
      const eff = effLevelOf(pick, bot.registry);
      this.logger.warn(this.logger.L(
        `Ipeksi Dokunuslu kazma bulunamadi; isteginiz geregi en guclu normal kazma kullanilacak: ${pick.name}${eff > 0 ? ` (Verimlilik ${eff})` : ''}. Spawner esya olarak dusmeyebilir.`,
        `No Silk Touch pickaxe was found; the strongest normal pickaxe will be used as requested: ${pick.name}${eff > 0 ? ` (Efficiency ${eff})` : ''}. The spawner may not drop as an item.`));
    }

    const matchesPick = (item) => {
      if (!item || !isPickaxe(item.name)) return false;
      const sameSlot = item.slot !== undefined && pick.slot !== undefined && item.slot === pick.slot;
      const sameTool = item.name === pick.name
        && effLevelOf(item, bot.registry) === effLevelOf(pick, bot.registry);
      return (sameSlot || sameTool) && (!requireSilk || hasSilkTouch(item, bot.registry));
    };
    const rememberPick = (item) => {
      const actual = item || pick;
      this.lastPickaxeOkName = actual.name || pick.name;
      this.lastPickaxeOkItem = actual;
      this.lastPickaxeHasSilk = hasSilkTouch(actual, bot.registry);
      this.lastPickaxeFail = null;
    };

    // Elde seçilen kazma zaten varsa değiştirme.
    const held = heldNow();
    if (matchesPick(held)) {
      rememberPick(held);
      return true;
    }
    let equipped = false;
    let lastErr = '';
    // Paket 80: kazma ZATEN hotbar'daysa window-click tasima GEREKMEZ -
    // hotbar degisimi tek pakettir ve her sunucuda isler. "7,5 sn" sorununun
    // bilinen kaynagi envanter->hotbar tasima reddiydi; hotbar yolu o riski atlar.
    let hotbar = null;
    if (Number.isInteger(pick.slot) && pick.slot >= 36 && pick.slot <= 44) {
      hotbar = { name: pick.name, slot: pick.slot - 36 };
    }
    if (hotbar) {
      for (let i = 0; i < 2 && !equipped; i++) {
        try {
          await bot.setQuickBarSlot(hotbar.slot);
          await sleep(250);
          const nh = heldNow();
          equipped = matchesPick(nh);
        } catch (e) {
          lastErr = (e && e.message) || String(e);
          await sleep(250);
        }
      }
      if (equipped) {
        rememberPick(heldNow() || pick);
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
        equipped = matchesPick(nh);
      } catch (e) {
        lastErr = (e && e.message) || String(e);
        await sleep(300);
      }
    }
    if (equipped) {
      rememberPick(heldNow() || pick);
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
    let inv = '';
    let pickDiag = '';
    try {
      const items = bot && bot.inventory && bot.inventory.items()
        ? bot.inventory.items()
        : [];
      inv = items.map((i) => i.name).slice(0, 12).join(', ');
      pickDiag = items.filter((i) => isPickaxe(i && i.name))
        .slice(0, 4)
        .map((i) => compactEnchantDebug(i, bot && bot.registry))
        .join(' | ');
    } catch (_) { /* yoksay */ }
    this.logger.warn(this.logger.L(
      'Envanterde kullanılabilir kazma yok; spawner kırılmayacak. Bota herhangi bir kazma verin.',
      'No usable pickaxe was found; the spawner will not be broken. Give the bot any pickaxe.') +
      (inv ? (' Envanter: ' + inv) : '') +
      (pickDiag ? this.logger.L(' | Kazma büyü teşhisi: ', ' | Pickaxe enchant diagnostics: ') + pickDiag : ''));
  }

  // Vanilla kazma sürerken kol animasyonunu güvenli aralıkla gönderir.
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
        else if (this.lastPickaxeOkItem && isPickaxe(this.lastPickaxeOkItem.name)) item = this.lastPickaxeOkItem;
        else if (this.lastPickaxeOkName && isPickaxe(this.lastPickaxeOkName)) item = { name: this.lastPickaxeOkName };
        else if (equippedOk) item = bestPickaxe(bot.inventory.items(), bot.registry)
          || bestAvailablePickaxe(bot.inventory.items(), bot.registry);
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
        const eff = effLevelOf(item, bot && bot.registry);
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

  // Sunucuya gonderilecek START -> FINISH araligini guvenli hale getirir.
  //
  // computeDigMs yalnizca eldeki kazma + Efficiency icin teorik vanilla
  // hesabidir. Gercek kazma suresi; yerde/havada olma, su, efektler ve sunucu
  // tiklerine gore daha uzun olabilir. Paket 87'de elmas+Efficiency icin
  // status-2 yaklasik 0,5 sn'de gidiyor, ChickenNW bunu "hizli blok
  // koyma/kirma" diye iptal ediyordu: animasyon gorunuyor fakat spawner
  // kirilmiyordu.
  //
  // Mineflayer'in bot.digTime sonucu son durumlari da hesaba katar; spawner
  // icin bazi surumlerde Infinity dondugunden teorik hesap yedek kalir.
  // Anti-cheat ve ping/tik farki icin de gec bitirmek guvenlidir: oyuncu sol
  // tusu bir miktar daha uzun tutmus olur. Erken bitirmek ise sunucu tarafinda
  // kesin olarak reddedilebilir.
  computeSafeDigMs(block, estimatedMs) {
    const bot = this.bot;
    if (this.detectGameMode(bot) === 1) return 150; // creative: vanilla aninda

    let base = Math.max(200, Number(estimatedMs) || 7500);
    let nativeMs = NaN;
    try {
      if (bot && typeof bot.digTime === 'function') nativeMs = Number(bot.digTime(block));
    } catch (_) { nativeMs = NaN; }
    if (Number.isFinite(nativeMs) && nativeMs > 0) {
      base = Math.max(base, nativeMs);
    } else {
      // Native hesap kullanilamiyorsa havada kazma cezasini kacirma. Sunucu
      // oyuncuyu yerde goruyorsa bu yalnizca daha uzun/guvenli bir kazma olur.
      try {
        if (bot && bot.entity && bot.entity.onGround === false) base *= 5;
      } catch (_) { /* yoksay */ }
    }

    let ping = 0;
    try {
      const raw = bot && bot.player && bot.player.ping;
      if (Number.isFinite(Number(raw))) ping = Math.max(0, Number(raw));
    } catch (_) { /* yoksay */ }
    // Paket 102: sabit 3,5 sn taban iyi kazmayi gereksiz yere yavaslatiyordu.
    // Kirma artik aletin gercek tahminine gore kademeli. En iyi kazmada bile
    // teorik 0,3-0,5 sn dogrudan kullanilmaz; ping/tik payiyla en az 1,6 sn
    // tutulur. Yavas alet, native sure, hava/su cezasi daha uzunsa korunur.
    const estimate = Math.max(200, Number(estimatedMs) || 7500);
    let safeFloor = 3500;
    if (estimate <= 600) safeFloor = 1600;
    else if (estimate <= 1100) safeFloor = 1900;
    else if (estimate <= 2000) safeFloor = 2600;
    const withMargin = base + 350 + Math.min(650, Math.round(ping * 1.5));
    return Math.ceil(Math.max(safeFloor, withMargin) / 50) * 50;
  }

  // Tek vanilla kazma oturumu: START -> gercek sure boyunca kol animasyonu ->
  // FINISH. Basari yalnizca sunucudan gelen blok guncellemesiyle kabul edilir.
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
      // d = hedef - goz; hedef dogudaysa oyuncunun gordugu yuz WEST'tir.
      if (ay > ax && ay > az) face = d.y > 0 ? 0 : 1;   // bottom / top
      else if (ax > az) face = d.x > 0 ? 4 : 5;         // west / east
      else face = d.z > 0 ? 2 : 3;                      // north / south
    } catch (_) { /* yoksay */ }
    const lookPoint = pos.offset(
      0.5 + (face === 5 ? 0.5 : face === 4 ? -0.5 : 0),
      0.5 + (face === 1 ? 0.5 : face === 0 ? -0.5 : 0),
      0.5 + (face === 3 ? 0.5 : face === 2 ? -0.5 : 0)
    );
    try {
      await bot.lookAt(lookPoint, true);
      await sleep(100);
    } catch (_) {
      this.logger.warn(this.logger.L(
        'Spawner hedef bakisi gonderilemedi; koruma icin kirma atlandi: ',
        'Could not send spawner target look; break skipped for safety: ') + pos.toString());
      return false;
    }
    // Paket 77: ard arda block_dig paketlerini biriktirme - en az 250 ms ara
    try {
      const tNow = Date.now();
      if (this._lastDigAt && tNow - this._lastDigAt < 250) await sleep(250 - (tNow - this._lastDigAt));
    } catch (_) { /* yoksay */ }
    try {
      bot._client.write('block_dig', { status: 0, location: pos, face }); // start digging
      this._lastDigAt = Date.now();
    } catch (_) { return false; }
    this._swingSafe(bot);                              // vanilla: ilk vurus aninda
    // Paket 77(3): fizik artik kazma sirasinda KAPATILMAZ - gercek oyuncu kazma
    // boyunca konum paketlerini gonderir; ani dusurup acmak anticheat'e garip
    // gelir. (Hareket paketlerinin patlamasi zaten global tavanda duzlestirilir.)
    // START anindaki tek vanilla kol animasyonu yeterli. Kirma boyunca sabit
    // aralikli sentetik animation paketleri gx01 puanini arttirabiliyor.
    const eventName = 'blockUpdate:' + pos;
    return await new Promise((resolve) => {
      let settled = false;
      let finishTimer = null;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        if (finishTimer) clearTimeout(finishTimer);
        bot.removeListener(eventName, onUpd);
        clearTimeout(timeoutTimer);
        // Sunucu bloğu kırmadıysa vanilla "kazmayı iptal et" paketiyle durumu
        // temizle; sonraki hedefte eski kazma oturumu/paket yığını kalmasın.
        if (!ok) {
          try { bot._client.write('block_dig', { status: 1, location: pos, face }); } catch (_) {}
        }
        resolve(ok);
      };
      const onUpd = (oldB, newB) => {
        // Hava veya artik spawner olmayan bir blok: sunucu kirmayi onayladi.
        // Stack eklentisi ayni konuma baska bir blok koyarsa da eski hedef
        // basariyla kirilmis sayilir. Ayni spawner kalirsa iptal/ret kabul et.
        // Dunya bosalirken Mineflayer (null, null) yayabilir; bu basari degildir.
        if (!newB) return;
        if (newB.type !== 0 && this.isSpawner(newB)) return;
        finish(true);
      };
      // Paket 77/3: vanilla ilk denemede sunucunun DOGAL kirma suresi biraz
      // daha uzun olabileceginden timeout genisletildi (digMs+3500); sunucu
      // kendisi kirmadan force-finish'e gecilmez.
      const timeoutTimer = setTimeout(() => finish(false), digMs + 3500);
      bot.on(eventName, onUpd);
      // Vanilla istemci kazma suresi dolunca FINISH (status 2) gonderir.
      // Buradaki digMs erken tahmin degil, computeSafeDigMs ile native durum,
      // ping ve sunucu tik payi eklenmis gercek tutma suresidir.
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
  async breakLoop(onlyPositions = null) {
    if (this.busy) return;
    this.busy = true;
    const bot = this.bot;
    const runEpoch = this._runEpoch;
    // Yeni yerleştirme olayı yalnızca olayda görülen yeni koordinatları kırar.
    // Önceki Paket 95 bu olayda 150 bloktaki eski spawnerları da tarayıp
    // kırdığı için tek yerleştirme iki veya daha fazla eyleme dönüşebiliyordu.
    const targeted = Array.isArray(onlyPositions);
    const worldEpoch = this._spawnerIndex ? this._spawnerIndex.epoch : null;
    const targetPositions = targeted ? onlyPositions.filter(Boolean) : null;
    // Paket 77/5: FIZIK ASLA GECICI AÇILMAZ. 77/4 testinde goruldu: fizik
    // ac/kapa = "donup sonra hareket etme" (freeze->move) imzasi; NexoMC gx01
    // bunu ~30 sn icinde yakaliyor (kazma gonderilmeden bile). Fizik kapaliysa
    // bot HIC yurumez (sadece dokunma mesafesindeki spawner'lari kirar); fizik
    // KULLANICI tarafindan aciksa yuruyup kirar (gercek oyuncu gibi surekli
    // hareket, gecis yok). Ulasilamayan spawner 120 sn tekrar denenmez ->
    // ardisik "burst yurume" dongusu de yok.
    let exitNow = false;
    let brokeCount = 0;
    let toolMissing = false;
    try {
      // Partial indexes can trigger quickly, but never exit on a partial "empty".
      if (!targeted && this._spawnerIndex) {
        const index = this._spawnerIndex;
        const complete = await index.whenIdle();
        if (!complete || !this.running || this.bot !== bot || this._spawnerIndex !== index || index.epoch !== worldEpoch) return;
      }
      if (!(await this.ensurePickaxe(bot))) {
        toolMissing = true;
        this.loggerWarnNoPickaxe(bot);
        return;
      }

      const failed = new Set();   // ulasilamayan spawner'lar tekrar denenmesin
      let foundAny = false;       // paket 77: hic spawner bulunamadiysa cikma
      let guard = 0;
      while (this.running && this.busy && bot && bot.entity) {
        if (worldEpoch !== null && this._spawnerIndex && this._spawnerIndex.epoch !== worldEpoch) return;
        if (++guard > 240) break;                       // guvenlik valfi (~3 dk)
        const spawners = targeted
          ? targetPositions.filter((p) => {
            try {
              const b = bot.blockAt(p);
              return b && this.isSpawner(b);
            } catch (_) { return false; }
          })
          : this.findSpawners();
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
          if (!ok) {
            failed.add(key);
          } else {
            brokeCount++;
            this._successfulBreaks.push(Date.now());
            this._successfulBreaks = this._successfulBreaks.filter((ts) => Date.now() - ts < 120000);
          }
          await sleep(ok ? 100 : 350);
          break;                                        // her turda bir tane; sonra yeni tara
        }
        if (!progressed) break;
      }
      // Yalnızca tarama yarıçapında gerçekten spawner kalmadıysa çık. Önceki
      // akış, ulaşılamayan bir spawner kaldığında da "hepsi kırıldı" sanabiliyordu.
      this._spawnerCache = null;
      this._spawnerCacheTs = 0;
      if (this.cfg.exitAfterBreak && this._spawnerIndex) {
        const index = this._spawnerIndex;
        const complete = await index.whenIdle();
        if (!complete || !this.running || this.bot !== bot || this._spawnerIndex !== index ||
          (worldEpoch !== null && index.epoch !== worldEpoch)) return;
      }
      const remaining = this.findSpawners().filter((p) => {
        try {
          const b = bot.blockAt(p);
          return b && this.isSpawner(b);
        } catch (_) { return false; }
      });
      if (this.running && this.cfg.exitAfterBreak && foundAny && remaining.length === 0) {
        exitNow = true;
        this.logger.info(this.logger.L(
          'Tüm spawnerlar kırıldı; ayar gereği oyundan çıkılıyor.',
          'All spawners broken; exiting the game (as configured).'));
      }
    } catch (e) {
      this.logger.warn(this.logger.L('Spawner korumasi hatasi: ', 'Spawner protect error: ') + ((e && e.message) || String(e)));
    } finally {
      // A cancelled scan must not disarm a newly restarted protection session.
      if (runEpoch !== this._runEpoch || this.bot !== bot) return;
      try { this.clearControls(); } catch (_) {}
      // Havada donup kalmasin: fizik hala acikken yere inmesi beklenir,
      // sonra fizik eski haline dondurulur.
      try {
        const b2 = this.bot;
        const waitEnd = Date.now() + 3000;
        while (runEpoch === this._runEpoch && b2 && b2.entity && b2.physicsEnabled && !b2.entity.onGround && Date.now() < waitEnd) {
          await sleep(100);
        }
      } catch (_) { /* yoksay */ }
      if (runEpoch !== this._runEpoch || this.bot !== bot) return;
      this.restorePhysics();
      this.busy = false;
      this.protectOrigin = null;
      if (exitNow) {
        // Ayar geregi oyundan cik: onExit (BotManager.disconnect -> otomatik
        // yeniden baglanma engellenir) veya dogrudan bot.quit
        if (this.onExit) { try { this.onExit(); } catch (_) {} }
        else if (this.bot) { try { this.bot.quit('spawner protect: all broken'); } catch (_) {} }
        this.running = false;
        this.armed = false;
      } else if (this.running) {
        // Aynı kişi içeride kaldığı sürece yeniden tetikleme yok. Önceki akış
        // 2/10/15 sn sonra tekrar silahlanıp aynı oyuncu için tekrar tekrar
        // kazma/equip paketi gönderiyordu. Yeni olay için alan boşalmalı.
        this.waitingForClear = true;
        this.clearSince = 0;
        this.armed = false;
        const dn = Date.now();
        if (dn - this.lastDoneLog >= 30000) {
          this.lastDoneLog = dn;
          this.logger.info(toolMissing
            ? this.logger.L(
              'Spawner Koruma bekliyor: Ipeksi Dokunuşlu kazma algılanmadı.',
              'Spawner Protect is waiting: no Silk Touch pickaxe was detected.')
            : this.logger.L(
              'Spawner korumasi tamam; yeniden tetiklenmeden önce oyuncunun bölgeden ayrılması bekleniyor.',
              'Spawner protect done; waiting for the player to leave before rearming.'));
        }
      }
    }
    return brokeCount;
  }

  // Tek spawner'a dogru yuru (engel varsa zipla) ve egilerek kir.
  async breakSpawner(block) {
    const bot = this.bot;
    if (!bot || !bot.entity || !this.running || !this.busy) return false;
    const target = block.position;
    // Vanilla survival blok erisimi 4.5 bloktur. Anti-cheat payiyla 4.25
    // kullanilir ve mesafe gozden blogun EN YAKIN NOKTASINA olculur.
    //  * Fizik KAPALIYSA: bot HIC yurumez, fizigi acip kapatmaz (freeze->move
    //    imzasi gx01'i cekiyor - 77/4'te kazmasiz bile kick geldi). Sadece
    //    erisim mesafesi icindeki spawner'lar kirilir; uzaklar atlanir.
    //  * Fizik ACIKSA (kullanici acmis): sinirli yurume (<8 sn) + kazma.
    //  * Ulasilamayan spawner 120 sn "gaveUp" kuyruguna girer: o surede tekrar
    //    denendiginde yurume gonderilmez (burst yurume dongusu yok).
    const REACH = 4.25;
    let dist = 999;
    try { dist = this.blockReachDistance(bot, target); } catch (_) {}
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
            this.logger.L(` — erisim mesafesi ${Math.round(dist * 10) / 10} blok (sinir ${REACH}); Bot Physics kapali oldugu icin gx01 riski alinmadi.`,
              ` — reach distance ${Math.round(dist * 10) / 10} blocks (limit ${REACH}); Bot Physics is off, so no gx01-risk walking was attempted.`));
        }
        return false;
      }
      // Uzak yarıçaplarda sabit 8 saniye spawner'a varmaya yetmiyordu.
      // Normal yürüme hızına göre süre ver, yine de 60 saniyelik güvenlik tavanı tut.
      const walkTimeout = Math.min(60000, Math.max(8000, Math.ceil((dist / 3.4) * 1000) + 5000));
      const reached = await this.goNear(target, walkTimeout);
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
      try { dist = this.blockReachDistance(bot, target); } catch (_) {}
      if (dist > REACH) {
        this.gaveUp.set(gaveKey, Date.now());
        const now = Date.now();
        if (now - this.lastSkipLog >= 30000) {
          this.lastSkipLog = now;
          this.logger.warn(this.logger.L('Spawner hala cok uzakta (atlandi): ', 'Spawner still too far (skipped): ') +
            target.toString() + this.logger.L(` — erisim ${Math.round(dist * 10) / 10} blok`, ` — reach ${Math.round(dist * 10) / 10} blocks`));
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
    const estimatedDigMs = this.computeDigMs(block, pickOk);
    const digMs = this.computeSafeDigMs(block, estimatedDigMs);

    bot.setControlState('sneak', true);                 // shift basili tut
    // Sunucu Shift ve son bakis durumunu START paketinden once en az iki tik
    // boyunca gorsun. Stack-spawner eklentileri Shift durumunu START aninda okur.
    await sleep(125);
    if (!this.running || !this.busy || !bot || !bot.entity) {
      try { bot.setControlState('sneak', false); } catch (_) {}
      return false;
    }
    let broken = false;
    // Paket 78: loga gamemode + eldeki alet eklenir - "neden uzun suruyor?" sorusu
    // konsolda kendiliginden cevaplanir. Paket 80: heldItem gecikirse kusanan
    // kazmanin adi (lastPickaxeOkName) kullanilir, kusanilamadiysa nedeni.
    const heldTxt = (bot.heldItem && bot.heldItem.name) || this.lastPickaxeOkName || this.lastPickaxeFail || 'bos el/empty hand';
    const silkTxt = this.lastPickaxeHasSilk
      ? this.logger.L('evet', 'yes')
      : this.logger.L('hayir (normal kazma)', 'no (normal pickaxe)');
    this.logger.info(this.logger.L('Spawner kirilmayi deniyor: ', 'Attempting to break spawner: ') + target.toString() +
      this.logger.L(
        ` (tahmin ~${Math.round(estimatedDigMs / 100) / 10} sn | guvenli tutma ~${Math.round(digMs / 100) / 10} sn | mod: ${this.modeLabel(this.detectGameMode(bot))} | el: ${heldTxt} | ipeksi: ${silkTxt})`,
        ` (estimate ~${Math.round(estimatedDigMs / 100) / 10}s | safe hold ~${Math.round(digMs / 100) / 10}s | mode: ${this.modeLabel(this.detectGameMode(bot))} | held: ${heldTxt} | silk: ${silkTxt})`));
    // Tek, vanilla tempolu kazma işlemi: START -> gerçek alet süresi -> FINISH.
    // Aynı bloğa art arda üç kez paket göndermek bazı anti-cheat sistemlerinde
    // paket patlaması/kick oluşturuyordu.
    try {
      const cur = bot.blockAt(block.position);
      if (!cur || cur.type === 0 || !this.isSpawner(cur)) broken = true;
      else broken = await this.rawDig(block, digMs, true);
    } catch (_) { broken = false; }
    // Shift hedefler arasinda acilip kapanmaz; grup bitince clearControls birakir.
    if (broken) {
      this.logger.info(this.logger.L('Spawner kirildi: ', 'Spawner broken: ') + target.toString());
    } else {
      this.logger.warn(this.logger.L(
        'Sunucu spawner kirilmasini onaylamadi; blok yerinde kaldi: ',
        'The server did not confirm the spawner break; block is still present: ') + target.toString());
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
    let reached = false;
    try {
      reached = await this.goNearInner(pos, maxMs);
    } finally {
      this.rbActive = false;
      this.stopMoving();
      const now = Date.now();
      if (this.rbCount >= 3 && now - this.lastRbLog > 30000) {
        this.lastRbLog = now;
        this.logger.warn(this.logger.L(
          `Yurume sirasinda sunucu konumu ${this.rbCount} kez geri cekti -> flight korumasi yurumeyi reddediyor olabilir. Spawner'lari botun 3,5 blok icindeki acik yerine koyun; bu sunucuda fizik kapali profil daha guvenli.`,
          `The server pulled our position back ${this.rbCount} times during walking -> anti-flight may be rejecting movement. Place spawners within 3.5 blocks in the open; physics-off profile is safer on this server.`));
      }
    }
    // Tek bir geri cekilme bile yuruyusun sunucu tarafinda kabul edilmedigini
    // gosterir. Yerel koordinattan uzaktan kazma gonderme; sonraki tetigi bekle.
    return reached && this.rbCount === 0;
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
      if (this.rbCount > 0) { this.stopMoving(); return false; }
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
      if (this.rbCount > 0) { this.stopMoving(); return false; }
      if (++guard > Math.ceil(maxMs / 110) + 12) {
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
      bot.setControlState('back', false);
      bot.setControlState('left', false);
      bot.setControlState('right', false);
      bot.setControlState('sprint', false);
      this._releaseJump(bot);
    } catch (_) { /* yoksay */ }
  }

  clearControls() {
    const bot = this.bot;
    if (!bot) return;
    try {
      bot.setControlState('forward', false);
      bot.setControlState('back', false);
      bot.setControlState('left', false);
      bot.setControlState('right', false);
      bot.setControlState('sprint', false);
      bot.setControlState('sneak', false);
      this._releaseJump(bot);
    } catch (_) { /* yoksay */ }
  }
}

module.exports = SpawnerProtect;