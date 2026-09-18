'use strict';
// ---------------------------------------------------------------------------
// store.js - Kalici config sistemi (JSON tabanli, atomik yazma)
// Konum: %APPDATA%/KARABARAKORSA CLIENT/config.json
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DEFAULTS = {
  connection: {
    host: 'play.example.com',
    port: 25565,
    version: '1.20.1',
    loginDelay: 3,
    fakeHost: '',
    resourcePack: 'smart'     // smart | auto | decline | ignore
  },
  // v1.13: BAGLANTI + MAKROLAR anahtarlari artik HESAP BAZLI calisir.
  // toggles[key] sadece "en az bir hesapta acik mi" ozetidir; gercek kaynak
  // featureAccounts[key] listesidir. Ilk kurulumda hepsi KAPALI baslar.
  toggles: {
    offline: false,
    sneak: false,
    physics: false,
    antiAfk: false,
    autoReconnect: false,
    joinMessages: false,
    worldChangeMessages: false,
    proxy: false,
    fakeHost: false,
    noChatSign: false,
    vanillaLike: false
  },
  // Hangi ayar hangi hesaplarda acik? (hesap id listesi)
  featureAccounts: {
    offline: [],
    sneak: [],
    physics: [],
    antiAfk: [],
    autoReconnect: [],
    joinMessages: [],
    worldChangeMessages: [],
    proxy: [],
    fakeHost: [],
    noChatSign: [],
    vanillaLike: [],
    macroFarmer: [],
    autoSpam: []
  },
  // Ayar acik mi? Hesap secimi ("featureAccounts") silinmeden ayar kapatilabilir:
  // "hic hesap secmeden kapat" sadece bu bayragi false yapar, secim korunur.
  featureEnabled: {
    offline: false, sneak: false, physics: false, antiAfk: false,
    autoReconnect: false, joinMessages: false, worldChangeMessages: false,
    proxy: false, fakeHost: false, noChatSign: false, vanillaLike: false,
    macroFarmer: false, autoSpam: false
  },
  autoSpam: {
    enabled: false,
    messages: ['Merhaba', 'AFK Client aktif!', 'Karabarakorsa Client'],
    random: false,
    mode: 'fixed',            // 'fixed' | 'range'
    interval: 5,              // saniye
    minDelay: 10,
    maxDelay: 20,
    // v1.14: hesap basina ozel mesaj listesi/araliklar.
    // perAccount[hesapId] = { messages, random, mode, interval, minDelay, maxDelay }
    // Kayit yoksa (veya null ise) yukaridaki ortak ayar kullanilir.
    perAccount: {}
  },
  joinMessages: {
    runOnReconnect: true,
    commands: [
      { command: '/login ********', delay: 5, enabled: true },
      { command: '/is go', delay: 2, enabled: true },
      { command: '/spawn', delay: 3, enabled: false }
    ]
  },
  // Sunucu ekranlari (Minecraft 1.21.6+ "dialog" formlari)
  dialogs: {
    show: true,               // ekran acilinca arayuzde goster
    autoAnswer: false,        // sifre alanlarini otomatik doldur
    password: '',             // sifreli saklanir (safeStorage)
    delay: 5,                 // otomatik gonderim gecikmesi (sn, en az 2)
    commandMode: false,       // paket yerine sohbet komutu gonder
    commandTemplate: ''       // ornek: /register $(password) $(password_repeat)
  },
  antiAfk: {
    enabled: false,
    walk: true,
    jump: true,
    sneak: false,
    rotate: true,
    lookAround: true,
    randomMovement: true,
    minInterval: 30,
    maxInterval: 60
  },
  autoReconnect: {
    enabled: false,
    delay: 10,
    unlimited: true,
    maxAttempts: 5
  },
  // Makrolar: "Auto Farm" -> komutu yazar, acilan ekranda secilen karelere
  // sirayla tiklar.
  // steps: [{ slot: 0-53, delay: saniye, click: 'left|right|shift|shiftRight' }]
  macros: {
    farmer: {
      enabled: false,
      command: '/çiftçi',
      steps: [],
      cycle: 60,              // tur arasi bekleme (sn)
      closeAfter: true,       // tur bitince ekrani kapat
      rawClick: false,        // tiklamayi dogrudan ham paket olarak gonder
      // Otomatik baslatma: GIRIS KOMUTLARI sirasiyla senkron calisir.
      // startMode 'join' -> giris zincirinin joinIndex. adimi olarak baslar
      //           'delay' -> giris komutlarindan bagimsiz, startDelay sn sonra
      startMode: 'join',
      joinIndex: 0,           // 0 = giris komutlarindan sonra (en son)
      startDelay: 3           // bu adimdan once bekleme (sn)
    }
  },
  proxies: { selected: null, list: [] },
  accounts: { selected: null, list: [] },
  settings: {
    theme: 'dark',
    language: 'en',          // ilk kurulumda arayuz Ingilizce baslar
    startWithWindows: false,
    startupAccounts: [],     // "Baslangicta acilsin" ile otomatik baglanacak hesaplar
    notifications: true,
    lowCpuMode: false,
    memoryOptimization: true,
    packetLog: false,         // hata ayiklama: tum paket adlarini logla
    dashTiles: []             // PANEL sayfasina eklenen hizli ayarlar
  }
};

// Hesap bazli calisan ayarlarin listesi (BAGLANTI + MAKROLAR)
const FEATURE_KEYS = [
  'offline', 'sneak', 'physics', 'antiAfk', 'autoReconnect', 'joinMessages',
  'worldChangeMessages', 'proxy', 'fakeHost', 'noChatSign', 'vanillaLike',
  'macroFarmer', 'autoSpam'
];
// toggles[] icinde karsiligi olmayan (kendi bolumunde "enabled" tutan) ayarlar
const FEATURE_SECTION = { macroFarmer: 'macros.farmer', autoSpam: 'autoSpam' };

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

class Store {
  constructor() {
    this.dir = app.getPath('userData');
    this.file = path.join(this.dir, 'config.json');
    this.data = this.load();
    this._timer = null;
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const data = deepMerge(DEFAULTS, JSON.parse(raw));
      // 1.4.5 ve oncesinde varsayilan 'decline' idi; zorunlu paket isteyen sunucularda takiliyordu
      if (!data.__packMigrated) {
        if (data.connection.resourcePack === 'decline') data.connection.resourcePack = 'smart';
        data.__packMigrated = true;
      }
      // 1.13.0: anahtarlar hesap bazli oldu. Eski config'lerde hepsi bir kez
      // kapatilir, boylece uygulama "her sey kapali" olarak temiz baslar.
      if (!data.__featMigrated) {
        data.featureAccounts = data.featureAccounts || {};
        data.featureEnabled = data.featureEnabled || {};
        for (const k of FEATURE_KEYS) {
          data.featureAccounts[k] = [];
          data.featureEnabled[k] = false;
          if (!FEATURE_SECTION[k]) data.toggles[k] = false;
        }
        if (data.macros && data.macros.farmer) data.macros.farmer.enabled = false;
        if (data.autoSpam) data.autoSpam.enabled = false;
        if (data.antiAfk) data.antiAfk.enabled = false;
        if (data.autoReconnect) data.autoReconnect.enabled = false;
        data.__featMigrated = true;
      }
      data.featureAccounts = data.featureAccounts || {};
      data.featureEnabled = data.featureEnabled || {};
      for (const k of FEATURE_KEYS) {
        if (!Array.isArray(data.featureAccounts[k])) data.featureAccounts[k] = [];
        if (typeof data.featureEnabled[k] !== 'boolean') data.featureEnabled[k] = false;
      }
      return data;
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULTS));
    }
  }

  get() { return this.data; }

  // Kismi guncelleme + gecikmeli (debounced) disk yazma -> dusuk I/O
  patch(partial) {
    this.data = deepMerge(this.data, partial);
    this.saveDebounced();
    return this.data;
  }

  set(section, value) {
    this.data[section] = value;
    this.saveDebounced();
    return this.data;
  }

  saveDebounced() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveNow(), 400);
  }

  saveNow() {
    try {
      if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error('[store] save error', e.message);
    }
  }

  // --- Sifre / token sifreleme (Windows DPAPI - safeStorage) ---------------
  encrypt(plain) {
    if (!plain) return '';
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return 'enc:' + safeStorage.encryptString(plain).toString('base64');
      }
    } catch (_) {}
    return 'b64:' + Buffer.from(plain, 'utf8').toString('base64');
  }

  decrypt(value) {
    if (!value) return '';
    try {
      if (value.startsWith('enc:')) {
        return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
      }
      if (value.startsWith('b64:')) {
        return Buffer.from(value.slice(4), 'base64').toString('utf8');
      }
    } catch (_) {}
    return '';
  }
}

module.exports = { Store, DEFAULTS, FEATURE_KEYS, FEATURE_SECTION };
