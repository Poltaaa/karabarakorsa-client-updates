'use strict';
const rootLogger = require('../logger');
const LX = (tr, en) => rootLogger.L(tr, en);      // iki dilli metin
// ---------------------------------------------------------------------------
// bot-manager.js - Gercek Minecraft baglantisi (mineflayer) + tum ozelliklerin
// orkestrasyonu: join messages, anti-afk, auto spam, auto reconnect, proxy.
// ---------------------------------------------------------------------------
const { EventEmitter } = require('events');
const path = require('path');
let mineflayer = null; // lazy: bagimliliklar kurulmadiysa uygulama gene de acilir

const AntiAfk = require('./anti-afk');
const AutoSpam = require('./auto-spam');
const MacroFarmer = require('./macro-farmer');
const MacroSpawner = require('./macro-spawner');
const AutoSell = require('./auto-sell');
const { AutoBuild, catalog: buildCatalog } = require('./auto-build');
const {pauseOnBuildPermissionDenial}=require('./build-permission');
// Spawner AFK deneme sürecinde kilitli kalır. Spawner Koruma Paket 85 ile
// yeniden etkinleştirildi ve BotManager tarafında da normal ayar akışını kullanır.
const SPAWNER_AFK_LOCKED = true;
const SpawnerProtect = require('./spawner-protect');
const JoinMessages = require('./join-messages');
const { DialogHandler, textOf, plainText } = require('./dialogs');
const chatFmt = require('./chat-format');
const ResourcePack = require('./respack');
const NetworkHealth = require('./network-health');
const {PacketBudget,MotionPacer,CRITICAL,MOTION}=require('./packet-budget');
const {MovementWatch,samePosition}=require('./movement-watch');
const {decodeAttributePacket}=require('./attribute-packet');
const { ConnectionAttempt } = require('./connection-transport');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SECRET_CHAT_CMD = /^(\s*\/(?:login|gir|l|register|reg)\b)(.*)$/i;
function maskSecretChat(value) {
  return String(value || '').replace(SECRET_CHAT_CMD, (_all, command, tail) =>
    command + tail.replace(/\S/g, '*'));
}

// Proxy arkasindaki bazi SkyBlock sunuculari, vanilla istemcinin tolere ettigi
// fakat Prismarine protokol semasinda NBT/dizi/offset alaniyla cakisan ek
// paketler gonderebiliyor. minecraft-protocol her paketi ayri frame olarak
// cozer; bu nedenle hatali tek frame'i stream'i oldurmeden atlamak sonraki
// paketlerin sinirini bozmaz.
function isRecoverableIncomingParseError(err) {
  const msg = String(err && err.message ? err.message : err || '');
  // Parser sarmalayicisi yalnizca gelen play/configuration frame'lerinde bu
  // isareti koyar; mesaj turu degisse bile frame guvenle atlanabilir.
  if (err && err.__kbInboundParser) return true;
  return /Parse error for (?:play|configuration)\.toClient/i.test(msg) &&
    /array size is abnormally large|offset.+out of range|ERR_OUT_OF_RANGE/i.test(msg);
}

function readVarIntSafe(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) return null;
  let value = 0;
  let shift = 0;
  for (let i = 0; i < Math.min(buf.length, 5); i++) {
    const b = buf[i];
    value |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: value >>> 0, size: i + 1 };
    shift += 7;
  }
  return null;
}

function incomingPacketInfo(client, err) {
  const buf = err && Buffer.isBuffer(err.buffer) ? err.buffer : null;
  const head = readVarIntSafe(buf);
  const id = head ? head.value : null;
  let name = '';
  try {
    const version = client && client.version;
    const state = String((client && client.state) || 'play').toLowerCase();
    const mcData = require('minecraft-data')(version);
    const packet = mcData && mcData.protocol && mcData.protocol[state] &&
      mcData.protocol[state].toClient && mcData.protocol[state].toClient.types &&
      mcData.protocol[state].toClient.types.packet;
    const fields = Array.isArray(packet) && packet[1];
    const nameField = Array.isArray(fields) && fields.find((x) => x && x.name === 'name');
    const mappings = nameField && Array.isArray(nameField.type) && nameField.type[1] &&
      nameField.type[1].mappings;
    if (mappings && id !== null) {
      name = mappings['0x' + id.toString(16).padStart(2, '0')] || mappings[String(id)] || '';
    }
  } catch (_) {}
  return {
    id,
    name,
    bytes: buf ? buf.length : 0
  };
}

function reconcileChatSpans(flat, spans) {
  const text = String(flat || '');
  const list = Array.isArray(spans) ? spans.filter((s) => s && s.t) : [];
  if (!text) return list;
  const structured = chatFmt.flatten(list);
  if (!structured) return [{ t: text }];
  if (structured === text) return list;
  // Preserve parsed colours while restoring a prefix/suffix that the
  // translation table omitted from the structured component.
  if (text.endsWith(structured)) return [{ t: text.slice(0, -structured.length) }, ...list].filter((s) => s.t);
  if (text.startsWith(structured)) return [...list, { t: text.slice(structured.length) }].filter((s) => s.t);
  return structured.length > text.length ? list : [{ t: text }];
}

class BotManager extends EventEmitter {
  constructor(logger, authCacheDir) {
    super();
    this.logger = logger;
    this.authCacheDir = authCacheDir;
    this.bot = null;
    this._connectEpoch = 0;
    this._transport = null;
    this._networkHealth = null;
    this.connectionPhase = '';
    this.cfg = null;
    this.account = null;
    this.proxy = null;

    this.status = 'OFFLINE';    // OFFLINE | CONNECTING | ONLINE
    this.lastError = '';
    this.spawnTimeout = null;
    this.loggedIn = false;
    this.spawned = false;
    this.joinChainRan = false;
    this.joinFallback = null;
    this.ping = 0;
    this.connectedAt = null;
    this.reconnectAttempts = 0;
    this.manualDisconnect = false;
    this.reconnectTimer = null;

    this.autoBuild = new AutoBuild(logger);
    this.autoBuild.on('state', st => {
      if(st.status==='running'&&this._lastBuildStatus!=='running'){this._packetBudget?.begin();this._movementWatch?.begin();}
      if(st.status!=='running'){this._motionPacer?.cancel();this._inputReporter?.flush();}
      this._lastBuildStatus=st.status;this.emit('autobuild-state',st);
    });
    this.antiAfk = new AntiAfk(logger);
    this.joinMessages = new JoinMessages(logger);
    this.autoSpam = new AutoSpam(logger, (active) => this.emit('spam-state', active));
    this.macroFarmer = new MacroFarmer(logger);
    this.macroFarmer.onState = (st) => this.emit('macro-state', st);
    // Paket 72: Spawner AFK - Auto Farm'un spawner'li varyanti (ayri durum)
    this.spawnerMacro = new MacroSpawner(logger);
    this.spawnerMacro.onState = (st) => this.emit('spawner-state', st);
    // Paket 76: En yakin sandik -> hizli aktarim -> /sellall dongusu
    this.autoSell = new AutoSell(logger);
    this.autoSell.onState = (st) => this.emit('autosell-state', st);
    this.spawnerProtect = new SpawnerProtect(logger);
    // Paket 77: spawnerlar bitip "oyundan cik" aciksa manuel baglanti kesme gibi
    // davran (auto reconnect DEVREDISI) -> hesap calismayi birakip oyundan cikar.
    this.spawnerProtect.onExit = () => this.disconnect();
    this.dialogs = new DialogHandler(logger, (ev, data) => {
      if (ev === 'trace' && data && data.name) {           // writeRaw ile giden paketi de ize al
        this.trace.push(data.name);
        if (this.trace.length > 8) this.trace.shift();
        if (this.cfg.settings && this.cfg.settings.packetLog) this.logger.info('-> ' + data.name);
        return;
      }
      if (ev === 'dialog') { this.dialogOpen = true; this.pauseGuards(); }
      if (ev === 'dialog-close') { this.dialogOpen = false; this.resumeGuards(); }
      this.emit(ev, data);
    });
    this.dialogOpen = false;
    this.trace = [];
    this.traceIn = [];
    this.respack = new ResourcePack(logger);
    this.packAttempt = 0;
    this.protocolSkipped = 0;
    this.protocolSkipLastLog = 0;
  }

  isOnline() { return this.status === 'ONLINE'; }

  state() {
    return {
      status: this.status,
      server: this.cfg ? `${this.cfg.connection.host}:${this.cfg.connection.port}` : '-',
      account: this.account ? this.account.username : '-',
      ping: this.ping,
      uptime: this.connectedAt ? Date.now() - this.connectedAt : 0,
      spam: this.autoSpam.running,
      antiAfk: this.antiAfk.running,
      macro: this.macroFarmer.running,
      spawnerMacro: this.spawnerMacro.running,
      autoBuild: this.autoBuild.status === 'running',
      autoSell: this.autoSell.running,
      autoSellState: this.autoSell.state(),
      spawner: this.spawnerProtect.running,
      spawnerBusy: this.spawnerProtect.busy,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError
    };
  }

  setStatus(s) {
    this.status = s;
    this.emit('status', this.state());
    if (this.connectGuard) { clearTimeout(this.connectGuard); this.connectGuard = null; }
    if (s === 'CONNECTING') {
      // 60 sn icinde ONLINE olunmazsa takilmayi bitir
      const epoch = this._connectEpoch;
      this.connectGuard = setTimeout(() => {
        if (epoch !== this._connectEpoch || this.dialogOpen) return;
        if (this.status === 'CONNECTING' && !this.loggedIn) {
          const msg = this.logger.L(
            'Bağlantı kurulamadı (60 sn). Sunucu adresini, portu ve sürümü kontrol edin.',
            'Could not connect (60s). Please check the server address, port and version.');
          this.lastError = msg;
          this.logger.error(msg);
          this.emit('notice', { type: 'error', message: msg });
          this.cleanup();
          this.setStatus('OFFLINE');
          this.scheduleReconnect();
        }
      }, 60000);
    }
  }

  // -------------------------------------------------------------------------
  async connect(cfg, account, proxy) {
    if (this.bot || this.status === 'CONNECTING') {
      this.logger.warn(this.logger.L('Zaten bağlı veya bağlanıyor. Önce bağlantıyı kesin.', 'Already connected or connecting. Disconnect first.'));
      return { ok: false, error: 'already_connected' };
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const epoch = ++this._connectEpoch;
    this._moderationStop=false;
    this.cfg = cfg;
    this.account = account;
    this.proxy = proxy;
    this.manualDisconnect = false;
    this.lastError = '';
    this.loggedIn = false;
    this.spawned = false;
    this.joinChainRan = false;
    this.packAttempt = 0;
    this.forcePackMode = null;
    this.needPackRetry = false;
    this.protocolSkipped = 0;
    this.protocolSkipLastLog = 0;
    this.transferRetries = 0;

    const host = String(cfg.connection.host || '').trim();
    if (!host) return this.fail(this.logger.L('Server IP boş. BAĞLANTI sayfasından sunucu adresini girin.', 'Server IP is empty. Enter the server address on the CONNECT page.'));
    if (cfg.toggles.proxy && !proxy) return this.fail(this.logger.L('Proxy açık ama seçili proxy yok. PROXYLER sayfasından bir proxy seçin.', 'Proxy is on but no proxy is selected. Pick one on the PROXIES page.'));
    const ver = cfg.connection.version;
    if (ver && ver !== 'auto' && !require('../versions').isSupported(ver)) {
      return this.fail(this.logger.L(`Minecraft ${ver} bu istemcide desteklenmiyor. "Otomatik algıla" seçin.`, `Minecraft ${ver} is not supported by this client. Pick "Auto detect".`));
    }

    const delay = Math.max(0, Number(cfg.connection.loginDelay) || 0);
    if (delay) this.logger.info(`Login delay: ${delay}s`);
    this.setStatus('CONNECTING');
    await new Promise((r) => setTimeout(r, delay * 1000));
    if (this.manualDisconnect || epoch !== this._connectEpoch || this.status !== 'CONNECTING') return { ok: false, error: 'cancelled' };

    return this.spawnBot();
  }

  async spawnBot() {
    if (this.manualDisconnect || this.status !== 'CONNECTING' || this.bot) return { ok: false, error: 'cancelled' };
    const epoch = this._connectEpoch;
    if (this.cfg && this.cfg.tor && this.cfg.tor.enabled && this.cfg.tor.streamSeparation && typeof this.cfg.vpnNewIdentity === 'function') {
      try { await this.cfg.vpnNewIdentity(); }
      catch (e) {
        if (this.manualDisconnect || epoch !== this._connectEpoch) return { ok: false, error: 'cancelled' };
        const msg = this.logger.L("Seçilen ülkelerde uygun VPN IP'si bulunamadı: ", "No suitable VPN IP was found in the selected countries: ") + e.message;
        this.lastError = msg; this.logger.error(msg); this.setStatus('OFFLINE'); this.scheduleReconnect(); return { ok: false, error: msg };
      }
    }
    if (this.manualDisconnect || epoch !== this._connectEpoch || this.status !== 'CONNECTING') return { ok: false, error: 'cancelled' };
    const c = this.cfg.connection;
    const t = this.cfg.toggles;
    const acc = this.account || { username: 'Player', type: 'offline' };

    const options = {
      host: c.host,
      port: Number(c.port) || 25565,
      username: acc.username,
      version: c.version && c.version !== 'auto' ? c.version : false,
      // Ayrıştırıcıdaki tek-frame uyumsuzluklarını aşağıdaki koruma katmanı
      // yönetir; kütüphanenin ham stack/console gürültüsünü gösterme.
      hideErrors: true,
      physicsEnabled: !!t.physics,
      checkTimeoutInterval: 60 * 1000,
      // Auto-version status must not outlive the visible connection attempt.
      closeTimeout: 15 * 1000,
      noPongTimeout: 1500,
      // Imzali sohbet bazi sunucu/proxy kurulumlarinda hata veriyor
      disableChatSigning: t.noChatSign !== false
    };

    if (t.offline || acc.type === 'offline') {
      options.auth = 'offline';
    } else if (acc.mcSession && acc.mcSession.accessToken) {
      // Premium: Microsoft oturumu zaten alindi (msmc pop-up). Jetonu dogrudan
      // kullaniriz, boylece oyuna girerken tekrar giris istenmez.
      const ses = acc.mcSession;
      const profile = { id: String(ses.id || '').replace(/-/g, ''), name: ses.name || acc.username };
      options.username = profile.name;
      options.auth = (client, opts) => {
        const session = { accessToken: ses.accessToken, selectedProfile: profile, availableProfiles: [profile] };
        client.session = session;
        client.username = profile.name;
        opts.accessToken = ses.accessToken;
        opts.haveCredentials = true;
        client.emit('session', session);
        opts.connect(client);
      };
      this.logger.info(this.logger.L('Premium oturum kullanılıyor: ', 'Using premium session: ') + profile.name);
    } else {
      // Premium hesap ama kayitli Microsoft oturumu yok: kullaniciyi HESAPLAR
      // sayfasindaki "Microsoft ile giris yap" butonuna yonlendiriyoruz.
      return this.fail(this.logger.L(
        'Bu hesapta Microsoft oturumu yok. HESAPLAR sayfasından "Microsoft ile giriş yap" ile giriş yapın '
          + 'veya BAĞLANTI sayfasındaki "Offline / Cracked" anahtarını açın.',
        'This account has no Microsoft session. Sign in with "Sign in with Microsoft" on the ACCOUNTS page '
          + 'or turn on "Offline / Cracked" on the CONNECT page.'));
    }

    if (t.fakeHost && c.fakeHost) {
      options.fakeHost = c.fakeHost;
      this.logger.info(`Fake host: ${c.fakeHost}`);
    }

    if (this._transport) this._transport.abort();
    this.connectionPhase = 'DNS/TCP';
    this._transport = new ConnectionAttempt(
      { host: options.host, port: options.port }, t.proxy ? this.proxy : null, this.logger,
      { onConnect: () => {
        if (epoch === this._connectEpoch && !this.manualDisconnect) this.connectionPhase = options.version === false ? 'status/login' : 'login';
      } }
    );
    options.connect = this._transport.connect;
    if (t.proxy && this.proxy) this.logger.info(`Proxy kullaniliyor: ${this.proxy.type}://${this.proxy.host}:${this.proxy.port}`);

    this.logger.connect(`Connecting to ${options.host}:${options.port} (${c.version}) as ${acc.username}...`);
    this.logger.info(this.logger.L(
      `Ayarlar: kaynak paketi=${c.resourcePack || 'decline'}, sohbet imzası=${t.noChatSign !== false ? 'kapalı' : 'açık'}`,
      `Settings: resource pack=${c.resourcePack || 'decline'}, chat signing=${t.noChatSign !== false ? 'off' : 'on'}`));

    try {
      if (!mineflayer) mineflayer = require('mineflayer');
      options.plugins={...options.plugins,physics:require('./client-tick-physics').compatiblePhysics()};
      this.bot = mineflayer.createBot(options);
    } catch (e) {
      const msg = /Cannot find module/.test(e.message)
        ? this.logger.L('Bağımlılıklar eksik. Klasörde "npm install" çalıştırın.', 'Dependencies are missing. Run "npm install" in the folder.')
        : this.logger.L('Bağlantı kurulamadı: ', 'Could not connect: ') + e.message;
      this.lastError = msg;
      this.logger.error(msg);
      this.emit('notice', { type: 'error', message: msg });
      this.cleanup();
      this.setStatus('OFFLINE');
      this.scheduleReconnect();
      return { ok: false, error: msg };
    }

    // Kaynak paketi (resource pack) cevaplari
    try { this.respack.attach(this.bot, this.packMode()); }
    catch (e) { this.logger.warn(this.logger.L('Kaynak paketi dinleyicisi başlatılamadı: ', 'Could not start resource pack listener: ') + e.message); }

    // Sunucu ekranlari (dialog paketleri) dinlenir
    try { this.dialogs.attach(this.bot, this.cfg.dialogs); } catch (e) { this.logger.warn(this.logger.L('Dialog dinleyici başlatılamadı: ', 'Could not start dialog listener: ') + e.message); }

    this.bindEvents();
    return { ok: true };
  }

  fail(message) {
    this.cleanup();
    this.lastError = message;
    this.logger.error(message);
    this.emit('notice', { type: 'error', message });
    this.setStatus('OFFLINE');
    return { ok: false, error: message };
  }

  // Sunucuyu yoklar: adres/port dogru mu, hangi surum, ping kac?
  async probeServer(host, port) {
    const mcp = require('minecraft-protocol');
    const attempt = new ConnectionAttempt({ host, port: Number(port) || 25565 },
      this.cfg && this.cfg.toggles.proxy ? this.proxy : null, this.logger,
      { connectTimeoutMs: 4500 });
    return new Promise((resolve) => {
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        attempt.abort();
        resolve(result);
      };
      const timer = setTimeout(() => finish({ ok: false, error: 'Zaman aşımı (5 sn). Adres/port ve ağ bağlantısını kontrol edin.' }), 5000);
      try {
        mcp.ping({ host, port: Number(port) || 25565, connect: attempt.connect,
          closeTimeout: 4500, noPongTimeout: 1000 }, (err, res) => {
          if (done) return;
          if (err) return finish({ ok: false, error: err.message });
          finish({
            ok: true,
            version: res.version && res.version.name,
            protocol: res.version && res.version.protocol,
            players: res.players ? `${res.players.online}/${res.players.max}` : '?',
            latency: res.latency || 0
          });
        });
      } catch (e) {
        finish({ ok: false, error: e.message });
      }
    });
  }

  // Canli acilip kapanabilen ayarlar
  setSneak(on) { if(this.autoBuild.reserved){this.logger.warn(this.logger.L('Auto Build sırasında eğilme inşa motoru tarafından yönetilir.','Sneak is managed by Auto Build during the job.'));return;}try { if (this.bot) this.bot.setControlState('sneak', !!on); } catch (_) {} }
  setPhysics(on) {
    if (this.autoBuild.reserved) {
      this.logger.warn(this.logger.L('Auto Build sırasında fizik açık kalmalıdır. Önce inşayı durdurun.', 'Physics must remain on during Auto Build. Stop the build first.'));
      return;
    }
    try {
      if (this.bot && this.bot.physicsEnabled !== undefined) this.bot.physicsEnabled = !!on;
      // Paket 72: runtime degisikligi gunluge yazilir (kalici degildir; yeniden
      // baglantida config'ten gelen deger uygulanir).
      if (on !== undefined) {
        this.logger.info(this.logger.L('Fizik değiştirildi (runtime): ', 'Physics changed (runtime): ') +
          (!!on ? this.logger.L('AÇIK', 'ON') : this.logger.L('KAPALI', 'OFF')) +
          this.logger.L(' — yeniden bağlantıda config ayarına döner.', ' — reverts to config on reconnect.'));
      }
    } catch (_) {}
  }

  // -------------------------------------------------------------------------
  bindEvents() {
    const bot = this.bot;
    const t = this.cfg.toggles;
    const epoch = this._connectEpoch;
    const current = () => this.bot === bot && epoch === this._connectEpoch && !this.manualDisconnect;
    const onCurrent = (fn) => (...args) => { if (current()) return fn(...args); };
    this.traceWrites(bot);
    this.attachKnockbackResponse(bot);

    bot.once('login', onCurrent(() => {
      this.loggedIn = true;
      this.connectionPhase = 'play';
      this.connectedAt = this.connectedAt || Date.now();
      this.reconnectAttempts = 0;
      this.transferRetries = 0;
      if (this.connectGuard) { clearTimeout(this.connectGuard); this.connectGuard = null; }
      this.setStatus('ONLINE');           // sohbet ve komutlar artik kullanilabilir
      this.lastError = '';
      this.logger.connect('Login successful');
      // Paket 72: fizik durumunu giris aninda logla - config'ten gelen deger ile
      // calisan runtime deger ayri ayri yazilir. Fark varsa toggle runtime'da
      // degismis demektir; bir daha "kim acti" karisikligi yasanmaz.
      try {
        const cfgOn = !!(this.cfg && this.cfg.toggles && this.cfg.toggles.physics);
        const runOn = bot.physicsEnabled === true;
        const st = runOn ? this.logger.L('AÇIK', 'ON') : this.logger.L('KAPALI', 'OFF');
        this.logger.info(this.logger.L('Bot fiziği: config=', 'Bot physics: config=') + (cfgOn ? 'ON' : 'OFF') +
          this.logger.L(' çalışan=', ' live=') + st +
          (runOn !== cfgOn ? this.logger.L(' (fark var: runtime’da değişmiş)', ' (mismatch: changed at runtime)') : ''));
      } catch (_) { /* yoksay */ }
      setTimeout(onCurrent(() => { try { this.dialogs.flushPending(); } catch (_) {} }), 1200);
      if ((this.cfg.connection.resourcePack || 'smart') === 'smart' && this.respack.requested) {
        this.logger.info(this.logger.L('Çalışan kaynak paketi yöntemi: ', 'Working resource pack method: ') + this.respack.mode);
      }
      this.emit('notice', { type: 'ok', message: this.logger.L('Sunucuya giriş yapıldı: ', 'Logged in to the server: ') + this.cfg.connection.host });

      this.pingTimer = setInterval(onCurrent(() => {
        const p = bot.player && bot.player.ping ? bot.player.ping : 0;
        if (p !== this.ping) { this.ping = p; this.emit('status', this.state()); }
      }), this.cfg.settings && this.cfg.settings.lowCpuMode ? 6000 : 3000);

      // spawn 8 sn icinde gelmezse (lobi/queue sunuculari) join komutlarini yine calistir
      this.joinFallback = setTimeout(onCurrent(() => {
        if (!this.spawned) {
          this.logger.info(this.logger.L('Spawn gelmedi, giriş sırası yine de çalıştırılıyor', 'No spawn packet, running the join order anyway'));
          this.runJoinChain(bot, 'login-fallback');
        }
      }), 8000);
    }));

    // 45 sn icinde dunyaya girilmezse kullaniciya sebep bildir
    this.spawnTimeout = setTimeout(() => {
      if (!current() || this.dialogOpen) return;
      if (!this.loggedIn) {
        const stuckOnPack = this.trace.length && /resource_pack_receive/.test(this.trace[this.trace.length - 1]);
        const msg = stuckOnPack
          ? this.logger.L(
              'Sunucuya girilemedi (45 sn). Kaynak paketi aşamasında takıldık: BAĞLANTI sayfasında kaynak paketi ayarını "Reddet" yapıp tekrar deneyin.',
              'Could not join the server (45s). We got stuck at the resource pack step: on the CONNECT page set the resource pack option to "Decline" and try again.')
          : this.logger.L(
              `Sunucuya giriş tamamlanmadı (45 sn). Beklenen aşama: ${this.connectionPhase || 'login'}. Bu tek başına sürüm uyuşmazlığı anlamına gelmez; Network target ve ağ hatası satırlarını kontrol edin.`,
              `Server login did not finish (45s). Pending phase: ${this.connectionPhase || 'login'}. This alone does not prove a version mismatch; check Network target and network error lines.`);
        this.lastError = msg;
        this.logger.warn(msg);
        this.emit('notice', { type: 'warn', message: msg });
      }
    }, 45000);

    bot.on('windowOpen', onCurrent((win) => {
      const size = Number.isInteger(win && win.inventoryStart) ? win.inventoryStart : (win && win.slots ? win.slots.length : 54);
      this.emit('screen-open', { title: plainText(win && win.title), size });
    }));
    bot.on('windowClose', onCurrent(() => this.emit('screen-close', {})));

    bot.once('spawn', onCurrent(() => {
      this.spawned = true;
      this.connectedAt = this.connectedAt || Date.now();
      this.setStatus('ONLINE');
      this.lastError = '';
      if (this.spawnTimeout) clearTimeout(this.spawnTimeout);
      if (this.joinFallback) clearTimeout(this.joinFallback);
      this.logger.connect(`Spawned in world as ${bot.username}`);
      this.emit('notice', { type: 'ok', message: this.logger.L(`Dünyaya girildi: ${bot.username}`, `Spawned in the world: ${bot.username}`) });

      if (t.sneak) { try { bot.setControlState('sneak', true); } catch (_) {} }
      // GIRIS KOMUTLARI + Auto Farm ayni sirada (ayarlanan yerde) calisir
      this.runJoinChain(bot, 'spawn');
      this.startMacroGuard();
      if (t.antiAfk || this.cfg.antiAfk.enabled) this.antiAfk.start(bot, this.cfg.antiAfk);
      if (this.cfg.autoSpam.enabled) this.autoSpam.start(bot, this.cfg.autoSpam);
      const as = (this.cfg.macros && this.cfg.macros.autoSell) || {};
      if (as.enabled) this.startAutoSell(as, 'spawn');
      if (this.cfg.spawnerProtect && this.cfg.spawnerProtect.enabled) {
        this.spawnerProtect.start(bot, this.cfg);
      } else if (this.cfg.spawnerProtect) {
        // Paket 80: acik degilse nedenini goster - "mod acik ama calismiyor" sanisi
        // cogu zaman anahtarın hicbir hesapta secili olmamasindan geliyordu.
        this.logger.info(this.logger.L(
          'Spawner Protect kapali (anahtar hicbir hesapta secili degil). SETTINGS > Spawner Koruma anahtarini acin.',
          'Spawner protect is off (the switch is not enabled for any account). Turn it on in SETTINGS > Spawner protection.'));
      }

    }));

    // Sohbet: renkleri ve gonderen adini koruyarak arayuze yollanir.
    // ('messagestr' yerine 'message' dinlenir; ikisi de ayni yerde tetiklenir
    //  ama 'message' bileseni ve gonderenin UUID'sini de verir.)
    bot.on('message', onCurrent((msg, position, senderUuid) => {
      let flat = '';
      let spans = [];
      try { flat = msg && typeof msg.toString === 'function' ? msg.toString() : String(msg == null ? '' : msg); } catch (_) { flat = ''; }
      try { spans = chatFmt.spansOf(msg, bot.registry && bot.registry.language); } catch (_) { spans = []; }
      const spanText = chatFmt.flatten(spans);
      // Some server components are rendered partially by the registry language
      // table. Prefer the longest complete representation so names/arguments do
      // not disappear from /msg, moderation and announcement messages.
      if (spanText && flat && spanText.length > flat.length) flat = spanText;
      if(pauseOnBuildPermissionDenial(this.autoBuild,flat,position,senderUuid)){
        this.logger.warn(this.logger.L('Auto Build: Ada bu hesaba blok koyma izni vermedi; işlem duraklatıldı.','Auto Build: Island denied this account build permission; paused.'));
        this.logger.diagnostic?.('build_permission',{reason:'permission_denied',phase:'place'});
      }
      if (flat && /§[0-9a-fk-orx]/i.test(flat)
        && !spans.some((s) => s && s.c)) spans = chatFmt.spansOfText(flat);
      spans = reconcileChatSpans(flat, spans);
      // This is a backend -> lobby transfer, NOT necessarily a full TCP kick.
      // Keep the raw chat visible and capture diagnostics without forcing login.
      if (/you were kicked from.+connection timed out/i.test(flat)) {
        this.logger.warn(this.logger.L(
          'Alt sunucuda Connection timed out bildirildi. Ana bağlantı açık olabilir; ağ özeti kaydediliyor.',
          'The sub-server reported Connection timed out. The main connection may still be open; recording network health.'));
        if (this._networkHealth) this._networkHealth.report();
      }
      const from = this.senderName(bot, senderUuid);
      // Sunucu adi mesajin icine koymadiysa basina biz ekleyelim
      let show = from && flat.indexOf(from) === -1 ? from : '';
      if (from && /^<\s*>/.test(flat)) {                 // "<> mesaj" -> adi bos gelmis
        flat = flat.replace(/^<\s*>\s*/, '');
        spans = stripEmptyName(spans);
        show = from;
      }
      this.logger.chat(show ? `<${show}> ${flat}` : flat);
      this.emit('chat', { type: 'chat', message: flat, from: show, spans, time: this.logger.ts() });
    }));

    bot.on('kicked', onCurrent((reason) => {
      const text = readReason(reason);
      const moderated=/\bbanned\b|\bban(?:land|lanmış|landi)|yasakland|temporarily banned|permanently banned/i.test(text);
      this.logger.diagnostic?.('server_kick',{reason:moderated?'ban_reported':/too many packets|packet.*(?:rate|flood)|packet spam/i.test(text)?'packet_rate_reported':'kick_reported'});
      if(moderated){this._moderationStop=true;this.needPackRetry=false;this.autoBuild.pause('server_moderation');}

      let long = explainKick(text);
      let short = shortHint(text);

      if(!moderated){
      // Sunucu paketi zorunlu tutuyorsa kendiliginden "otomatik kabul" moduna gec
      // Alt sunucuya aktarim basarisiz olduysa birkac kez kendiliginden dene
      if (/unable to connect|genericreason|server_disconnect/i.test(text) && (this.transferRetries || 0) < 3) {
        this.transferRetries = (this.transferRetries || 0) + 1;
        this.needPackRetry = true;   // ayni tekrar mekanizmasi kullanilir
        this.retryDelayMs = 6000;
        this.logger.warn(this.logger.L(`Alt sunucuya (lobi/spawn) aktarılamadı. ${this.transferRetries}. tekrar 6 sn sonra...`, `Transfer to the sub-server (lobby/spawn) failed. Retry ${this.transferRetries} in 6 s...`));
        short = this.logger.L(`Alt sunucuya aktarılamadı, tekrar deneniyor (${this.transferRetries}/3)`, `Transfer to sub-server failed, retrying (${this.transferRetries}/3)`);
      }
      if (/resource\s*pack|kaynak\s*paket/i.test(text) && this.respack.mode !== 'auto') {
        this.forcePackMode = 'auto';
        this.packAttempt = 0;
        this.needPackRetry = true;
        long = this.logger.L(
          'Sunucu kaynak paketini zorunlu tutuyor. Ayar otomatik olarak "Otomatik kabul et" yapıldı ve bağlantı yeniden deneniyor.',
          'The server requires the resource pack. The setting was switched to "Auto accept" automatically and the connection is being retried.');
        short = this.logger.L(
          'Kaynak paketi zorunlu: otomatik kabul moduna geçildi, tekrar deneniyor.',
          'Resource pack required: switched to auto accept, retrying.');
        this.emit('config-patch', { connection: { resourcePack: 'auto' } });
      }
      if (this.trace.length && /resource_pack_receive/.test(this.trace[this.trace.length - 1])) {
        long = this.logger.L(
          'Bağlantı tam olarak kaynak paketi (resource pack) cevabından sonra kesildi. BAĞLANTI sayfasındaki "Kaynak paketi" ayarını "Reddet" yapıp tekrar deneyin; yine olmazsa "Hiç cevap verme" seçeneğini deneyin.',
          'The connection dropped right after the resource pack response. On the CONNECT page set "Resource pack" to "Decline" and try again; if that fails, try "Never respond".');
        short = this.logger.L(
          'Kaynak paketi yüzünden atıldınız. BAĞLANTI > Kaynak paketi = Reddet deneyin.',
          'You were kicked because of the resource pack. Try CONNECT > Resource pack = Decline.');
      }
      const since = this.dialogs.lastSubmitAt ? Date.now() - this.dialogs.lastSubmitAt : 1e9;
      if (since < 12000) {
        long = this.logger.L(
          'Sunucu, gönderdiğimiz form cevabını kabul etmedi (cevaptan ' + Math.round(since / 1000) + ' sn sonra atıldınız). Sunucu ekranındaki "Komutla gönder" butonunu veya GİRİŞ KOMUTLARI > Sunucu ekranları bölümündeki "Formu her zaman komutla gönder" seçeneğini kullanın.',
          'The server did not accept the form answer we sent (you were kicked ' + Math.round(since / 1000) + ' s after the answer). Use the "Send via command" button on the server screen, or the "Always send forms via command" option under Join messages > Server screens.');
        short = this.logger.L(
          'Form cevabını kabul etmedi. "Komutla gönder" yöntemini deneyin.',
          'The form answer was rejected. Try the "Send via command" method.');
      }
      // Sunucu paketi bayt duzeyinde cozemediyse: bicimi degistirip tekrar dene
      if (/failed to decode packet/i.test(text) && /custom_click_action/i.test(text)) {
        this.decodeFails = (this.decodeFails || 0) + 1;
        try { this.dialogs.noteDecodeFailure(); } catch (_) {}
        if (this.decodeFails <= 3) {
          this.transferRetries = 0;      // bicim degistigi icin tekrar hakki yenilenir
          this.needPackRetry = true;
          this.retryDelayMs = 6000;
        }
        long = this.logger.L(
          'Sunucu, form cevabı paketini çözemedi (DecoderException). Paketin bayt biçimi değiştirildi (deneme ' + this.decodeFails + '/3) ve bağlantı yeniden deneniyor. Yine olursa sunucu ekranındaki "Komutla gönder" butonunu kullanın.',
          'The server could not decode the form answer packet (DecoderException). The packet byte format was changed (attempt ' + this.decodeFails + '/3) and the connection is being retried. If it happens again, use the "Send via command" button on the server screen.');
        short = this.logger.L(
          'Form paketi biçimi değiştirildi, tekrar deneniyor (' + this.decodeFails + '/3).',
          'Form packet format changed, retrying (' + this.decodeFails + '/3).');
      }
      }
      this.lastError = this.logger.L('Sunucu attı: ', 'Kicked by server: ') + text;
      this.logger.disconnect('Kicked: ' + text);
      try { this.logger.info(this.logger.L('Kick ham verisi: ', 'Raw kick data: ') + JSON.stringify(reason).slice(0, 900)); } catch (_) {}
      this.logger.info(this.logger.L('Son gönderilen paketler: ', 'Last sent packets: ') + (this.trace.length ? this.trace.join(' -> ') : this.logger.L('(yok)', '(none)')));
      this.logger.info(this.logger.L('Son gelen paketler: ', 'Last received packets: ') + (this.traceIn.length ? this.traceIn.join(' -> ') : this.logger.L('(yok)', '(none)')));
      if (long) this.logger.warn(this.logger.L('İpucu: ', 'Hint: ') + long);
      this.emit('chat', { type: 'error', message: 'Kicked: ' + text, time: this.logger.ts() });
      if (long) this.emit('chat', { type: 'system', message: this.logger.L('İpucu: ', 'Hint: ') + long, time: this.logger.ts() });
      this.emit('notice', { type: 'error', message: this.logger.L('Sunucu bağlantıyı kesti: ', 'The server closed the connection: ') + text + (short ? ' — ' + short : '') });
    }));

    bot.on('error', onCurrent((err) => {
      // SkyBlock/proxy kaynakli tek paket sema uyumsuzlugu fatal degildir.
      // Deserializer hatali frame'i atip sonraki pakete devam eder; kirmizi
      // hata bildirimi ve lastError ile calisan baglantiyi bozuk gostermeyiz.
      if (this.handleRecoverableProtocolError(err, bot && bot._client)) return;
      const map = {
        ENOTFOUND: this.logger.L('Sunucu adresi bulunamadı. Server IP yanlış olabilir.', 'Server address not found. The server IP may be wrong.'),
        ECONNREFUSED: this.logger.L('Denenen TCP hedefi bağlantıyı reddetti (ECONNREFUSED). Network target satırındaki hedef/portu kontrol edin; sunucu, ağ veya proxy reddi olabilir. Bu bir Minecraft sürüm hatası değildir.', 'The attempted TCP destination refused the connection (ECONNREFUSED). Check the target/port in Network target; the server, network or proxy may be refusing it. This is not a Minecraft version error.'),
        ETIMEDOUT: this.logger.L('Bağlantı zaman aşımına uğradı.', 'The connection timed out.'),
        ECONNRESET: this.logger.L('Bağlantı sunucu tarafından sıfırlandı.', 'The connection was reset by the server.'),
        EAI_AGAIN: this.logger.L('DNS çözümlenemedi. İnternet bağlantınızı kontrol edin.', 'DNS lookup failed. Check your internet connection.')
      };
      const msg = map[err.code] || err.message;
      this.lastError = msg;
      this.logger.error(msg + (err.code ? ` (${err.code})` : ''));
      // Keep raw stage details instead of hiding every timeout behind one
      // generic sentence. No credentials or payloads are included.
      this.logger.info(`Network failure detail: phase=${this.connectionPhase || '?'} code=${err.code || '?'} stage=${err.kbStage || err.syscall || '?'} detail=${String(err.message || '').slice(0, 300)}`);
      if (err.address || err.port) this.logger.info(`Network error target: ${err.address || '?'}:${err.port || '?'} phase=${this.connectionPhase || '?'}`);
      this.emit('chat', { type: 'error', message: msg, time: this.logger.ts() });
      this.emit('notice', { type: 'error', message: msg });
      if (!this.loggedIn) {
        this.logger.disconnect('Connection attempt failed; all pending sockets were cancelled');
        this.cleanup();
        this.setStatus('OFFLINE');
        if (!this.maybeSmartRetry()) this.scheduleReconnect();
      }
    }));

    if (t.worldChangeMessages) {
      bot.on('respawn', onCurrent(() => {
        this.logger.info('World change detected');
        this.runJoinChain(bot, 'world-change');
      }));
    }

    bot.on('end', onCurrent((reason) => {
      if (this._networkHealth) this._networkHealth.report();
      this.logger.disconnect('Disconnected: ' + (reason || 'unknown') + (this.lastError ? ' | ' + this.lastError : ''));
      if (!this.lastError && reason && reason !== 'disconnect.quitting') {
        this.emit('notice', { type: 'warn', message: this.logger.L('Bağlantı kapandı: ', 'Connection closed: ') + reason });
      }
      if (!this._moderationStop && !this.needPackRetry && /unable to connect|genericreason/i.test(this.lastError || '') && (this.transferRetries || 0) < 3) {
        this.transferRetries = (this.transferRetries || 0) + 1;
        this.needPackRetry = true;
        this.retryDelayMs = 6000;
      }
      this.cleanup();
      this.setStatus('OFFLINE');
      if (!this.maybeSmartRetry()) this.scheduleReconnect();
    }));
  }

  // -------------------------------------------------------------------------
  // Paket 72: KNOCKBACK YANIT PENCERESI
  // Fizik KAPALIYKEN bot, sunucunun uyguladigi hizi (knockback) ve yercekimi
  // yok sayar -> "vuruhta yerinden oynamiyor" + "alti kazilinca ucmuyor"
  // (anti-knockback / anti-gravity) imzasi olusur. NexoMC gx01 gibi strict
  // anticheat'ler bu vektoru "lag/cheat" diye okuyup kick atabiliyor.
  // Vurulma aninda fizik motoru ~1.3 sn acilir: hiz DOGAL islenir, gerekirse
  // dusus devam eder (uusta kalma imzasi olusmaz), pozisyon paketleri gider.
  // Yere inince (veya 5 sn tavaninda) eski duruma doner.
  // Fizik zaten ACIKSA (bot yuruyor) hicbir sey yapmaz - dogal tepki mevcut.
  attachKnockbackResponse(bot) {
    if (!bot || !bot._client) return;
    let timer = null;
    let settleTimer = null;
    let openedAt = 0;
    let wasOn = false;
    let active = false;
    const restore = () => {
      if (!active) return;               // pencere kapaliysa kimsenin ayarina dokunma
      active = false;
      if (timer) { clearTimeout(timer); timer = null; }
      if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
      try { if (bot.physicsEnabled !== undefined) bot.physicsEnabled = bot.__autoBuildInteracting ? true : wasOn; } catch (_) {}
    };
    const settle = () => {
      try {
        const grounded = bot.entity && bot.entity.onGround === true;
        if (grounded || Date.now() - openedAt > 5000) { restore(); return; }
        settleTimer = setTimeout(settle, 400);
      } catch (_) { restore(); }
    };
    bot._client.on('entity_velocity', (packet) => {
      try {
        if (!packet || !bot.entity || packet.entityId !== bot.entity.id) return;
        const v = packet.velocity || {};
        if ((v.x || 0) === 0 && (v.y || 0) === 0 && (v.z || 0) === 0) return; // iptal/0
        if (bot.physicsEnabled === true) return;   // fizik acik: dogal tepki var
        wasOn = bot.physicsEnabled === true;
        openedAt = Date.now();
        active = true;
        try { bot.physicsEnabled = true; } catch (_) {}
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; settle(); }, 1300);
      } catch (_) { /* yoksay */ }
    });
    // Paket 72/2: pencere ACIKKEN sunucu konum duzeltmesi (rubber-band/teleport)
    // gelirse hemen kapat - bizim simulasyon sunucunun duzeltmesiyle catismasin,
    // sunucu konumu kabul edilsin. Pencere kapaliyken hicbir yan etkisi yoktur.
    bot._client.on('position', () => { try { restore(); } catch (_) {} });
    bot.once('end', restore);
  }

  // FullPacketParser normalde cb(error) cagirir. Node Transform bu noktada
  // kendini kapattigi icin client.js'in ayni parser'i tekrar pipe etmesi gercek
  // bir kurtarma degildir: giden chat calisir ama gelen paketler durur ve
  // 60 sn sonra "client timed out" olur. Parser'i daha hata olusmadan sarip
  // play/configuration uyumsuzlugunu bos bir yerel pakete ceviriyoruz.
  // Boylece transform stream yasamaya ve sonraki frame'leri okumaya devam eder.
  installProtocolCompatibility(client) {
    if (!client) return;
    const patchCurrentParser = () => {
      const parser = client.deserializer;
      if (!parser || parser.__kbCompatWrapped || typeof parser.parsePacketBuffer !== 'function') return;
      const original = parser.parsePacketBuffer.bind(parser);
      const self = this;
      parser.parsePacketBuffer = function compatibleParse(buffer) {
        try {
          return decodeAttributePacket(client,buffer)||original(buffer);
        } catch (err) {
          // Login/auth paketindeki bir hata fatal kalir. Oyun ve configuration
          // paketleri ise splitter/decompressor tarafindan zaten tek ve tam bir
          // frame olarak verilir; bu frame'i atlamak sonrakinin sinirini bozmaz.
          const state = String(client.state || '').toLowerCase();
          if (state !== 'play' && state !== 'configuration') throw err;
          try {
            err.__kbInboundParser = true;
            err.buffer = Buffer.isBuffer(buffer) ? buffer : null;
          } catch (_) {}
          self.handleRecoverableProtocolError(err, client);
          const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.alloc(0);
          return {
            data: { name: 'kb_compat_skip', params: {} },
            metadata: { size: raw.length },
            buffer: raw,
            fullBuffer: raw
          };
        }
      };
      parser.__kbCompatWrapped = true;
    };

    patchCurrentParser();
    if (!client.__kbCompatStateHook && typeof client.on === 'function') {
      client.__kbCompatStateHook = true;
      // Her login/configuration/play gecisinde minecraft-protocol yeni bir
      // deserializer olusturur. state olayi yeni nesne hazirken yayilir.
      client.on('state', patchCurrentParser);
    }
  }

  // Ayni Error once client, sonra bot emitter'ina gelebilecegi icin nesneye
  // isaret koyup sayaci yalnizca bir kez artiriyoruz.
  handleRecoverableProtocolError(err, client) {
    if (!isRecoverableIncomingParseError(err)) return false;
    if (err && err.__kbProtocolRecovered) return true;
    try { err.__kbProtocolRecovered = true; } catch (_) {}

    this.protocolSkipped = (this.protocolSkipped || 0) + 1;
    const now = Date.now();
    // Ilkini hemen, devam edenleri en fazla 30 sn'de bir yaz. Kirmizi hata/toast
    // yoktur; baglanti ve otomasyon calismaya devam eder.
    if (this.protocolSkipped === 1 || now - (this.protocolSkipLastLog || 0) >= 30000) {
      this.protocolSkipLastLog = now;
      const info = incomingPacketInfo(client, err);
      const label = info.name || (info.id === null ? '?' : '0x' + info.id.toString(16));
      this.logger.info(this.logger.L(
        `SkyBlock uyumluluk koruması: desteklenmeyen ek paket atlandı; bağlantı devam ediyor (${label}${info.bytes ? `, ${info.bytes} bayt` : ''}, toplam ${this.protocolSkipped}).`,
        `SkyBlock compatibility guard: an unsupported extra packet was skipped; the connection continues (${label}${info.bytes ? `, ${info.bytes} bytes` : ''}, total ${this.protocolSkipped}).`
      ));
    }
    return true;
  }

  // Sunucu bizi atarsa hangi paketin sebep oldugunu gorebilmek icin son gonderilenler tutulur
  traceWrites(bot) {
    this.trace = [];
    this.traceIn = [];
    const client = bot._client;
    if (!client || client.__traced) return;
    this.installProtocolCompatibility(client);
    const skipIn = /^(kb_compat_skip|position|entity|update_time|chunk|light|world|map_chunk|rel_entity|entity_|multi_block|block_change|player_info|update_health|teleport|keep_alive|ping|sound|particle|animation|collect|spawn_|held_item|set_slot|window_items|advancements|scoreboard|team|tab_complete|declare_commands|bundle_delimiter|set_ticking_state|step_tick|game_state_change|abilities|entity_velocity|entity_metadata|damage_event|hurt_animation|move_entity)/;
    this.protoErrors = 0;
    client.on('error', (err) => {
      if (this.bot !== bot || this.manualDisconnect) return;
      if (this.handleRecoverableProtocolError(err, client)) return;
      if (this.protoErrors++ > 8) return;
      this.logger.warn(this.logger.L('Protokol hatası: ', 'Protocol error: ') + (err && err.message ? err.message : String(err)));
    });

    client.on('packet', (_d, meta) => {
      if (this.bot !== bot || this.manualDisconnect) return;
      try {
        const n = meta && meta.name ? String(meta.name) : '';
        if (!n || skipIn.test(n)) return;
        this.traceIn.push(n);
        if (this.traceIn.length > 12) this.traceIn.shift();
        if (this.cfg.settings && this.cfg.settings.packetLog) this.logger.info('<- ' + n);
      } catch (_) {}
    });
    const skip = /^(position|look|position_look|keep_alive|pong|teleport_confirm|arm_animation|player_input|vehicle_move|steer|held_item_slot|abilities|client_command|window_confirmation|ping_request|tick_end)$/;
    bot.__kbMotionTracing = true;
    const orig = client.write.bind(client);
    if (this._networkHealth) this._networkHealth.stop();
    const health = new NetworkHealth(client, this.logger);
    this._networkHealth = health;
    client.once('end', () => health.stop());
    // Package 113: actual/attempted counts and short-window engineering guard.
    // Critical replies are always immediate. No server-specific ban thresholds.
    this._lastSwingAt=0;this._posLog=[];
    const {MovementInput}=require('./movement-input');
    this._inputReporter?.close();const inputReporter=new MovementInput(bot);this._inputReporter=inputReporter;
    const budget=new PacketBudget({onTrip:stats=>{
      this._motionPacer?.cancel();
      this.logger.warn('Auto Build packet watchdog: '+JSON.stringify(stats));
      this.logger.diagnostic?.('packet_guard',stats);
      this.autoBuild.trafficHoldUntil=Date.now()+3000;
      if(this.autoBuild.status==='running')this.autoBuild.pause('packet_guard');
    }});this._packetBudget=budget;
    const sendActual=(name,params,required=false)=>{
      if(this.bot!==bot||this.manualDisconnect)return;
      const n=String(name),result=orig(name,params);health.sent(n);budget.sent(n,required);
      if(!skip.test(n)){
        this.trace.push(n);if(this.trace.length>8)this.trace.shift();
        if(this.cfg?.settings?.packetLog)this.logger.info('-> '+n);
      }
      if((n==='look'||n==='position_look')&&Number.isFinite(params?.yaw)&&Number.isFinite(params?.pitch)){
        bot.__kbLastView={yaw:params.yaw,pitch:params.pitch,time:Date.now()};bot.emit('kb:view-sent',bot.__kbLastView);
      }
      if(n==='block_place')bot.emit('kb:build-place-sent',{location:params?.location,direction:params?.direction});
      if(n==='login_acknowledged')this.afterLoginAck(client);
      return result;
    };
    let ticks;
    const pacer=new MotionPacer(sendActual,{onCoalesce:()=>budget.totals.coalesced++,frameBounded:()=>!!ticks?.supported()});this._motionPacer=pacer;
    this._clientTicks?.close();
    ticks=new (require('./client-ticks').ClientTicks)(bot,{
      flush:()=>pacer.flush(),cancel:()=>pacer.cancel(),send:sendActual,enabled:()=>this.bot===bot&&!this.manualDisconnect,
      onViolation:reason=>{
        pacer.cancel();this.logger.warn('Client tick lifecycle stopped: '+reason);
        if(this.autoBuild.status==='running')this.autoBuild.pause('client_tick_order');
      }
    });this._clientTicks=ticks;
    const movement=new MovementWatch();this._movementWatch=movement;
    let response=null,observation=null;
    const beforePosition=packet=>{
      if(this.bot!==bot)return;
      pacer.cancel();
      observation=movement.observe(packet,bot.entity?.position,this.autoBuild.status==='running');
      if(observation.valid&&observation.active&&observation.kind==='correction'){
        const p=bot.entity.position,t=observation.target,v=bot.entity.velocity,c=bot.controlState;
        const xyz=q=>[q.x,q.y,q.z].map(n=>Number(n).toFixed(3)).join(',');
        observation.detail={mcVersion:bot.version,x:p.x,y:p.y,z:p.z,targetX:t.x,targetY:t.y,targetZ:t.z,deltaX:t.x-p.x,deltaY:t.y-p.y,deltaZ:t.z-p.z,
          ground:!!bot.entity.onGround,forward:!!c?.forward,jump:!!c?.jump,sprint:!!c?.sprint,sneak:!!c?.sneak,vxz:Math.hypot(v?.x||0,v?.z||0),vy:v?.y||0,
          floor:bot.blockAt(p.offset(0,-.01,0))?.name||'unknown',phase:this.autoBuild.phase};
        // Technical coordinates/controls only, no packet body, names or IDs.
        this.logger.info('Auto Build position adjustment: from='+xyz(p)+' to='+xyz(t)+' delta='+xyz({x:t.x-p.x,y:t.y-p.y,z:t.z-p.z})+
          ' mc='+bot.version+' phase='+this.autoBuild.phase+' floor='+observation.detail.floor+' forward='+!!c?.forward+' jump='+!!c?.jump+' sprint='+!!c?.sprint);
      }
      response=observation.target?{target:observation.target,deadline:Date.now()+2200}:null;
    };
    const afterForcedMove=()=>{
      const current=observation;observation=null;response=null;
      if(this.bot!==bot||!current?.active||!current.valid)return;
      if(current.kind==='correction')this.logger.diagnostic?.('server_position',{
        ...movement.snapshot(),...current.detail,correctionDistance:current.distance,positionKind:current.kind,reason:current.reason||'position_adjusted'
      });
      if(current.reason&&this.autoBuild.status==='running'){
        this.logger.warn(this.logger.L('Sunucu konum düzeltmesi koruması: ','Server position watchdog: ')+current.reason+' distance='+current.distance.toFixed(3));
        this.autoBuild.movementHoldUntil=Date.now()+3000;this.autoBuild.pause(current.reason);
      }
    };
    const clearPending=()=>{pacer.cancel();response=null;observation=null;};
    client.prependListener('position',beforePosition);
    for(const n of ['respawn','login','start_configuration'])client.prependListener(n,clearPending);
    bot.on('forcedMove',afterForcedMove);
    this._movementDetach=()=>{
      client.removeListener('position',beforePosition);
      for(const n of ['respawn','login','start_configuration'])client.removeListener(n,clearPending);
      bot.removeListener('forcedMove',afterForcedMove);clearPending();
    };
    const report=()=>{
      const st=budget.snapshot(),ms=movement.snapshot();this.logger.diagnostic?.('packet_window',{...st,...ms,state:this.autoBuild.status,reason:this.autoBuild.reason});
      if(this.autoBuild.reserved)this.logger.info(this.logger.L('Auto Build anlık trafik (son 1 sn): ','Auto Build traffic (last 1s): ')+JSON.stringify({
        total:st.currentSecond,last100ms:st.current100ms,serverReplies:st.currentServerReplySecond,clientTickEnds:st.currentTickEnds,protocolEssential:st.currentEssentialSecond,automation:st.currentAutomationSecond,
        movement:st.currentMotionSecond,positionRepliesLastSecond:st.currentPositionReplies,types:st.currentTypes,
        positionRequestsSinceJobStart:ms.positionRequests,realCorrectionsSinceJobStart:ms.realCorrections,recentCorrections5s:ms.recentCorrections,
        packetGuard:st.latched,positionGuard:ms.movementLatched,status:this.autoBuild.status,reason:this.autoBuild.reason
      }));
    };
    const timer=setInterval(()=>{if(this.autoBuild.reserved)report();},5000);timer.unref?.();this._packetReportTimer=timer;
    client.once('end',()=>{report();clearInterval(timer);pacer.close();});
    client.write=(name,params)=>{
      if(this.bot!==bot||this.manualDisconnect)return;
      const n=String(name);
      // End markers are owned by the native lifecycle above, never by an
      // arbitrary plugin or a timer independent of the physics loop.
      if(n==='tick_end')return;
      if(!ticks.allow(n))return;
      if(n==='player_input'&&inputReporter.supported()){
        const frame=inputReporter.prepare();if(!frame)return;
        if(!budget.inspect(n,this.autoBuild.status==='running'))return;
        const result=sendActual(n,{inputs:frame.inputs});inputReporter.sent(frame.inputs);return result;
      }
      if(CRITICAL.test(n))return sendActual(name,params);
      // The exact native reply to a server position request is mandatory, not
      // an automation movement. Never coalesce it away or delay it behind a walk.
      if(n==='position_look'&&response&&Date.now()<=response.deadline&&samePosition(params,response.target)){
        response=null;pacer.cancel();pacer.last=Date.now();return sendActual(name,params,true);
      }

      if(!budget.inspect(n,this.autoBuild.status==='running'))return;
      if(ticks.supported()&&(MOTION.test(n)||n==='flying'))return pacer.offer(n,params);
      const now=Date.now();
      if(n==='arm_animation'){
        if(this._lastSwingAt&&now-this._lastSwingAt<90){budget.totals.suppressed++;return;}
        this._lastSwingAt=now;
      }
      if(MOTION.test(n)){
        if(this.autoBuild.reserved)return pacer.offer(n,params);
        // Outside Auto Build retain the existing motion cap, but count accepted
        // writes only: discarded attempts must not extend the blocked window.
        this._posLog=this._posLog.filter(t=>now-t<1000);
        if(this._posLog.length>=27){budget.totals.suppressed++;return;}
        this._posLog.push(now);
      }
      return sendActual(name,params);
    };
    client.__traced = true;
  }

  // Sunucu ekrani acikken zaman asimi sayaclari durur (kullanici formu dolduruyor olabilir)
  pauseGuards() {
    if (this.connectGuard) { clearTimeout(this.connectGuard); this.connectGuard = null; }
    if (this.spawnTimeout) { clearTimeout(this.spawnTimeout); this.spawnTimeout = null; }
    if (this.configGuard) { clearTimeout(this.configGuard); this.configGuard = null; }
    this.logger.info(this.logger.L('Sunucu ekranı açık: zaman aşımı sayaçları duraklatıldı', 'Server screen open: timeout counters paused'));
  }

  resumeGuards() {
    if (this.loggedIn || this.manualDisconnect) return;
    if (this.configGuard) clearTimeout(this.configGuard);
    this.configGuard = setTimeout(() => {
      if (this.loggedIn || this.manualDisconnect) return;
      this.logger.warn(this.logger.L(
        'Form cevaplandı ama sunucu 30 sn içinde oyuna almadı. Şifre kurallara uymuyor olabilir (uzunluk/aynı olma) veya sunucu başka bir adım bekliyor.',
        'The form was answered but the server did not let us in within 30 s. The password may not match the rules (length/match) or the server expects another step.'));
      this.logger.info(this.logger.L('Son gelen paketler: ', 'Last received packets: ') + (this.traceIn.length ? this.traceIn.join(' -> ') : this.logger.L('(yok)', '(none)')));
    }, 30000);
  }

  // Secili kaynak paketi stratejisi ('smart' ise sirayla dener)
  packMode() {
    if (this.forcePackMode) {
      this.logger.info(this.logger.L('Kaynak paketi stratejisi: ' + this.forcePackMode + ' (sunucu zorunlu tuttuğu için)', 'Resource pack strategy: ' + this.forcePackMode + ' (server requires it)'));
      return this.forcePackMode;
    }
    const set = (this.cfg.connection && this.cfg.connection.resourcePack) || 'smart';
    if (set !== 'smart') return set;
    const order = ['auto', 'decline', 'ignore'];
    const mode = order[this.packAttempt % order.length];
    this.logger.info(this.logger.L(`Kaynak paketi stratejisi: ${mode} (akıllı mod, deneme ${this.packAttempt + 1}/3)`, `Resource pack strategy: ${mode} (smart mode, attempt ${this.packAttempt + 1}/3)`));
    return mode;
  }

  // Yapilandirmada takildiysak bir sonraki strateji ile tekrar dene
  maybeSmartRetry() {
    if(this._moderationStop)return false;
    if (this.needPackRetry && !this.manualDisconnect) {
      this.needPackRetry = false;
      const wait = this.retryDelayMs || 2500;
      this.retryDelayMs = 0;
      this.logger.warn(this.logger.L('Yeniden bağlanılıyor (' + Math.round(wait / 1000) + ' sn)...', 'Reconnecting in ' + Math.round(wait / 1000) + ' s...'));
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (this.manualDisconnect) return;
        this.setStatus('CONNECTING');
        this.spawnBot();
      }, wait);
      return true;
    }
    const set = (this.cfg.connection && this.cfg.connection.resourcePack) || 'smart';
    if (set !== 'smart' || this.loggedIn || this.manualDisconnect) return false;
    if (!this.respack.requested) return false;
    if (this.packAttempt >= 2) {
      this.logger.warn(this.logger.L(
        'Kaynak paketinin üç yöntemi de denendi, sunucu yine almadı. Sunucuda bot koruması olabilir; AYARLAR > Paket günlüğü ile inceleyin.',
        'All three resource pack methods were tried and the server still refused. The server may have bot protection; inspect it with Settings > Packet log.'));
      return false;
    }
    this.packAttempt++;
    const next = ['auto', 'decline', 'ignore'][this.packAttempt];
    this.logger.warn(this.logger.L(`Kaynak paketi yöntemi değiştirilip tekrar deneniyor: ${next}`, `Changing resource pack method and retrying: ${next}`));
    this.emit('notice', { type: 'warn', message: this.logger.L('Kaynak paketi yöntemi değiştirildi, tekrar deneniyor (', 'Resource pack method changed, retrying (') + next + ')' });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualDisconnect) return;
      this.setStatus('CONNECTING');
      this.spawnBot();
    }, 3000);
    return true;
  }

  // login_acknowledged sonrasi: vanilla gibi "brand" gonder + yapilandirma bekcisi
  afterLoginAck(client) {
    if (this.ackDone) return;
    this.ackDone = true;

    if (this.cfg.toggles.vanillaLike !== false) {
      setTimeout(() => {
        if (!this.bot || this.bot._client !== client || this.status === 'OFFLINE') return;
        try {
          const brand = 'vanilla';
          const data = Buffer.concat([Buffer.from([brand.length]), Buffer.from(brand, 'utf8')]);
          client.write('custom_payload', { channel: 'minecraft:brand', data });
          this.logger.info(this.logger.L('İstemci kimliği gönderildi (brand: vanilla)', 'Client brand sent (vanilla)'));
        } catch (e) { this.logger.info(this.logger.L('Brand gönderilemedi: ', 'Could not send client brand: ') + e.message); }
      }, 120);
    }

    if (this.configGuard) clearTimeout(this.configGuard);
    this.configGuard = setTimeout(() => {
      if (!this.bot || this.bot._client !== client || this.loggedIn || this.manualDisconnect || this.dialogOpen) return;
      const msg = this.logger.L(
        'Yapılandırma aşamasında takıldık (20 sn): sunucu bizi oyuna almadı. '
          + 'Muhtemel sebepler: (1) sunucuda bot koruması var, (2) sürüm uyuşmuyor, (3) kaynak paketi cevabı. '
          + 'Deneyin: BAĞLANTI > sürüm olarak 1.21.4 veya 1.20.1 seçin (sunucu ViaVersion kullanıyorsa çalışır), '
          + 'Kaynak paketi ayarını "Otomatik kabul et" yapın, AYARLAR > "Paket günlüğü"nu açıp tekrar deneyin.',
        'We got stuck in the configuration phase (20 s): the server did not let us into the game. '
          + 'Likely causes: (1) the server has bot protection, (2) version mismatch, (3) the resource pack reply. '
          + 'Try: CONNECT > pick version 1.21.4 or 1.20.1 (works if the server uses ViaVersion), '
          + 'set Resource pack to "Accept automatically", then turn on SETTINGS > "Packet log" and retry.');
      this.logger.warn(msg);
      this.logger.info(this.logger.L('Son gelen paketler: ', 'Last received packets: ') + (this.traceIn.length ? this.traceIn.join(' -> ') : this.logger.L('(yok)', '(none)')));
      this.emit('notice', { type: 'warn', message: this.logger.L('Sunucu bizi oyuna almadı (yapılandırma aşaması). Ayrıntı KAYITLAR sayfasında.', 'The server did not let us into the game (configuration phase). Details on the LOGS page.') });
      // Akilli modda sunucunun bizi atmasini beklemeden diger yontemi dene
      const set = (this.cfg.connection && this.cfg.connection.resourcePack) || 'smart';
      if (set === 'smart' && this.respack.requested && this.packAttempt < 2) {
        try { if (this.bot) this.bot.end(); } catch (_) {}
      }
    }, 20000);
  }

  cleanup() {
    this._inputReporter?.close();this._inputReporter=null;
    this._clientTicks?.close();this._clientTicks=null;
    this._movementDetach?.();this._movementDetach=null;
    if(this._movementWatch)this.logger.diagnostic?.('movement_end',this._movementWatch.snapshot());this._movementWatch=null;
    this._motionPacer?.close();this._motionPacer=null;
    if(this._packetReportTimer)clearInterval(this._packetReportTimer);this._packetReportTimer=null;
    this.logger.diagnostic?.('packet_end',this._packetBudget?.snapshot()||{});this._packetBudget=null;
    this.autoBuild.stop('disconnected');
    ++this._connectEpoch;
    this.bot = null;
    if (this.connectGuard) clearTimeout(this.connectGuard);
    this.connectGuard = null;
    if (this._networkHealth) this._networkHealth.stop();
    this._networkHealth = null;
    if (this._transport) this._transport.abort();
    this._transport = null;
    if (this.spawnTimeout) clearTimeout(this.spawnTimeout);
    if (this.configGuard) clearTimeout(this.configGuard);
    this.configGuard = null;
    this.ackDone = false;
    this.spawnTimeout = null;
    if (this.joinFallback) clearTimeout(this.joinFallback);
    this.joinFallback = null;
    this.loggedIn = false;
    this.spawned = false;
    this.joinChainRan = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.antiAfk.stop();
    this.joinMessages.cancel();
    if (this.dialogs && this.dialogs.current) this.dialogs.cancel();
    if (this.respack) this.respack.clearTimers();
    this.dialogOpen = false;
    this.autoSpam.stop(true);
    this.macroFarmer.stop(true);
    this.spawnerMacro.stop(true);
    this.autoSell.stop(true);
    this.spawnerProtect.stop();
    this.stopMacroGuard();
    this.connectedAt = null;
    this.ping = 0;
    this.bot = null;
  }

  // -------------------------------------------------------------------------
  scheduleReconnect() {
    if(this._moderationStop)return;
    const ar = this.cfg && this.cfg.autoReconnect;
    if (this.manualDisconnect || !ar || !(ar.enabled || this.cfg.toggles.autoReconnect)) return;
    if (!ar.unlimited && this.reconnectAttempts >= (Number(ar.maxAttempts) || 5)) {
      this.logger.warn(this.logger.L('Otomatik yeniden bağlanma: maksimum deneme sayısına ulaşıldı', 'Auto reconnect: maximum attempts reached'));
      return;
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts++;
    const delay = Math.max(1, Number(ar.delay) || 10);
    this.logger.reconnect(`Reconnecting in ${delay}s (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualDisconnect) return;
      this.setStatus('CONNECTING');
      this.spawnBot();
    }, delay * 1000);
  }

  disconnect() {
    this.manualDisconnect = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.bot) {
      try { this.bot.quit('KARABARAKORSA CLIENT'); } catch (_) {}
      try { this.bot.end(); } catch (_) {}
    }
    this.cleanup();
    this.setStatus('OFFLINE');
    this.logger.disconnect('Manual disconnect');
    return { ok: true };
  }

  // ----- Envanter (PANEL > ENVANTER) ---------------------------------------
  // Secili hesabin tum oyuncu envanterini arayuze dondur:
  // uretim sonucu (0), 2x2 uretim (1-4), zirh (5-8), ana (9-35),
  // hotbar (36-44), diger el (45) ve fare imlecindeki esya.
  inventoryList() {
    const bot = this.bot;
    if (!bot || !bot.inventory) return { ok: false, error: 'no_bot' };
    try {
      const inv = bot.inventory.slots || [];
      const zones = [
        { zone: 'craftOut', start: 0, end: 0 },
        { zone: 'craft', start: 1, end: 4 },
        { zone: 'armor', start: 5, end: 8 },
        { zone: 'main', start: 9, end: 35 },
        { zone: 'hotbar', start: 36, end: 44 },
        { zone: 'offhand', start: 45, end: 45 }
      ];
      const itemView = (it, slot, zone) => it && it.type > 0 && it.count > 0
        ? {
            slot, zone, empty: false,
            type: it.type, metadata: it.metadata, count: it.count,
            name: it.name || '', displayName: (it.displayName || it.name || ''),
            maxStackSize: it.maxStackSize || 64
          }
        : { slot, zone, empty: true, count: 0, name: '', displayName: '' };
      const slots = [];
      for (const z of zones) {
        for (let s = z.start; s <= z.end; s++) {
          slots.push(itemView(inv[s], s, z.zone));
        }
      }
      let selected = null;
      try { selected = bot.inventory.selectedItem || null; } catch (_) { selected = null; }
      return {
        ok: true,
        account: (this.account && (this.account.username || this.account.id)) || '',
        slots,
        cursor: selected ? itemView(selected, -1, 'cursor') : itemView(null, -1, 'cursor'),
        quickBarSlot: Number.isInteger(bot.quickBarSlot) ? bot.quickBarSlot : 0,
        windowOpen: !!(bot.currentWindow && bot.currentWindow !== bot.inventory)
      };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  }

  // Tek islem: inventoryAction(windowSlot, 'one' | 'all' | 'split')
  //  * 'one'   -> clickWindow(slot, 0, 4)  = Q ile 1 tane dusur
  //  * 'all'   -> clickWindow(slot, 1, 4)  = Ctrl+Q ile yiginin tamamini dusur
  //  * 'split' -> clickWindow(slot, 1, 0)  = sag tik: yarisini kaldir,
  //              sonra ilk bos kareye koy; bos kare yoksa kaldirilani dus.
  // Makro/sunucu ekrani acikken envanter degistirilmez (pw: slotlar farkli).
  async inventoryAction(winSlot, action) {
    if (this.autoBuild?.status === 'running' || this.autoBuild?.worker) return { ok: false, error: 'autobuild_busy' };
    const bot = this.bot;
    if (!bot || !bot.inventory) return { ok: false, error: 'no_bot' };
    if (bot.currentWindow && bot.currentWindow !== bot.inventory) {
      return { ok: false, error: 'window_open' };
    }
    const slotIdx = Number(winSlot);
    const it = bot.inventory.slots[slotIdx];
    if (!it || it.type === 0 || it.count <= 0) return { ok: false, error: 'empty' };
    try {
      if (action === 'one') {
        await bot.clickWindow(slotIdx, 0, 4);
      } else if (action === 'all') {
        await bot.clickWindow(slotIdx, 1, 4);
      } else if (action === 'split') {
        await bot.clickWindow(slotIdx, 1, 0);
        const empty = bot.inventory.firstEmptyInventorySlot();
        if (empty !== null && empty !== undefined && empty !== slotIdx) {
          await bot.clickWindow(empty, 0, 0);
        } else {
          await bot.clickWindow(-999, 0, 0);   // bos kare yok -> kaldirilan yari dussun
        }
      } else {
        return { ok: false, error: 'bad_action' };
      }
      await sleep(150);   // sunucu senkronu icin kisa bekleme
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  }

  // Paket 101: Minecraft envanterinin gercek tiklama semantikleri.
  // click: sol/sag/shift/double/1-9/F; move: surukle-birak; return: pencere
  // kapanirken farede kalan yigini guvenle ana envantere geri koy.
  async inventoryOperation(op) {
    if (this.autoBuild?.status === 'running' || this.autoBuild?.worker) return { ok: false, error: 'autobuild_busy' };
    const bot = this.bot;
    if (!bot || !bot.inventory) return { ok: false, error: 'no_bot' };
    if (bot.currentWindow && bot.currentWindow !== bot.inventory) {
      return { ok: false, error: 'window_open' };
    }
    const p = op || {};
    const type = String(p.type || '');
    const validSlot = (v) => Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 45;
    const click = async (slot, button, mode) => {
      if (!validSlot(slot)) throw new Error('bad_slot');
      // Sunucu bir inventory transaction onayini kaybederse Mineflayer'in
      // clickWindow promise'i 15-20 sn asili kalabiliyor. Panel bu sure boyunca
      // kilitlenmesin; 2,2 sn sonra islemi serbest birakip yeni durumu okuyabilsin.
      let timeout = null;
      const pending = Promise.resolve(bot.clickWindow(Number(slot), Number(button), Number(mode)));
      pending.catch(() => {}); // timeouttan sonra gelebilecek reddi yut
      try {
        await Promise.race([
          pending,
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error('inventory_timeout')), 2200);
          })
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    };
    try {
      if (type === 'click') {
        const slot = Number(p.slot);
        const button = Number(p.button);
        const mode = Number(p.mode);
        const allowed = (mode === 0 && (button === 0 || button === 1))
          || (mode === 1 && button === 0)
          || (mode === 2 && ((button >= 0 && button <= 8) || button === 40))
          || (mode === 3 && button === 2)
          || (mode === 4 && (button === 0 || button === 1))
          || (mode === 6 && button === 0);
        if (!validSlot(slot) || !allowed) return { ok: false, error: 'bad_action' };
        // Bos crafting output slotu tiklanamaz. Bunu sunucuya yollamak bazi
        // proxylerde transaction cevabi gelmeyene kadar paneli donduruyordu.
        const out = bot.inventory.slots && bot.inventory.slots[0];
        if (slot === 0 && (!out || out.type === 0 || out.count <= 0)) return this.inventoryList();
        await click(slot, button, mode);
      } else if (type === 'double') {
        const slot = Number(p.slot);
        if (!validSlot(slot)) return { ok: false, error: 'bad_slot' };
        const out = bot.inventory.slots && bot.inventory.slots[0];
        if (slot === 0 && (!out || out.type === 0 || out.count <= 0)) return this.inventoryList();
        let held = null;
        try { held = bot.inventory.selectedItem || null; } catch (_) { held = null; }
        // Cursor bossa ilk tik yigini alir; ikinci paket ayni turdeki tum
        // yiginlari Minecraft'taki cift tik davranisiyla cursor'a toplar.
        if (!held) await click(slot, 0, 0);
        await click(slot, 0, 6);
      } else if (type === 'move') {
        const from = Number(p.from);
        const to = Number(p.to);
        if (!validSlot(from) || !validSlot(to) || from === to) return { ok: false, error: 'bad_slot' };
        const source = bot.inventory.slots[from];
        if (!source || source.type === 0 || source.count <= 0) return { ok: false, error: 'empty' };
        // Sol surukleme tum yigini, Alt+sürükleme yarisini tasir.
        await click(from, p.half ? 1 : 0, 0);
        await click(to, 0, 0);
        // Hedef uyumsuz/doluysa farede kalan eski hedefi veya fazlayi kaynak
        // slota geri koy: işlem her zaman temiz bir cursor ile biter.
        let held = null;
        try { held = bot.inventory.selectedItem || null; } catch (_) { held = null; }
        if (held) await click(from, 0, 0);
      } else if (type === 'return') {
        // Modal kapanırken cursor'daki eşyayı asla yere atma.
        for (let guard = 0; guard < 40; guard++) {
          let held = null;
          try { held = bot.inventory.selectedItem || null; } catch (_) { held = null; }
          if (!held) break;
          const inv = bot.inventory.slots || [];
          let target = -1;
          // Önce normal envanterde boş kare; crafting/armor alanına rastgele koyma.
          for (let s = 9; s <= 44; s++) {
            const it = inv[s];
            if (!it || it.type === 0 || it.count <= 0) { target = s; break; }
          }
          if (target < 0) {
            let heldNbt = '';
            try { heldNbt = JSON.stringify(held.nbt || null); } catch (_) {}
            for (let s = 9; s <= 44; s++) {
              const it = inv[s];
              let nbt = '';
              try { nbt = JSON.stringify(it && it.nbt || null); } catch (_) {}
              if (it && it.type === held.type && it.metadata === held.metadata
                && nbt === heldNbt && it.count < (it.maxStackSize || 64)) {
                target = s; break;
              }
            }
          }
          if (target < 0) return { ok: false, error: 'cursor_full', cursor: true };
          const before = held.count;
          await click(target, 0, 0);
          let after = null;
          try { after = bot.inventory.selectedItem || null; } catch (_) { after = null; }
          if (after && after.count === before) return { ok: false, error: 'cursor_stuck', cursor: true };
        }
      } else {
        return { ok: false, error: 'bad_action' };
      }
      return this.inventoryList();
    } catch (e) {
      const msg = (e && e.message) || String(e);
      return { ok: false, error: msg === 'bad_slot' ? 'bad_slot' : msg };
    }
  }

  // Gonderenin adi: UUID -> oyuncu adi
  senderName(bot, uuid) {
    if (!uuid) return '';
    try {
      const map = bot.uuidToUsername || {};
      if (map[uuid]) return String(map[uuid]);
      const players = bot.players || {};
      for (const k of Object.keys(players)) {
        const p = players[k];
        if (p && p.uuid === uuid) return String(p.username || k);
      }
    } catch (_) { /* yoksay */ }
    return '';
  }

  playerNames() {
    try {
      const players = this.bot && this.bot.players || {};
      return [...new Set(Object.keys(players).map((key) => {
        const p = players[key];
        return String((p && p.username) || key || '').trim();
      }).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    } catch (_) {
      return [];
    }
  }

  tabComplete(query) {
    if (!this.bot || !this.loggedIn || typeof this.bot.tabComplete !== 'function') return Promise.resolve([]);
    const once = (text) => new Promise((resolve) => {
      let settled = false;
      const finish = (err, values) => {
        if (settled) return;
        settled = true;
        if (Array.isArray(err) && values === undefined) { values = err; err = null; }
        if (err) return resolve([]);
        const list = Array.isArray(values) ? values : (values && Array.isArray(values.matches) ? values.matches : []);
        resolve([...new Set(list.map((x) => typeof x === 'string' ? x : (x && (x.match || x.name || x.text || x.value) || ''))
          .map((x) => String(x).trim()).filter(Boolean))]);
      };
      try {
        const result = this.bot.tabComplete(String(text || ''), finish);
        if (result && typeof result.then === 'function') result.then((v) => finish(null, v)).catch(() => finish(null, []));
      } catch (_) { finish(null, []); }
    });
    return once(query).then((matches) => matches.length || !String(query || '').startsWith('/')
      ? matches : once(String(query).slice(1)));
  }

  // --- Disaridan cagrilan aksiyonlar ---------------------------------------
  sendChat(message) {
    if (!this.bot || !this.loggedIn) return { ok: false, error: 'not_connected' };
    try {
      this.bot.chat(message);
      const shown = maskSecretChat(message);
      this.logger.chat(`[ME] ${shown}`);
      const me = (this.bot && this.bot.username) || this.accountName || '';
      this.emit('chat', { type: 'self', message: shown, from: me, spans: [{ t: shown }], time: this.logger.ts() });
      return { ok: true };
    } catch (e) {
      this.logger.error(e.message);
      return { ok: false, error: e.message };
    }
  }

  startSpam(cfg) {
    if (!this.bot || !this.loggedIn) return { ok: false, error: 'not_connected' };
    return { ok: this.autoSpam.start(this.bot, cfg) };
  }

  stopSpam() { this.autoSpam.stop(); return { ok: true }; }

  autoBuildCatalog() {
    try { const registry = this.bot?.registry || require('minecraft-data')('1.20.1');
      return { ok: true, version: this.bot?.version || '1.20.1', blocks: buildCatalog(registry) }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  startAutoBuild(spec) {
    if (!this.bot || !this.loggedIn || !this.spawned) return { ok: false, error: 'not_connected' };
    const c = this.cfg || {};
    if (this.joinMessages.isActive(this.bot)) return { ok: false, error: 'join_pending' };
    if (this.macroFarmer.running || this.autoSell.running || this.spawnerProtect.running ||
        c.macros?.farmer?.enabled || c.macros?.autoSell?.enabled || c.spawnerProtect?.enabled)
      return { ok: false, error: 'feature_conflict' };
    this.bot.clearControlStates();
    return this.autoBuild.start(this.bot, spec);
  }

  // --- Makrolar (Auto Farm) ----------------------------------------------
  startMacro(cfg, why) {
    if (this.autoBuild?.reserved || this.autoBuild?.worker) return { ok: false, error: this.logger.L('Önce Auto Build işini durdurun.', 'Stop Auto Build first.') };
    if (!this.bot || !this.loggedIn) {
      return { ok: false, error: this.logger.L('Sunucuya bağlı değilsiniz', 'You are not connected to the server') };
    }
    const r = this.macroFarmer.start(this.bot, cfg || (this.cfg.macros && this.cfg.macros.farmer));
    if (r && r.ok && why && why !== 'manual') {
      this.logger.info(this.logger.L(`Auto Farm otomatik başlatıldı (${why})`, `Auto Farm started automatically (${why})`));
    }
    // Makro acik kaldigi surece calissin diye denetci de kurulur
    if (r && r.ok) this.startMacroGuard();
    this.emit('status', this.state());
    return r;
  }

  stopMacro() {
    this.macroFarmer.stop();
    this.emit('status', this.state());
    return { ok: true };
  }

  macroState() { return this.macroFarmer.state(); }

  // --- Spawner AFK (Paket 72) ---------------------------------------------
  startMacroSpawner(cfg, why) {
    if (this.autoBuild?.reserved || this.autoBuild?.worker) return { ok: false, error: this.logger.L('Önce Auto Build işini durdurun.', 'Stop Auto Build first.') };
    if (SPAWNER_AFK_LOCKED) {
      this.spawnerMacro.stop(true);
      return {
        ok: false,
        error: this.logger.L(
          'Spawner AFK şu an kapalı; özellik deneme sürecinde.',
          'Spawner AFK is currently unavailable while testing.'
        )
      };
    }
    if (!this.bot || !this.loggedIn) {
      return { ok: false, error: this.logger.L('Sunucuya bağlı değilsiniz', 'You are not connected to the server') };
    }
    const r = this.spawnerMacro.start(this.bot, cfg || ((this.cfg.macros && this.cfg.macros.spawner) || {}));
    if (r && r.ok && why && why !== 'manual') {
      this.logger.info(this.logger.L(`Spawner AFK otomatik başlatıldı (${why})`, `Spawner AFK started automatically (${why})`));
    }
    // Makro acik kaldigi surece calissin diye denetci de kurulur
    if (r && r.ok) this.startMacroGuard();
    this.emit('status', this.state());
    return r;
  }

  stopMacroSpawner() {
    this.spawnerMacro.stop();
    this.emit('status', this.state());
    return { ok: true };
  }

  spawnerMacroState() { return this.spawnerMacro.state(); }

  // --- Auto Sell (Paket 76) -----------------------------------------------
  startAutoSell(cfg, why) {
    if (this.autoBuild?.reserved || this.autoBuild?.worker) return { ok: false, error: this.logger.L('Önce Auto Build işini durdurun.', 'Stop Auto Build first.') };
    if (!this.bot || !this.loggedIn) {
      return { ok: false, error: this.logger.L('Sunucuya bağlı değilsiniz', 'You are not connected to the server') };
    }
    const r = this.autoSell.start(this.bot, cfg || ((this.cfg.macros && this.cfg.macros.autoSell) || {}));
    if (r && r.ok && why && why !== 'manual') {
      this.logger.info(this.logger.L(`Auto Sell otomatik başlatıldı (${why})`, `Auto Sell started automatically (${why})`));
    }
    this.emit('status', this.state());
    return r;
  }

  stopAutoSell() {
    this.autoSell.stop();
    this.emit('status', this.state());
    return { ok: true };
  }

  autoSellState() { return this.autoSell.state(); }

  // O an acik olan sunucu ekranindaki esyalari okur (arayuzde kareleri
  // isimlendirmek icin): kullanici kare saymak zorunda kalmaz.
  peekWindow(silent) {
    if (!this.bot) return { ok: false, error: this.logger.L('Sunucuya bağlı değilsiniz', 'You are not connected to the server') };
    const win = this.bot.currentWindow;
    if (!win) {
      return { ok: false, error: this.logger.L(
        'Şu anda açık bir ekran yok. Komutu oyunda yazıp ekran açıkken tekrar deneyin.',
        'No screen is open right now. Run the command in game and try again while the screen is open.') };
    }
    const size = Number.isInteger(win.inventoryStart) ? win.inventoryStart : (win.slots ? win.slots.length : 54);
    const items = [];
    for (let i = 0; i < size; i++) {
      const it = win.slots && win.slots[i];
      if (!it) continue;
      // DIKKAT: customName / displayName / baslik bazi surumlerde metin, bazi
      // surumlerde Chat NESNESI gelir. plainText ikisini de duz yaziya cevirir
      // (yoksa arayuzde "[object Object]" gorunur).
      const label = plainText(it.customName) || plainText(it.displayName) || String(it.name || '');
      // id = Minecraft kayit adi (esya ikonunu bulmak icin), name = ekranda yazan ad
      const id = String(it.name || '').replace(/^minecraft:/, '');
      items.push({ slot: i, id, name: label || id || '?', count: it.count || 1 });
    }
    const title = plainText(win.title);
    if (!silent) this.logger.info(this.logger.L(
      `Ekran okundu: "${title}" · ${items.length} eşya (${size} kare)`,
      `Screen read: "${title}" · ${items.length} items (${size} slots)`));
    return { ok: true, title, size, items };
  }

  async clickScreenSlot(slot, button) {
    if (!this.bot || !this.loggedIn) return { ok: false, error: 'not_connected' };
    const win = this.bot.currentWindow;
    if (!win) return { ok: false, error: 'no_window' };
    const n = Math.trunc(Number(slot));
    const size = Number.isInteger(win.inventoryStart) ? win.inventoryStart : (win.slots ? win.slots.length : 54);
    if (!Number.isInteger(n) || n < 0 || n >= size) return { ok: false, error: 'bad_slot' };
    const mouseButton = Number(button) === 1 ? 1 : 0;
    let sent = false;
    try {
      const click = this.bot.clickWindow(n, mouseButton, 0);
      await Promise.race([
        Promise.resolve(click),
        new Promise((resolve) => setTimeout(resolve, 900))
      ]);
      sent = true;
    } catch (_) {
      try {
        this.macroFarmer.bot = this.bot;
        this.macroFarmer.hookBot(this.bot);
        sent = this.macroFarmer.rawClick(win, n, mouseButton, 0);
      } catch (_) { sent = false; }
    }
    try { this.macroFarmer.resetCursor(win); } catch (_) {}
    if (!sent) return { ok: false, error: 'click_failed' };
    this.logger.info(this.logger.L(
      `Canlı ekran: kare #${n} oyuna gönderildi`,
      `Live screen: slot #${n} sent to the game`));
    return { ok: true, slot: n };
  }

  setAntiAfk(enabled, cfg) {
    if (enabled) {
      if (!this.bot) return { ok: false, error: 'not_connected' };
      this.antiAfk.start(this.bot, cfg);
    } else {
      this.antiAfk.stop();
      this.logger.info('Anti AFK disabled');
    }
    this.emit('status', this.state());
    return { ok: true };
  }

  runJoinMessages() {
    if (this.autoBuild.reserved || this.autoBuild.worker) return { ok: false, error: this.logger.L('Önce Auto Build işini durdurun.', 'Stop Auto Build first.') };
    if (!this.bot) return { ok: false, error: 'not_connected' };
    this.runJoinChain(this.bot, 'manual');
    return { ok: true };
  }

  // Auto Farm ayarlari (her zaman guncel config'ten okunur)
  farmerCfg() {
    const mf = (this.cfg.macros && this.cfg.macros.farmer) || {};
    return {
      cfg: mf,
      on: !!(mf.enabled && String(mf.command || '').trim() && (mf.steps || []).length),
      mode: mf.startMode === 'delay' ? 'delay' : 'join',
      at: Math.max(0, Number(mf.joinIndex) || 0),
      delay: Math.max(0, Number(mf.startDelay) === 0 ? 0 : (Number(mf.startDelay) || 3))
    };
  }

  // Spawner AFK ayarlari (komut yoktur; adim listesi yeterlidir)
  spawnerCfg() {
    const ms = (this.cfg.macros && this.cfg.macros.spawner) || {};
    return {
      cfg: ms,
      // Ekran adımı seçilmese bile Spawner AFK çalışır: spawner'a döner ve
      // sağ tıklar. Adımlar yalnızca açılan menüde ek işlem istenirse gerekir.
      on: !SPAWNER_AFK_LOCKED && !!ms.enabled,
      mode: ms.startMode === 'delay' ? 'delay' : 'join',
      at: Math.max(0, Number(ms.joinIndex) || 0),
      delay: Math.max(0, Number(ms.startDelay) === 0 ? 0 : (Number(ms.startDelay) || 3))
    };
  }

  // Her giris komutu artik "hangi hesaplarda gonderilsin" listesine bagli.
  // c.accounts yoksa (eski kayitlar) c.enabled'e bakilir; varsa yalnizca o
  // hesap kimligi listedeyse komut gonderilir. Boylece ayni zincirde /login
  // her hesapta calisirken /warp afk sadece secili hesaplarda calisir.
  joinCommandsForAccount() {
    const all = (this.cfg.joinMessages && this.cfg.joinMessages.commands) || [];
    const accId = this.account && this.account.id;
    return all.filter((c) => {
      if (!c || !c.enabled || !String(c.command || '').trim()) return false;
      if (Array.isArray(c.accounts)) return !accId || c.accounts.indexOf(accId) !== -1;
      return true;
    });
  }

  // GIRIS KOMUTLARI + (istenirse) Auto Farm / Spawner AFK ayni sirada calisir.
  // Sunucu restart atsa da, auto reconnect olsa da bu zincir bastan kurulur.
  runJoinChain(bot, why) {
    if (!bot) return;
    // Zincir bu baglanti icin bir kez calistiysa OTOMATIK tetiklemeleri
    // (spawn, login-fallback, world-change) yok say. Sunucu spawn'i 8 sn'den
    // gec gonderdiginde once login-fallback zinciri kuruyor, sonra gelen spawn
    // ayni zinciri ikinci kez kurup /login'i tekrar gonderiyordu. Ayni sekilde
    // /login sonrasi respawn/world-change de zinciri bastan aliyordu.
    // Elle calistirma (manual) her zaman serbest.
    if (why !== 'manual' && this.joinChainRan) {
      this.logger.info(this.logger.L(
        `Giriş sırası bu bağlantıda zaten çalıştı (${why}); tekrar gönderilmiyor.`,
        `Join order already ran on this connection (${why}); not re-sending.`));
      return;
    }
    const t = this.cfg.toggles || {};
    const f = this.farmerCfg();
    const ms = this.spawnerCfg();
    const cmds = t.joinMessages ? this.joinCommandsForAccount() : [];
    const extras = [];
    if (f.on && f.mode === 'join') {
      extras.push({
        at: f.at,                       // 0 = en son
        delay: f.delay,
        label: this.logger.L('Auto Farm başlatılıyor', 'starting Auto Farm'),
        run: () => this.startMacro(this.cfg.macros.farmer, why || 'join')
      });
    }
    if (ms.on && ms.mode === 'join') {
      extras.push({
        at: ms.at,
        delay: ms.delay,
        label: this.logger.L('Spawner AFK başlatılıyor', 'starting Spawner AFK'),
        run: () => this.startMacroSpawner(this.cfg.macros.spawner, why || 'join')
      });
    }
    if (!cmds.length && !extras.length) return;
    const r = this.joinMessages.run(bot, cmds, { extra: extras });
    if (r.count) {
      this.joinChainRan = true;
      const plan = this.joinMessages.plan.map((x) => `${x.no}) ${x.text} (+${x.delay}s)`).join('  ·  ');
      this.logger.info(this.logger.L(`Giriş sırası kuruldu: ${plan}`, `Join order scheduled: ${plan}`));
    }
    // 'delay' modu: giris komutlarindan bagimsiz, bagladiktan N sn sonra
    if (f.on && f.mode === 'delay') {
      if (this.macroDelayTimer) clearTimeout(this.macroDelayTimer);
      this.macroDelayTimer = setTimeout(() => {
        if (this.bot && this.loggedIn) this.startMacro(this.cfg.macros.farmer, 'delay');
      }, Math.max(0, f.delay) * 1000 || 4000);
    }
    if (ms.on && ms.mode === 'delay') {
      if (this.spawnerDelayTimer) clearTimeout(this.spawnerDelayTimer);
      this.spawnerDelayTimer = setTimeout(() => {
        if (this.bot && this.loggedIn) this.startMacroSpawner(this.cfg.macros.spawner, 'delay');
      }, Math.max(0, ms.delay) * 1000 || 4000);
    }
  }

  // Makro(lar) acikken KAPATILANA KADAR calissin: her 20 sn'de bir denetlenir
  startMacroGuard() {
    this.stopMacroGuard();
    this.macroGuard = setInterval(() => {
      const f = this.farmerCfg();
      if (f.on) {
        if (this.bot && this.loggedIn && !this.macroFarmer.running && !this.macroFarmer.busy) {
          this.logger.info(this.logger.L(
            'Auto Farm açık ama çalışmıyordu, yeniden başlatıldı',
            'Auto Farm was enabled but not running, restarted'));
          this.startMacro(this.cfg.macros.farmer, 'guard');
        }
      }
      const ms = this.spawnerCfg();
      if (ms.on) {
        if (this.bot && this.loggedIn && !this.spawnerMacro.running && !this.spawnerMacro.busy) {
          this.logger.info(this.logger.L(
            'Spawner AFK açık ama çalışmıyordu, yeniden başlatıldı',
            'Spawner AFK was enabled but not running, restarted'));
          this.startMacroSpawner(this.cfg.macros.spawner, 'guard');
        }
      }
      const as = (this.cfg.macros && this.cfg.macros.autoSell) || {};
      if (as.enabled && this.bot && this.loggedIn && !this.autoSell.running && !this.autoSell.busy) {
        this.logger.info(this.logger.L(
          'Auto Sell açık ama çalışmıyordu, yeniden başlatıldı',
          'Auto Sell was enabled but not running, restarted'));
        this.startAutoSell(as, 'guard');
      }
    }, 20000);
  }

  stopMacroGuard() {
    if (this.macroGuard) { clearInterval(this.macroGuard); this.macroGuard = null; }
    if (this.macroDelayTimer) { clearTimeout(this.macroDelayTimer); this.macroDelayTimer = null; }
    if (this.spawnerDelayTimer) { clearTimeout(this.spawnerDelayTimer); this.spawnerDelayTimer = null; }
  }

  // --- Sunucu ekranlari (dialog) -------------------------------------------
  submitDialog(index, values) {
    if (!this.bot) return { ok: false, error: this.logger.L('Sunucuya bağlı değilsiniz', 'You are not connected to the server') };
    return this.dialogs.submit(Number(index) || 0, values || {});
  }

  submitDialogCommand(template, values) {
    if (!this.bot) return { ok: false, error: this.logger.L('Sunucuya bağlı değilsiniz', 'You are not connected to the server') };
    if (this.dialogs.phase() !== 'play') {
      this.dialogs.pending = { template, values: values || {} };
      this.logger.warn(this.logger.L('Henüz oyun aşamasında değiliz; komut oyuna girilir girilmez gönderilecek.', 'Not in the play phase yet; the command will be sent as soon as we are in game.'));
      return { ok: true, mode: 'queued' };
    }
    return this.dialogs.sendCommand(template, values || {}, 'elle');
  }

  cancelDialog() { return this.dialogs.cancel(); }

  cancelDialogAuto() { return this.dialogs.cancelAuto(); }

  updateConfig(cfg) {
    this.cfg = cfg;
    if (this.dialogs) this.dialogs.autoCfg = cfg.dialogs || {};
    if (this.autoBuild?.reserved || this.autoBuild?.worker) {
      if (cfg.spawnerProtect?.enabled || cfg.macros?.farmer?.enabled || cfg.macros?.autoSell?.enabled)
        this.autoBuild.pause('feature_conflict');
      return; // No physics/macro reset from unrelated config saves during a build.
    }

    // Anti AFK: acikken secenek degistirilince ac/kapa yapmaya gerek kalmasin
    const a = cfg.antiAfk || {};
    if (this.antiAfk) {
      if (this.antiAfk.running) {
        if (a.enabled === false) { this.antiAfk.stop(); this.logger.info('Anti AFK disabled'); this.emit('status', this.state()); }
        else this.antiAfk.apply(a);
      } else if (a.enabled && this.bot && this.loggedIn) {
        this.antiAfk.start(this.bot, a);
        this.emit('status', this.state());
      }
    }
    // Auto spam: araliklar/mesajlar degisirse calisirken de gecerli olsun
    if (this.autoSpam && this.autoSpam.running && typeof this.autoSpam.apply === 'function') {
      this.autoSpam.apply(cfg.autoSpam || {});
    }
    // Spawner Protect: acikken secenek degisince ac/kapa yapmaya gerek kalmasin
    const sp = cfg.spawnerProtect || {};
    if (this.spawnerProtect) {
      if (this.spawnerProtect.running) {
        if (sp.enabled === false) { this.spawnerProtect.stop(); this.logger.info('Spawner Protect disabled'); this.emit('status', this.state()); }
        else this.spawnerProtect.apply(sp);
      } else if (sp.enabled && this.bot && this.loggedIn) {
        this.spawnerProtect.start(this.bot, this.cfg);
        this.emit('status', this.state());
      }
    }
    // Auto Farm: anahtar/adimlar degisince calisirken de gecerli olsun
    const mf = (cfg.macros && cfg.macros.farmer) || {};
    if (this.macroFarmer) {
      if (this.macroFarmer.running) {
        if (mf.enabled === false) this.stopMacro();
        else this.macroFarmer.updateOptions(mf);
      } else if (mf.enabled && this.bot && this.loggedIn) {
        this.startMacro(mf);
      }
    }
    // Spawner AFK: anahtar/adimlar/erim degisince calisirken de gecerli olsun
    const ms = (cfg.macros && cfg.macros.spawner) || {};
    if (this.spawnerMacro) {
      if (SPAWNER_AFK_LOCKED) {
        if (this.spawnerMacro.running) this.spawnerMacro.stop(true);
      } else
      if (this.spawnerMacro.running) {
        if (ms.enabled === false) this.stopMacroSpawner();
        else this.spawnerMacro.updateOptions(ms);
      } else if (ms.enabled && this.bot && this.loggedIn) {
        this.startMacroSpawner(ms);
      }
    }
    // Auto Sell: anahtar veya aralik degisince aninda uygula
    const as = (cfg.macros && cfg.macros.autoSell) || {};
    if (this.autoSell) {
      if (this.autoSell.running) {
        if (as.enabled === false) this.stopAutoSell();
        else this.autoSell.apply(as);
      } else if (as.enabled && this.bot && this.loggedIn) {
        this.startAutoSell(as);
      }
    }
    // Runtime fizik durumu yalnizca kullanicinin gercek Bot Physics ayarini
    // izler. Spawner Koruma configForAccount icinde fizigi artik zorlamaz.
    try {
      if (this.bot && this.bot.physicsEnabled !== undefined) {
        this.bot.physicsEnabled = !!(cfg.toggles && cfg.toggles.physics);
      }
    } catch (_) { /* yoksay */ }
  }
}

// --- Kick / disconnect metinleri -------------------------------------------
// Sunucular metni duz yazi, JSON veya NBT olarak yollayabilir; hepsi coz.
// "<> mesaj" bicimindeki bos ad parcasini temizler
function stripEmptyName(spans) {
  const out = (spans || []).map((s) => Object.assign({}, s));
  let seen = '';
  for (let i = 0; i < out.length; i++) {
    seen += out[i].t;
    const m = seen.match(/^<\s*>\s*/);
    if (!m) { if (seen.replace(/[<>\s]/g, '')) break; else continue; }
    let cut = m[0].length;
    for (let k = 0; k <= i; k++) {
      const take = Math.min(cut, out[k].t.length);
      out[k].t = out[k].t.slice(take);
      cut -= take;
      if (cut <= 0) break;
    }
    break;
  }
  return out.filter((s) => s.t);
}

function readReason(reason) {
  if (reason === null || reason === undefined) return 'bilinmiyor';
  let node = reason;
  if (typeof node === 'string') {
    const s = node.trim();
    if (s.startsWith('{') || s.startsWith('[') || s.startsWith('"')) {
      try { node = JSON.parse(s); } catch (_) { return s; }
    } else {
      return s;
    }
  }
  const text = textOf(node);
  if (text && text.trim()) return text.trim();
  try { return JSON.stringify(node); } catch (_) { return String(node); }
}

// Sik gorulen kick sebepleri icin aciklama (secili dile gore)
function explainKick(text) {
  const t = String(text).toLowerCase();
  if (t.includes('internal error')) {
    return LX(
      'Sunucunun kendi tarafında bir hata oluştu (istemciden gelen bir paketi işleyemedi). '
        + 'Sırayla deneyin: 1) BAĞLANTI > Kaynak paketi ayarını "Reddet" veya "Hiç cevap verme" yapın '
        + '(kayıtlarda son gönderilen paket resource_pack_receive ise sebep bu demektir). '
        + '2) Sürümü "Otomatik algıla" yapın ya da sunucunun sürümünü birebir seçin. '
        + '3) BAĞLANTI > "Sohbet imzalamayı kapat" açık olsun. '
        + '4) Sunucu ekranı (form) gönderdiyse "KOMUTLA GÖNDER" yöntemini kullanın.',
      'The error happened on the server side (it could not process a packet we sent). '
        + 'Try in order: 1) set CONNECT > Resource pack to "Decline" or "Never reply" '
        + '(if the last sent packet in the logs is resource_pack_receive, that is the reason). '
        + '2) Set the version to "Auto detect" or pick the exact server version. '
        + '3) Keep CONNECT > "Disable chat signing" on. '
        + '4) If the server sent a screen (form), use the "SEND AS COMMAND" method.');
  }
  if (/resource\s*pack|kaynak\s*paket/i.test(t)) {
    return LX(
      'Sunucu kaynak paketini kabul etmenizi şart koşuyor. BAĞLANTI > Kaynak paketi = '
        + '"Otomatik kabul et" (veya "Akıllı") olmalı. İstemci bunu kendiliğinden ayarlayıp tekrar dener.',
      'The server requires you to accept its resource pack. CONNECT > Resource pack should be '
        + '"Accept automatically" (or "Smart"). The client sets this by itself and retries.');
  }
  if (/unable to connect|genericreason|server_disconnect|lost connection to server/i.test(t)) {
    return LX(
      'Sunucu ağı sizi bir alt sunucuya (lobi/spawn) aktarmaya çalıştı ama o sunucu cevap vermedi. '
        + 'Bu sunucu tarafında bir sorundur. Kayıt/giriş işlemi büyük ihtimalle tamamlandı; '
        + 'birkaç saniye sonra tekrar bağlanıldığında artık GİRİŞ ekranı gelmeli. İstemci kendisi tekrar deneyecek.',
      'The server network tried to transfer you to a sub-server (lobby/spawn) but that server did not answer. '
        + 'This is a server-side problem. Your register/login most likely went through; '
        + 'after reconnecting in a few seconds you should get the LOGIN screen. The client retries by itself.');
  }
  if (t.includes('outdated client') || t.includes('outdated server')) {
    return LX('Sürüm uyuşmuyor. BAĞLANTI sayfasında doğru Minecraft sürümünü seçin.',
      'Version mismatch. Pick the correct Minecraft version on the CONNECT page.');
  }
  if (t.includes('not whitelisted')) return LX('Sunucu beyaz listeli. Hesabınızın eklenmesi gerekiyor.', 'The server is whitelisted. Your account has to be added.');
  if (t.includes('banned')) return LX('Hesap veya IP yasaklı görünüyor.', 'The account or IP appears to be banned.');
  if (t.includes('full')) return LX('Sunucu dolu.', 'The server is full.');
  if (t.includes('authenticate') || t.includes('premium') || t.includes('online-mode')) {
    return LX('Sunucu Microsoft (premium) hesap istiyor. HESAPLAR sayfasından Microsoft ile giriş yapın '
      + 've BAĞLANTI sayfasındaki "Offline / Cracked" anahtarını kapatın.',
      'The server requires a Microsoft (premium) account. Sign in with Microsoft on the ACCOUNTS page '
      + 'and turn off the "Offline / Cracked" switch on the CONNECT page.');
  }
  if (t.includes('timed out') || t.includes('timeout')) return LX('Bağlantı zaman aşımına uğradı (ağ/proxy sorunu olabilir).', 'The connection timed out (possibly a network/proxy problem).');
  if (t.includes('throttle') || t.includes('too fast')) return LX('Çok sık bağlandınız. Birkaç dakika bekleyip tekrar deneyin.', 'You connected too often. Wait a few minutes and try again.');
  return '';
}

// Bildirim (toast) icin kisa ipucu
function shortHint(text) {
  const t = String(text).toLowerCase();
  if (t.includes('internal error')) return LX('Ayrıntı ve çözüm önerileri KAYITLAR sayfasında.', 'Details and suggestions are on the LOGS page.');
  if (t.includes('outdated')) return LX('BAĞLANTI sayfasından doğru sürümü seçin.', 'Pick the correct version on the CONNECT page.');
  if (t.includes('authenticate') || t.includes('premium')) return LX('Microsoft hesabı gerekiyor.', 'A Microsoft account is required.');
  if (t.includes('banned')) return LX('Hesap/IP yasaklı.', 'Account/IP is banned.');
  return '';
}

module.exports = BotManager;
