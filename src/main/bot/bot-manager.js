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
const JoinMessages = require('./join-messages');
const { DialogHandler, textOf, plainText } = require('./dialogs');
const chatFmt = require('./chat-format');
const ResourcePack = require('./respack');
const { buildConnect } = require('./proxy');

class BotManager extends EventEmitter {
  constructor(logger, authCacheDir) {
    super();
    this.logger = logger;
    this.authCacheDir = authCacheDir;
    this.bot = null;
    this.cfg = null;
    this.account = null;
    this.proxy = null;

    this.status = 'OFFLINE';    // OFFLINE | CONNECTING | ONLINE
    this.lastError = '';
    this.spawnTimeout = null;
    this.loggedIn = false;
    this.spawned = false;
    this.joinFallback = null;
    this.ping = 0;
    this.connectedAt = null;
    this.reconnectAttempts = 0;
    this.manualDisconnect = false;
    this.reconnectTimer = null;

    this.antiAfk = new AntiAfk(logger);
    this.joinMessages = new JoinMessages(logger);
    this.autoSpam = new AutoSpam(logger, (active) => this.emit('spam-state', active));
    this.macroFarmer = new MacroFarmer(logger);
    this.macroFarmer.onState = (st) => this.emit('macro-state', st);
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
      this.connectGuard = setTimeout(() => {
        if (this.dialogOpen) return;
        if (this.status === 'CONNECTING' && !this.loggedIn) {
          const msg = this.logger.L(
            'Bağlantı kurulamadı (60 sn). Sunucu adresini, portu ve sürümü kontrol edin.',
            'Could not connect (60s). Please check the server address, port and version.');
          this.lastError = msg;
          this.logger.error(msg);
          this.emit('notice', { type: 'error', message: msg });
          try { if (this.bot) this.bot.end(); } catch (_) {}
          this.cleanup();
          this.status = 'OFFLINE';
          this.emit('status', this.state());
        }
      }, 60000);
    }
  }

  // -------------------------------------------------------------------------
  async connect(cfg, account, proxy) {
    if (this.bot) {
      this.logger.warn(this.logger.L('Zaten bağlı veya bağlanıyor. Önce bağlantıyı kesin.', 'Already connected or connecting. Disconnect first.'));
      return { ok: false, error: 'already_connected' };
    }
    this.cfg = cfg;
    this.account = account;
    this.proxy = proxy;
    this.manualDisconnect = false;
    this.lastError = '';
    this.loggedIn = false;
    this.spawned = false;
    this.packAttempt = 0;
    this.forcePackMode = null;
    this.needPackRetry = false;
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
    if (this.manualDisconnect) { this.setStatus('OFFLINE'); return { ok: false }; }

    return this.spawnBot();
  }

  spawnBot() {
    const c = this.cfg.connection;
    const t = this.cfg.toggles;
    const acc = this.account || { username: 'Player', type: 'offline' };

    const options = {
      host: c.host,
      port: Number(c.port) || 25565,
      username: acc.username,
      version: c.version && c.version !== 'auto' ? c.version : false,
      hideErrors: false,        // protokol hatalari loglara dussun
      physicsEnabled: !!t.physics,
      checkTimeoutInterval: 60 * 1000,
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

    if (t.proxy && this.proxy) {
      const connect = buildConnect(this.proxy, this.logger);
      if (connect) options.connect = connect;
      this.logger.info(`Proxy kullaniliyor: ${this.proxy.type}://${this.proxy.host}:${this.proxy.port}`);
    }

    this.logger.connect(`Connecting to ${options.host}:${options.port} (${c.version}) as ${acc.username}...`);
    this.logger.info(this.logger.L(
      `Ayarlar: kaynak paketi=${c.resourcePack || 'decline'}, sohbet imzası=${t.noChatSign !== false ? 'kapalı' : 'açık'}`,
      `Settings: resource pack=${c.resourcePack || 'decline'}, chat signing=${t.noChatSign !== false ? 'off' : 'on'}`));

    try {
      if (!mineflayer) mineflayer = require('mineflayer');
      this.bot = mineflayer.createBot(options);
    } catch (e) {
      const msg = /Cannot find module/.test(e.message)
        ? this.logger.L('Bağımlılıklar eksik. Klasörde "npm install" çalıştırın.', 'Dependencies are missing. Run "npm install" in the folder.')
        : this.logger.L('Bağlantı kurulamadı: ', 'Could not connect: ') + e.message;
      this.lastError = msg;
      this.logger.error(msg);
      this.emit('notice', { type: 'error', message: msg });
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
    this.lastError = message;
    this.logger.error(message);
    this.emit('notice', { type: 'error', message });
    this.setStatus('OFFLINE');
    return { ok: false, error: message };
  }

  // Sunucuyu yoklar: adres/port dogru mu, hangi surum, ping kac?
  async ping(host, port) {
    const mcp = require('minecraft-protocol');
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, error: 'Zaman asimi (5 sn). Adres/port yanlis olabilir.' }); } }, 5000);
      try {
        mcp.ping({ host, port: Number(port) || 25565 }, (err, res) => {
          if (done) return;
          done = true; clearTimeout(timer);
          if (err) return resolve({ ok: false, error: err.message });
          resolve({
            ok: true,
            version: res.version && res.version.name,
            protocol: res.version && res.version.protocol,
            players: res.players ? `${res.players.online}/${res.players.max}` : '?',
            latency: res.latency || 0
          });
        });
      } catch (e) {
        if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, error: e.message }); }
      }
    });
  }

  // Canli acilip kapanabilen ayarlar
  setSneak(on) { try { if (this.bot) this.bot.setControlState('sneak', !!on); } catch (_) {} }
  setPhysics(on) { try { if (this.bot && this.bot.physicsEnabled !== undefined) this.bot.physicsEnabled = !!on; } catch (_) {} }

  // -------------------------------------------------------------------------
  bindEvents() {
    const bot = this.bot;
    const t = this.cfg.toggles;
    this.traceWrites(bot);

    bot.once('login', () => {
      this.loggedIn = true;
      this.connectedAt = this.connectedAt || Date.now();
      this.reconnectAttempts = 0;
      this.transferRetries = 0;
      if (this.connectGuard) { clearTimeout(this.connectGuard); this.connectGuard = null; }
      this.setStatus('ONLINE');           // sohbet ve komutlar artik kullanilabilir
      this.lastError = '';
      this.logger.connect('Login successful');
      setTimeout(() => { try { this.dialogs.flushPending(); } catch (_) {} }, 1200);
      if ((this.cfg.connection.resourcePack || 'smart') === 'smart' && this.respack.requested) {
        this.logger.info(this.logger.L('Çalışan kaynak paketi yöntemi: ', 'Working resource pack method: ') + this.respack.mode);
      }
      this.emit('notice', { type: 'ok', message: this.logger.L('Sunucuya giriş yapıldı: ', 'Logged in to the server: ') + this.cfg.connection.host });

      this.pingTimer = setInterval(() => {
        const p = bot.player && bot.player.ping ? bot.player.ping : 0;
        if (p !== this.ping) { this.ping = p; this.emit('status', this.state()); }
      }, this.cfg.settings && this.cfg.settings.lowCpuMode ? 6000 : 3000);

      // spawn 8 sn icinde gelmezse (lobi/queue sunuculari) join komutlarini yine calistir
      this.joinFallback = setTimeout(() => {
        if (!this.spawned) {
          this.logger.info(this.logger.L('Spawn gelmedi, giriş sırası yine de çalıştırılıyor', 'No spawn packet, running the join order anyway'));
          this.runJoinChain(bot, 'login-fallback');
        }
      }, 8000);
    });

    // 45 sn icinde dunyaya girilmezse kullaniciya sebep bildir
    this.spawnTimeout = setTimeout(() => {
      if (this.dialogOpen) return;
      if (!this.loggedIn) {
        const stuckOnPack = this.trace.length && /resource_pack_receive/.test(this.trace[this.trace.length - 1]);
        const msg = stuckOnPack
          ? this.logger.L(
              'Sunucuya girilemedi (45 sn). Kaynak paketi aşamasında takıldık: BAĞLANTI sayfasında kaynak paketi ayarını "Reddet" yapıp tekrar deneyin.',
              'Could not join the server (45s). We got stuck at the resource pack step: on the CONNECT page set the resource pack option to "Decline" and try again.')
          : this.logger.L(
              'Sunucuya girilemedi (45 sn). Sürüm uyuşmuyor olabilir; BAĞLANTI sayfasında "Otomatik algıla" deneyin.',
              'Could not join the server (45s). The version may not match; try "Auto detect" on the CONNECT page.');
        this.lastError = msg;
        this.logger.warn(msg);
        this.emit('notice', { type: 'warn', message: msg });
      }
    }, 45000);

    bot.on('windowOpen', (win) => {
      const size = Number.isInteger(win && win.inventoryStart) ? win.inventoryStart : (win && win.slots ? win.slots.length : 54);
      this.emit('screen-open', { title: plainText(win && win.title), size });
    });
    bot.on('windowClose', () => this.emit('screen-close', {}));

    bot.once('spawn', () => {
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

    });

    // Sohbet: renkleri ve gonderen adini koruyarak arayuze yollanir.
    // ('messagestr' yerine 'message' dinlenir; ikisi de ayni yerde tetiklenir
    //  ama 'message' bileseni ve gonderenin UUID'sini de verir.)
    bot.on('message', (msg, position, senderUuid) => {
      let flat = '';
      let spans = [];
      try { flat = msg && typeof msg.toString === 'function' ? msg.toString() : String(msg == null ? '' : msg); } catch (_) { flat = ''; }
      try { spans = chatFmt.spansOf(msg, bot.registry && bot.registry.language); } catch (_) { spans = []; }
      if (!spans.length && flat) spans = [{ t: flat }];
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
    });

    bot.on('kicked', (reason) => {
      const text = readReason(reason);
      let long = explainKick(text);
      let short = shortHint(text);

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
      this.lastError = this.logger.L('Sunucu attı: ', 'Kicked by server: ') + text;
      this.logger.disconnect('Kicked: ' + text);
      try { this.logger.info(this.logger.L('Kick ham verisi: ', 'Raw kick data: ') + JSON.stringify(reason).slice(0, 900)); } catch (_) {}
      this.logger.info(this.logger.L('Son gönderilen paketler: ', 'Last sent packets: ') + (this.trace.length ? this.trace.join(' -> ') : this.logger.L('(yok)', '(none)')));
      this.logger.info(this.logger.L('Son gelen paketler: ', 'Last received packets: ') + (this.traceIn.length ? this.traceIn.join(' -> ') : this.logger.L('(yok)', '(none)')));
      if (long) this.logger.warn(this.logger.L('İpucu: ', 'Hint: ') + long);
      this.emit('chat', { type: 'error', message: 'Kicked: ' + text, time: this.logger.ts() });
      if (long) this.emit('chat', { type: 'system', message: this.logger.L('İpucu: ', 'Hint: ') + long, time: this.logger.ts() });
      this.emit('notice', { type: 'error', message: this.logger.L('Sunucu bağlantıyı kesti: ', 'The server closed the connection: ') + text + (short ? ' — ' + short : '') });
    });

    bot.on('error', (err) => {
      const map = {
        ENOTFOUND: this.logger.L('Sunucu adresi bulunamadı. Server IP yanlış olabilir.', 'Server address not found. The server IP may be wrong.'),
        ECONNREFUSED: this.logger.L('Sunucu bağlantıyı reddetti. Port yanlış olabilir veya sunucu kapalı.', 'The server refused the connection. The port may be wrong or the server is offline.'),
        ETIMEDOUT: this.logger.L('Bağlantı zaman aşımına uğradı.', 'The connection timed out.'),
        ECONNRESET: this.logger.L('Bağlantı sunucu tarafından sıfırlandı.', 'The connection was reset by the server.'),
        EAI_AGAIN: this.logger.L('DNS çözümlenemedi. İnternet bağlantınızı kontrol edin.', 'DNS lookup failed. Check your internet connection.')
      };
      const msg = map[err.code] || err.message;
      this.lastError = msg;
      this.logger.error(msg + (err.code ? ` (${err.code})` : ''));
      this.emit('chat', { type: 'error', message: msg, time: this.logger.ts() });
      this.emit('notice', { type: 'error', message: msg });
    });

    if (t.worldChangeMessages) {
      bot.on('respawn', () => {
        this.logger.info('World change detected');
        this.runJoinChain(bot, 'world-change');
      });
    }

    bot.on('end', (reason) => {
      this.logger.disconnect('Disconnected: ' + (reason || 'unknown') + (this.lastError ? ' | ' + this.lastError : ''));
      if (!this.lastError && reason && reason !== 'disconnect.quitting') {
        this.emit('notice', { type: 'warn', message: this.logger.L('Bağlantı kapandı: ', 'Connection closed: ') + reason });
      }
      if (!this.needPackRetry && /unable to connect|genericreason/i.test(this.lastError || '') && (this.transferRetries || 0) < 3) {
        this.transferRetries = (this.transferRetries || 0) + 1;
        this.needPackRetry = true;
        this.retryDelayMs = 6000;
      }
      this.cleanup();
      this.setStatus('OFFLINE');
      if (!this.maybeSmartRetry()) this.scheduleReconnect();
    });
  }

  // Sunucu bizi atarsa hangi paketin sebep oldugunu gorebilmek icin son gonderilenler tutulur
  traceWrites(bot) {
    this.trace = [];
    this.traceIn = [];
    const client = bot._client;
    if (!client || client.__traced) return;
    const skipIn = /^(position|entity|update_time|chunk|light|world|map_chunk|rel_entity|entity_|multi_block|block_change|player_info|update_health|teleport|keep_alive|ping|sound|particle|animation|collect|spawn_|held_item|set_slot|window_items|advancements|scoreboard|team|tab_complete|declare_commands|bundle_delimiter|set_ticking_state|step_tick|game_state_change|abilities|entity_velocity|entity_metadata|damage_event|hurt_animation|move_entity)/;
    this.protoErrors = 0;
    client.on('error', (err) => {
      if (this.protoErrors++ > 8) return;
      this.logger.warn(this.logger.L('Protokol hatası: ', 'Protocol error: ') + (err && err.message ? err.message : String(err)));
    });

    client.on('packet', (_d, meta) => {
      try {
        const n = meta && meta.name ? String(meta.name) : '';
        if (!n || skipIn.test(n)) return;
        this.traceIn.push(n);
        if (this.traceIn.length > 12) this.traceIn.shift();
        if (this.cfg.settings && this.cfg.settings.packetLog) this.logger.info('<- ' + n);
      } catch (_) {}
    });
    const skip = /^(position|look|position_look|keep_alive|pong|teleport_confirm|arm_animation|player_input|vehicle_move|steer|held_item_slot|abilities|client_command|window_confirmation|ping_request)$/;
    const dbg = !!(this.cfg.settings && this.cfg.settings.packetLog);
    const orig = client.write.bind(client);
    client.write = (name, params) => {
      try {
        const n = String(name);
        if (!skip.test(n)) {
          this.trace.push(n);
          if (this.trace.length > 8) this.trace.shift();
          if (dbg) this.logger.info('-> ' + n);
          if (n === 'login_acknowledged') this.afterLoginAck(client);
        }
      } catch (_) {}
      return orig(name, params);
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
    if (this.needPackRetry && !this.manualDisconnect) {
      this.needPackRetry = false;
      const wait = this.retryDelayMs || 2500;
      this.retryDelayMs = 0;
      this.logger.warn(this.logger.L('Yeniden bağlanılıyor (' + Math.round(wait / 1000) + ' sn)...', 'Reconnecting in ' + Math.round(wait / 1000) + ' s...'));
      this.reconnectTimer = setTimeout(() => {
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
        if (!this.bot || this.status === 'OFFLINE') return;
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
      if (this.loggedIn || this.manualDisconnect || this.dialogOpen) return;
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
    if (this.spawnTimeout) clearTimeout(this.spawnTimeout);
    if (this.configGuard) clearTimeout(this.configGuard);
    this.configGuard = null;
    this.ackDone = false;
    this.spawnTimeout = null;
    if (this.joinFallback) clearTimeout(this.joinFallback);
    this.joinFallback = null;
    this.loggedIn = false;
    this.spawned = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.antiAfk.stop();
    this.joinMessages.cancel();
    if (this.dialogs && this.dialogs.current) this.dialogs.cancel();
    if (this.respack) this.respack.clearTimers();
    this.dialogOpen = false;
    this.autoSpam.stop(true);
    this.macroFarmer.stop(true);
    this.stopMacroGuard();
    this.connectedAt = null;
    this.ping = 0;
    this.bot = null;
  }

  // -------------------------------------------------------------------------
  scheduleReconnect() {
    const ar = this.cfg && this.cfg.autoReconnect;
    if (this.manualDisconnect || !ar || !(ar.enabled || this.cfg.toggles.autoReconnect)) return;
    if (!ar.unlimited && this.reconnectAttempts >= (Number(ar.maxAttempts) || 5)) {
      this.logger.warn(this.logger.L('Otomatik yeniden bağlanma: maksimum deneme sayısına ulaşıldı', 'Auto reconnect: maximum attempts reached'));
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.max(1, Number(ar.delay) || 10);
    this.logger.reconnect(`Reconnecting in ${delay}s (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
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

  // --- Disaridan cagrilan aksiyonlar ---------------------------------------
  sendChat(message) {
    if (!this.bot || !this.loggedIn) return { ok: false, error: 'not_connected' };
    try {
      this.bot.chat(message);
      this.logger.chat(`[ME] ${message}`);
      const me = (this.bot && this.bot.username) || this.accountName || '';
      this.emit('chat', { type: 'self', message, from: me, spans: [{ t: message }], time: this.logger.ts() });
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

  // --- Makrolar (Auto Farm) ----------------------------------------------
  startMacro(cfg, why) {
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

  // GIRIS KOMUTLARI + (istenirse) Auto Farm ayni sirada calisir.
  // Sunucu restart atsa da, auto reconnect olsa da bu zincir bastan kurulur.
  runJoinChain(bot, why) {
    if (!bot) return;
    const t = this.cfg.toggles || {};
    const f = this.farmerCfg();
    const cmds = t.joinMessages ? (this.cfg.joinMessages.commands || []) : [];
    let extra = null;
    if (f.on && f.mode === 'join') {
      extra = {
        at: f.at,                       // 0 = en son
        delay: f.delay,
        label: this.logger.L('Auto Farm başlatılıyor', 'starting Auto Farm'),
        run: () => this.startMacro(this.cfg.macros.farmer, why || 'join')
      };
    }
    if (!cmds.length && !extra) return;
    const r = this.joinMessages.run(bot, cmds, { extra });
    if (r.count) {
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
  }

  // Makro acikken KAPATILANA KADAR calissin: her 20 sn'de bir denetlenir
  startMacroGuard() {
    this.stopMacroGuard();
    this.macroGuard = setInterval(() => {
      const f = this.farmerCfg();
      if (!f.on) return;
      if (!this.bot || !this.loggedIn) return;
      if (this.macroFarmer.running) return;
      if (this.macroFarmer.busy) return;
      this.logger.info(this.logger.L(
        'Auto Farm açık ama çalışmıyordu, yeniden başlatıldı',
        'Auto Farm was enabled but not running, restarted'));
      this.startMacro(this.cfg.macros.farmer, 'guard');
    }, 20000);
  }

  stopMacroGuard() {
    if (this.macroGuard) { clearInterval(this.macroGuard); this.macroGuard = null; }
    if (this.macroDelayTimer) { clearTimeout(this.macroDelayTimer); this.macroDelayTimer = null; }
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
