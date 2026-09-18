'use strict';
// ---------------------------------------------------------------------------
// main.js - Electron ana surec: pencere, tray, IPC kopruleri, metrikler
// KARABARAKORSA CLIENT
// ---------------------------------------------------------------------------
const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, shell, nativeImage, Notification, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const { Store, FEATURE_KEYS, FEATURE_SECTION } = require('./store');
const logger = require('./logger');
const BotManager = require('./bot/bot-manager');
const versions = require('./versions');
const updater = require('./updater');

let win = null;
let tray = null;
let store = null;
let bot = null;
let metricsTimer = null;
let quitting = false;

const APP_NAME = 'Karabarakorsa AFK Client';

// Windows bildirimlerinde "electron.app..." yazmamasi icin uygulama kimligi
app.setName(APP_NAME);
try { app.setAppUserModelId('com.karabarakorsa.afkclient'); } catch (_) {}
// Bellek: V8 yigini sinirli tutulur, GC daha sik calisir (akicilik bozulmaz)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256 --expose-gc');
app.commandLine.appendSwitch('disable-features', 'MediaSessionService,HardwareMediaKeyHandling');

// Dil: arayuzde secili dile gore ana surec metinleri
const lang = () => ((store && store.get().settings.language) || 'en');
const L = (tr, en) => (lang() === 'tr' ? tr : en);

// Uygulama simgeleri (tepsi + bildirim) --------------------------------------
const ASSET = (...p) => path.join(__dirname, '..', '..', p.join(path.sep));
let trayImg = null;
let notifyImg = null;
function trayImage() {
  if (trayImg) return trayImg;
  const res = process.resourcesPath || '';
  const tries = [
    ASSET('build', 'tray.png'), ASSET('build', 'tray16.png'), ASSET('build', 'icon.ico'),
    res ? path.join(res, 'tray.png') : '', res ? path.join(res, 'tray16.png') : '',
    path.join(__dirname, '..', 'renderer', 'assets', 'logo.png')
  ].filter(Boolean);
  for (const f of tries) {
    try {
      const im = nativeImage.createFromPath(f);
      if (im && !im.isEmpty()) { trayImg = im; return trayImg; }
    } catch (_) {}
  }
  trayImg = nativeImage.createEmpty();
  return trayImg;
}
function iconPath() {
  const res = process.resourcesPath || '';
  const tries = [ASSET('build', 'icon.ico'), res ? path.join(res, 'icon.ico') : '',
    path.join(__dirname, '..', 'renderer', 'assets', 'logo.png')].filter(Boolean);
  for (const f of tries) { try { if (fs.existsSync(f)) return f; } catch (_) {} }
  return undefined;
}
function notifyImage() {
  if (notifyImg) return notifyImg;
  const res = process.resourcesPath || '';
  const tries = [
    path.join(__dirname, '..', 'renderer', 'assets', 'logo.png'),
    ASSET('build', 'icon.ico'), res ? path.join(res, 'tray.png') : ''
  ].filter(Boolean);
  for (const f of tries) {
    try {
      const im = nativeImage.createFromPath(f);
      if (im && !im.isEmpty()) { notifyImg = im; return notifyImg; }
    } catch (_) {}
  }
  notifyImg = nativeImage.createEmpty();
  return notifyImg;
}
// Bildirim metnini kisalt: ilk cumle, en fazla 110 karakter
function shortNotice(text) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  const stop = t.search(/[.!?](\s|$)/);
  if (stop > 24) t = t.slice(0, stop + 1);
  if (t.length > 110) t = t.slice(0, 107).trimEnd() + '...';
  return t;
}

// Tek noktadan bildirim: basligi hep uygulama adi, yaninda logo
function notify(body, opts) {
  const st = (store && store.get().settings) || {};
  if (!Notification.isSupported()) return;
  if (!(opts && opts.force) && !st.notifications) return;
  try {
    new Notification({
      title: (opts && opts.title) || APP_NAME,
      body: String(body),
      icon: notifyImage(),
      silent: false
    }).show();
  } catch (_) {}
}

// Tek instance kilidi: ikinci kopya hicbir sey yapmadan kapanir
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    frame: false,         // ozel baslik cubugu (menu yok)
    backgroundColor: '#0d1016',
    title: APP_NAME,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      spellcheck: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => send('win-state', true));
  win.on('unmaximize', () => send('win-state', false));

  // Arka plandayken arayuz beslenmez; geri acilinca gecmis yeniden cizilir
  win.on('hide', () => { stopMetrics(); });
  win.on('show', () => {
    startMetrics();
    send('refresh', { at: Date.now() });
  });

  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      hideToBackground();
    }
  });

  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });

  // F12 ile devtools (hata ayiklama icin)
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.webContents.on('render-process-gone', (_e, d) => logger.error('Renderer crashed: ' + d.reason));
  win.webContents.on('preload-error', (_e, p, err) => logger.error('Preload error (' + p + '): ' + err.message));
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) logger.error('Renderer: ' + message);
  });

  // Self-test: hangi asamada takildigini kesin olarak raporlar
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const st = await win.webContents.executeJavaScript(
          'JSON.stringify({ stage: window.__stage || null, errors: window.__errors || [] })');
        const data = JSON.parse(st);
        writeDiag('SELF-TEST ' + st);
        const s = data.stage;
        if (!s || !s.rendererEnd) {
          const detail =
            L('Aşamalar: ', 'Stages: ') + JSON.stringify(s) + '\n\n' +
            L('Hatalar:\n', 'Errors:\n') + (data.errors.length ? data.errors.join('\n') : L('(yok)', '(none)')) + '\n\n' +
            L('Bu mesajın ekran görüntüsünü alın. Ayrıntılı kayıt:\n', 'Please take a screenshot of this message. Detailed log:\n') + diagPath();
          dialog.showErrorBox(APP_NAME + L(' - Arayüz yüklenemedi', ' - Interface could not load'), detail);
        }
      } catch (e) {
        logger.error('Self-test failed: ' + e.message);
        writeDiag('SELF-TEST FAILED ' + e.message);
      }
    }, 2000);
  });
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: APP_NAME, enabled: false },
    { type: 'separator' },
    { label: L('Göster', 'Show'), click: () => { win.show(); win.focus(); } },
    { label: L('Tüm bağlantıları kes', 'Disconnect all'), click: () => disconnectAll() },
    { type: 'separator' },
    { label: L('Çıkış', 'Quit'), click: () => { quitting = true; app.quit(); } }
  ]);
}
function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(trayMenu());
  tray.on('click', () => { win.show(); win.focus(); });
  tray.on('double-click', () => { win.show(); win.focus(); });
}
function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  try { tray.setImage(trayImage()); tray.setToolTip(APP_NAME); tray.setContextMenu(trayMenu()); } catch (_) {}
}

function diagPath() { return path.join(app.getPath('userData'), 'ui-error.log'); }
function writeDiag(text) {
  try { fs.appendFileSync(diagPath(), '[' + new Date().toISOString() + '] ' + text + '\r\n'); } catch (_) {}
}

// Pencere gizliyken akan veriler (log/sohbet/metrik) arayuze gonderilmez:
// gizli pencerede DOM buyumez, RAM ve CPU harcanmaz. Geri acilinca 'refresh'
// olayi ile arayuz gecmisi main'deki tampondan yeniden cizer.
const LIVE_ONLY = ['log', 'chat', 'metrics'];
function send(channel, payload) {
  if (!win || win.isDestroyed()) return;
  if (LIVE_ONLY.includes(channel) && !win.isVisible()) return;
  win.webContents.send(channel, payload);
}

// ---------------------------------------------------------------------------
// COKLU HESAP OTURUMLARI
// Her hesap kendi BotManager'i, kendi log kanali (slot) ve kendi sohbet
// gecmisiyle calisir. Arayuzdeki numarali sekmeler bu slotlari secer.
// ---------------------------------------------------------------------------
const MAX_SESSIONS = 0;            // 0 = sinir yok
const sessions = [];
let activeSlot = 0;
let botAuthDir = '';

function sessionBySlot(slot) { return sessions.find((s) => s.slot === Number(slot)) || null; }
function sessionByAccount(id) { return sessions.find((s) => s.accountId === id) || null; }
function activeSession() { return sessionBySlot(activeSlot) || sessions[0] || null; }

function botBySlot(slot) {
  const s = slot ? sessionBySlot(slot) : activeSession();
  return s ? s.bot : null;
}

function slotList() {
  return sessions.map((s) => {
    const st = s.bot.state();
    return {
      slot: s.slot,
      accountId: s.accountId,
      name: s.name || '-',
      status: st.status,
      ping: st.ping || 0,
      spam: !!st.spam,
      antiAfk: !!st.antiAfk,
      macro: !!st.macro
    };
  });
}

let lastSlotsSignature = '';
function sendSlots(force) {
  const payload = { list: slotList(), active: activeSlot };
  const signature = JSON.stringify(payload);
  if (!force && signature === lastSlotsSignature) return;
  lastSlotsSignature = signature;
  send('slots', payload);
}

function wireSession(s) {
  const b = s.bot;
  b.on('status', (st) => {
    send('status', Object.assign({ slot: s.slot }, st));
    sendSlots();
    if (st.status === 'OFFLINE') scheduleSessionCleanup(s);
    else if (s.cleanupTimer) { clearTimeout(s.cleanupTimer); s.cleanupTimer = null; }
  });
  b.on('chat', (m) => {
    const e = Object.assign({ slot: s.slot }, m);
    s.chat.push(e);
    if (s.chat.length > 400) s.chat.shift();
    send('chat', e);
  });
  b.on('spam-state', (a) => { send('spam-state', { slot: s.slot, active: a }); sendSlots(); });
  b.on('macro-state', (st) => { send('macro-state', Object.assign({ slot: s.slot }, st)); sendSlots(); });
  b.on('screen-open', (d) => send('screen-open', Object.assign({ slot: s.slot }, d || {})));
  b.on('screen-close', () => send('screen-close', { slot: s.slot }));
  b.on('dialog', (d) => {
    if (!store.get().dialogs || store.get().dialogs.show !== false) send('dialog', Object.assign({ slot: s.slot }, d));
  });
  b.on('dialog-close', () => send('dialog-close', { slot: s.slot }));
  b.on('config-patch', (partial) => {            // bot kendi ayarini duzeltti (or. kaynak paketi)
    store.patch(partial);
    sessions.forEach((x) => x.bot.updateConfig(runtimeConfig()));
    send('config-changed', safeConfig());
  });
  b.on('notice', (n) => {
    send('notice', Object.assign({ slot: s.slot }, n));
    // Windows bildirimi sadece gercekten onemli olaylar icin: hata ve kick.
    if (n.type !== 'error') return;
    const tag = sessions.length > 1 ? '#' + s.slot + ' ' : '';
    notify(tag + shortNotice(n.message));
  });
}

// Baglanti kesilince oturum tamamen silinir: numarasi, sohbeti ve sekmesi kalkar
function removeSession(slot) {
  const i = sessions.findIndex((x) => x.slot === Number(slot));
  if (i < 0) return { ok: false, error: 'no_session' };
  const s = sessions[i];
  if (s.cleanupTimer) { clearTimeout(s.cleanupTimer); s.cleanupTimer = null; }
  try { s.bot.disconnect(); } catch (_) {}
  try { s.bot.removeAllListeners(); } catch (_) {}
  s.chat.length = 0;
  sessions.splice(i, 1);
  logger.dropSlot(s.slot);                     // eski log satirlarindaki #numara silinir
  logger.info(`Session #${s.slot} closed (${s.name})`);
  if (activeSlot === s.slot) activeSlot = sessions.length ? sessions[0].slot : 0;
  sendSlots();
  const b = botBySlot(activeSlot);
  send('status', b ? Object.assign({ slot: activeSlot }, b.state()) : offlineState());
  return { ok: true, removed: s.slot };
}

// Bot kendi kendine cevrimdisi kaldiysa (ve yeniden baglanma beklemiyorsa) oturumu kapat
function scheduleSessionCleanup(s) {
  if (s.cleanupTimer) clearTimeout(s.cleanupTimer);
  s.cleanupTimer = setTimeout(() => {
    s.cleanupTimer = null;
    if (!sessions.includes(s)) return;
    const b = s.bot;
    if (!b || b.status !== 'OFFLINE' || b.reconnectTimer) return;
    removeSession(s.slot);
  }, 2500);
}

function createSession(account) {
  const found = sessionByAccount(account.id);
  if (found) { found.name = account.username; return found; }
  if (MAX_SESSIONS && sessions.length >= MAX_SESSIONS) return null;
  const slot = sessions.length ? Math.max.apply(null, sessions.map((s) => s.slot)) + 1 : 1;
  const s = {
    slot,
    accountId: account.id,
    name: account.username,
    bot: new BotManager(logger.channel(slot), botAuthDir),
    chat: []
  };
  wireSession(s);
  sessions.push(s);
  if (!activeSlot) activeSlot = slot;
  logger.info(`Session #${slot} created for ${account.username}`, slot);
  return s;
}

// Pencere kapatilinca uygulama tepside calismaya devam eder ve
// bildirim ayari kapali olsa bile bir kez bildirim gosterilir.
let hideNoticeAt = 0;
function hideToBackground() {
  if (!win || win.isDestroyed()) return;
  const wasVisible = win.isVisible();
  win.hide();
  logger.info('Window closed, still running in the background');
  // Ayni kapatma icin tek bildirim (pencere zaten gizliyse tekrar gosterilmez)
  const now = Date.now();
  if (!wasVisible || now - hideNoticeAt < 3000) return;
  hideNoticeAt = now;
  notify(L('Arka planda çalışmaya devam ediyor', 'Still running in the background'), { force: true });
}

function offlineState() {
  return { slot: 0, status: 'OFFLINE', server: '', account: '', ping: 0, uptime: 0, spam: false, antiAfk: false };
}

function disconnectAll() {
  sessions.slice().forEach((s) => { try { removeSession(s.slot); } catch (_) {} });
}

// --- CPU / RAM metrikleri ---------------------------------------------------
// RAM: Windows Gorev Yoneticisi'ndeki "Bellek" kolonu ile ayni sey olsun diye
// "private working set" (privateBytes) toplanir. workingSetSize toplami
// paylasilan sayfalari (DLL, font, GPU dokusu) her surecte tekrar saydigi icin
// gercek kullanimin 2-3 katini gosteriyordu.
let cpuLast = 0;
function stopMetrics() { if (metricsTimer) { clearInterval(metricsTimer); metricsTimer = null; } }
function readMetrics() {
  let priv = 0;
  let ws = 0;
  let cpu = 0;
  try {
    const list = app.getAppMetrics() || [];
    for (const m of list) {
      if (m.memory) {
        priv += (m.memory.privateBytes || 0);
        ws += (m.memory.workingSetSize || 0);
      }
      if (m.cpu) cpu += (m.cpu.percentCPUUsage || 0);
    }
  } catch (_) {}
  // privateBytes Windows'ta gelir; gelmezse calisma kumesini kullaniriz
  let ram = priv || ws;
  if (!ram) { try { ram = Math.round(process.memoryUsage().rss / 1024); } catch (_) {} }
  const cores = Math.max(1, os.cpus().length);
  cpu = Math.min(100, cpu / cores);
  // kucuk yumusatma: deger zipzip degil, akici gorunsun
  cpuLast = cpuLast ? cpuLast * 0.45 + cpu * 0.55 : cpu;
  return {
    cpu: Math.round(cpuLast * 10) / 10,
    ram: Math.round(ram / 1024),
    totalRam: Math.round(os.totalmem() / 1024 / 1024)
  };
}
function startMetrics() {
  const tick = () => { try { send('metrics', readMetrics()); } catch (_) {} };
  const period = store.get().settings.lowCpuMode ? 4000 : 1500;
  if (metricsTimer) clearInterval(metricsTimer);
  metricsTimer = setInterval(tick, period);
  tick();
}

// --- Canli durum akisi -----------------------------------------------------
// Bot durumu sadece degistiginde yayinlanirsa ping/sure arayuzde donuk kalir.
// Bu yuzden aktif oturumun durumu saniyede bir tazelenir.
let statePump = null;
function startStatePump() {
  if (statePump) clearInterval(statePump);
  statePump = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    if (!sessions.length) return;
    const b = botBySlot(activeSlot) || (sessions[0] && sessions[0].bot);
    if (b) win.webContents.send('status', Object.assign({ slot: activeSlot }, b.state()));
  }, 1000);
}

// --- Bilgisayar acilisinda otomatik baglanma --------------------------------
// "Baslangicta acilsin" acikken secilen hesaplar uygulama acilir acilmaz
// baglanir; otomatik mesaj / anti afk / giris komutlari da kendi ayarlariyla
// birlikte devreye girer.
function autoConnectStartupAccounts() {
  const st = store.get().settings || {};
  if (!st.startWithWindows) return;
  const ids = Array.isArray(st.startupAccounts) ? st.startupAccounts : [];
  if (!ids.length) return;
  let i = 0;
  const next = () => {
    const id = ids[i++];
    if (!id) return;
    const cfg = runtimeConfig();
    if (cfg.accounts.list.some((a) => a.id === id)) {
      connectAccount(id).catch(() => {});
    }
    if (i < ids.length) setTimeout(next, 4000);
  };
  setTimeout(next, 3000);
}

// --- Windows ile baslat -----------------------------------------------------
function applyAutoLaunch(enabled) {
  if (process.platform !== 'win32') return;
  app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath, args: [] });
}

// Uygulama adi degistigi icin ayar klasoru de degisti: eski klasordeki
// ayarlar ve Microsoft oturumlari bir kez yeni klasore tasinir.
function migrateUserData() {
  try {
    const cur = app.getPath('userData');
    if (!fs.existsSync(cur)) fs.mkdirSync(cur, { recursive: true });
    if (fs.existsSync(path.join(cur, 'config.json'))) return;
    const parent = path.dirname(cur);
    const olds = ['KARABARAKORSA CLIENT', 'Karabarakorsa Client', 'karabarakorsa-client'];
    for (const name of olds) {
      const dir = path.join(parent, name);
      if (dir === cur || !fs.existsSync(path.join(dir, 'config.json'))) continue;
      fs.copyFileSync(path.join(dir, 'config.json'), path.join(cur, 'config.json'));
      const ac = path.join(dir, 'auth-cache');
      if (fs.existsSync(ac)) { try { fs.cpSync(ac, path.join(cur, 'auth-cache'), { recursive: true }); } catch (_) {} }
      writeDiag('Settings migrated from ' + dir);
      return;
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  migrateUserData();
  store = new Store();
  logger.setLang(store.get().settings.language);
  const authDir = path.join(app.getPath('userData'), 'auth-cache');
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  botAuthDir = authDir;
  logger.on('log', (entry) => send('log', entry));

  Menu.setApplicationMenu(null);   // ust menu cubugu gizli

  createWindow();
  createTray();
  startMetrics();
  startStatePump();
  applyAutoLaunch(store.get().settings.startWithWindows);
  writeDiag(`${APP_NAME} ${app.getVersion()} started`);   // KAYITLAR acilista bos kalsin
  autoConnectStartupAccounts();
  startUpdateWatch();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

/* ----------------------------- GUNCELLEME ---------------------------------
 * Her acilista sabit GitHub Releases adresi kontrol edilir. Yeni surum varsa
 * sag ustte GUNCELLE gorunur; tek tikla indirir, sessiz kurar ve yeniden acar.
 * -------------------------------------------------------------------------- */
const UPDATE_URL = 'https://api.github.com/repos/egemastertt/karabarakorsa-client-updates/releases/latest';
let updateInfo = { ok: false, update: false };
let updateTimer = null;
let updateBusy = false;
let updateInstalling = false;

async function runUpdateCheck() {
  if (updateBusy || updateInstalling) return updateInfo;
  updateBusy = true;
  try {
    updateInfo = await updater.check({ url: UPDATE_URL, current: app.getVersion() });
    if (updateInfo.ok && updateInfo.update) logger.info(`Update available: v${updateInfo.version}`);
    send('update-state', updateInfo);
  } catch (e) {
    updateInfo = { ok: false, error: (e && e.message) || 'failed' };
    send('update-state', updateInfo);
  } finally { updateBusy = false; }
  return updateInfo;
}

function startUpdateWatch() {
  if (updateTimer) clearInterval(updateTimer);
  setTimeout(() => runUpdateCheck(), 1200);
  updateTimer = setInterval(() => runUpdateCheck(), 60 * 60 * 1000);
}

async function installLatestUpdate() {
  if (updateInstalling) return { ok: false, error: 'busy' };
  if (!updateInfo.ok || !updateInfo.update || !updateInfo.url) await runUpdateCheck();
  if (!updateInfo.ok || !updateInfo.update || !updateInfo.url) return { ok: false, error: 'no_file' };
  updateInstalling = true;
  try {
    const dir = path.join(app.getPath('temp'), 'karabarakorsa-update');
    const r = await updater.download({
      url: updateInfo.url, dir,
      onProgress: (p) => send('update-progress', p)
    });
    logger.info('Update downloaded: ' + r.path);
    const child = spawn(r.path, ['/S', '--updated', '--force-run'], {
      detached: true, stdio: 'ignore', windowsHide: true
    });
    child.unref();
    setTimeout(() => app.quit(), 350);
    return { ok: true, restarting: true };
  } catch (e) {
    updateInstalling = false;
    const msg = (e && e.message) || 'failed';
    logger.error('Automatic update failed: ' + msg);
    send('update-error', { error: msg });
    return { ok: false, error: msg };
  }
}

ipcMain.handle('update:state', () => updateInfo);
ipcMain.handle('update:install', () => installLatestUpdate());

app.on('before-quit', () => { quitting = true; disconnectAll(); store.saveNow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------------------------- IPC -------------------------------------------
// Arayuze giden kopya: sifreler gizlenir, sadece "kayitli mi" bilgisi gider
function safeConfig() {
  const cfg = store.get();
  const copy = JSON.parse(JSON.stringify(cfg));
  copy.dialogs = copy.dialogs || {};
  copy.dialogs.hasPassword = !!(cfg.dialogs && cfg.dialogs.password);
  copy.dialogs.password = '';
  return copy;
}

// Bota giden kopya: sifreler cozulur
function runtimeConfig() {
  const cfg = store.get();
  const d = cfg.dialogs || {};
  return { ...cfg, dialogs: { ...d, password: store.decrypt(d.password) } };
}

// ---------------------------------------------------------------------------
// HESAP BAZLI AYARLAR
// BAGLANTI ve MAKROLAR sayfasindaki her anahtar icin "hangi hesaplarda acik"
// listesi tutulur (featureAccounts). Bir hesap baglanirken o hesaba ait kopya
// config uretilir: listede olmayan ayar o hesapta kapali kalir.
// ---------------------------------------------------------------------------
function featList(cfg, key) {
  const fa = (cfg && cfg.featureAccounts) || {};
  return Array.isArray(fa[key]) ? fa[key] : [];
}
// Ayar acik mi? (hesap secimi korunur, ayri bir bayrak ayari kapatir)
function featEnabled(cfg, key) {
  const fe = (cfg && cfg.featureEnabled) || {};
  return fe[key] !== false && featList(cfg, key).length > 0;
}
function featOn(cfg, key, accountId) {
  if (!accountId || !featEnabled(cfg, key)) return false;
  return featList(cfg, key).indexOf(accountId) !== -1;
}
// toggles[key] = "en az bir hesapta acik mi" ozeti (arayuz ve eski kod icin)
function syncToggleSummary() {
  const cfg = store.get();
  const t = {};
  for (const k of FEATURE_KEYS) {
    const on = featEnabled(cfg, k);
    if (FEATURE_SECTION[k]) continue;
    t[k] = on;
  }
  cfg.toggles = Object.assign({}, cfg.toggles, t);
  if (cfg.macros && cfg.macros.farmer) cfg.macros.farmer.enabled = featEnabled(cfg, 'macroFarmer');
  if (cfg.autoSpam) cfg.autoSpam.enabled = featEnabled(cfg, 'autoSpam');
  if (cfg.antiAfk) cfg.antiAfk.enabled = !!t.antiAfk;
  if (cfg.autoReconnect) cfg.autoReconnect.enabled = !!t.autoReconnect;
  store.saveDebounced();
}
// Hesaba ozel otomatik mesaj ayari (yoksa ortak ayar)
function spamCfgFor(accountId, base) {
  const cfg = base || runtimeConfig();
  const s = cfg.autoSpam || {};
  const own = (s.perAccount && accountId && s.perAccount[accountId]) || null;
  const out = Object.assign({}, s, own || {});
  delete out.perAccount;
  out.enabled = featOn(cfg, 'autoSpam', accountId);
  if (!Array.isArray(out.messages)) out.messages = [];
  return out;
}

// Tek bir hesap icin gercek config
function configForAccount(accountId) {
  const base = runtimeConfig();
  const c = { ...base };
  c.toggles = { ...(base.toggles || {}) };
  for (const k of FEATURE_KEYS) {
    if (FEATURE_SECTION[k]) continue;
    c.toggles[k] = featOn(base, k, accountId);
  }
  c.antiAfk = { ...(base.antiAfk || {}), enabled: c.toggles.antiAfk };
  c.autoReconnect = { ...(base.autoReconnect || {}), enabled: c.toggles.autoReconnect };
  const farmer = (base.macros && base.macros.farmer) || {};
  c.macros = { ...(base.macros || {}), farmer: { ...farmer, enabled: featOn(base, 'macroFarmer', accountId) } };
  c.autoSpam = spamCfgFor(accountId, base);
  return c;
}
function pushConfigToSessions() {
  sessions.forEach((x) => {
    try { x.bot.updateConfig(configForAccount(x.accountId)); } catch (_) {}
  });
}

ipcMain.handle('config:get', () => safeConfig());

ipcMain.handle('config:patch', (_e, partial) => {
  if (partial && partial.settings && partial.settings.language) logger.setLang(partial.settings.language);
  if (partial && partial.dialogs && (typeof partial.dialogs.password === 'string' || partial.dialogs.clearPassword)) {
    const d = { ...partial.dialogs };
    if (d.clearPassword) { d.password = ''; delete d.clearPassword; }
    else if (d.password) d.password = store.encrypt(d.password);
    else delete d.password;                 // bos birakildiysa kayitli sifre korunur
    partial = { ...partial, dialogs: d };
  }
  store.patch(partial);
  if (partial && (partial.featureAccounts || partial.featureEnabled)) syncToggleSummary();
  const data = safeConfig();
  pushConfigToSessions();
  if (partial.settings && partial.settings.startWithWindows !== undefined) {
    applyAutoLaunch(partial.settings.startWithWindows);
  }
  if (partial.settings && partial.settings.lowCpuMode !== undefined) startMetrics();
  return data;
});

// --- Baglanti ---------------------------------------------------------------
async function connectAccount(accountId) {
  const cfg = runtimeConfig();
  const account = cfg.accounts.list.find((a) => a.id === accountId)
    || cfg.accounts.list.find((a) => a.id === cfg.accounts.selected)
    || cfg.accounts.list[0] || null;
  if (!account) {
    logger.error(L('Hesap seçilmedi. HESAPLAR sayfasından hesap ekleyin.', 'No account selected. Add one on the ACCOUNTS page.'));
    return { ok: false, error: 'no_account' };
  }
  const s = createSession(account);
  if (!s) {
    logger.error(L('Yeni oturum oluşturulamadı.', 'Could not create a new session.'));
    return { ok: false, error: 'too_many_sessions' };
  }
  activeSlot = s.slot;                       // arayuz yeni oturuma gecsin
  let proxy = cfg.proxies.list.find((p) => p.id === cfg.proxies.selected) || null;
  if (proxy) proxy = { ...proxy, password: store.decrypt(proxy.password) };

  // Premium (Microsoft) hesaplarda oyun oturumu kayitli jetondan uretilir:
  // kullanici ikinci kez giris yapmak zorunda kalmaz.
  const acc = Object.assign({}, account);
  const accCfg = configForAccount(account.id);
  if (acc.type === 'microsoft' && !accCfg.toggles.offline) {
    try { acc.mcSession = await msSessionFor(acc); }
    catch (e) {
      logger.error(L('Microsoft oturumu yenilenemedi: ', 'Could not refresh the Microsoft session: ') + e.message);
      removeSession(s.slot);
      return { ok: false, error: e.message };
    }
  }
  const r = await s.bot.connect(accCfg, acc, proxy);
  sendSlots();
  return Object.assign({ slot: s.slot }, r || {});
}

ipcMain.handle('bot:connect', (_e, accountId) => connectAccount(accountId));

ipcMain.handle('bot:disconnect', (_e, slot) => {
  const s = slot ? sessionBySlot(slot) : activeSession();
  if (!s) return { ok: false, error: 'no_session' };
  return removeSession(s.slot);
});

// Arayuzde secili oturum (numarali sekmeler)
ipcMain.handle('bot:active', (_e, slot) => {
  if (sessionBySlot(slot)) activeSlot = Number(slot);
  sendSlots();
  const b = botBySlot(activeSlot);
  return b ? b.state() : offlineState();
});
ipcMain.handle('bot:slots', () => ({ list: slotList(), active: activeSlot }));
ipcMain.handle('chat:history', (_e, slot) => {
  const s = slot ? sessionBySlot(slot) : activeSession();
  return s ? s.chat : [];
});
ipcMain.handle('bot:ping', async (_e, payload) => {
  const c = store.get().connection;
  const anyBot = botBySlot(0) || new BotManager(logger.channel(0), botAuthDir);
  const res = await anyBot.ping((payload && payload.host) || c.host, (payload && payload.port) || c.port);
  if (res && res.ok && res.version) {
    // "1.21.11" gibi bir surum adi cikarilmaya calisilir
    const m = String(res.version).match(/\d+\.\d+(?:\.\d+)?/);
    const v = m ? m[0] : '';
    res.clientSupports = v ? versions.isSupported(v) : true;
    res.suggest = v && !res.clientSupports ? versions.newestSupported() : '';
  }
  return res;
});
ipcMain.handle('bot:sneak', (_e, on) => { const b = botBySlot(0); if (b) b.setSneak(on); return { ok: !!b }; });
ipcMain.handle('bot:physics', (_e, on) => { const b = botBySlot(0); if (b) b.setPhysics(on); return { ok: !!b }; });
ipcMain.handle('versions:list', () => versions.list());
ipcMain.handle('app:info', () => ({
  name: APP_NAME,
  version: app.getVersion(),
  author: 'Poltaaa',
  configPath: path.join(app.getPath('userData'), 'config.json'),
  logPath: path.join(app.getPath('userData'), 'ui-error.log')
}));
ipcMain.handle('config:reset', () => {
  const fresh = require('./store').DEFAULTS;
  store.data = JSON.parse(JSON.stringify(fresh));
  store.saveNow();
  pushConfigToSessions();
  logger.warn('Settings reset to defaults');
  return safeConfig();
});
ipcMain.handle('config:open-folder', () => shell.openPath(app.getPath('userData')));
ipcMain.handle('bot:state', (_e, slot) => {
  const b = botBySlot(slot);
  return b ? Object.assign({ slot: (sessionBySlot(slot) || activeSession() || {}).slot || 0 }, b.state()) : offlineState();
});
ipcMain.handle('bot:chat', (_e, payload) => {
  const message = typeof payload === 'string' ? payload : (payload && payload.message);
  const b = botBySlot(payload && payload.slot);
  return b ? b.sendChat(message) : { ok: false, error: 'no_session' };
});
ipcMain.handle('bot:spam-start', (_e, slot) => {
  const s = slot ? sessionBySlot(slot) : activeSession();
  if (!s) return { ok: false, error: 'no_session' };
  return s.bot.startSpam(spamCfgFor(s.accountId));
});
ipcMain.handle('bot:spam-stop', (_e, slot) => {
  const b = botBySlot(slot);
  return b ? b.stopSpam() : { ok: false, error: 'no_session' };
});
// Secili tum hesaplarda baslat/durdur (AUTO SPAM sayfasindaki START/STOP)
ipcMain.handle('bot:spam-many', (_e, payload) => {
  const p = payload || {};
  const ids = Array.isArray(p.accountIds) ? p.accountIds : null;
  const on = !!p.start;
  const done = [];
  sessions.forEach((s) => {
    if (ids && ids.indexOf(s.accountId) === -1) return;
    const r = on ? s.bot.startSpam(spamCfgFor(s.accountId)) : s.bot.stopSpam();
    done.push({ slot: s.slot, name: s.name || '', accountId: s.accountId, ok: !!(r && r.ok), error: (r && r.error) || '' });
  });
  return { ok: done.some((x) => x.ok), list: done };
});
ipcMain.handle('macro:start', (_e, slot) => {
  const b = botBySlot(slot);
  const cfg = store.get().macros || {};
  return b ? b.startMacro(cfg.farmer) : { ok: false, error: 'no_session' };
});
ipcMain.handle('macro:peek', (_e, payload) => {
  const p = payload && typeof payload === 'object' ? payload : { slot: payload };
  const b = botBySlot(p.slot);
  return b ? b.peekWindow(!!p.silent) : { ok: false, error: 'no_session' };
});
ipcMain.handle('macro:screen-click', async (_e, payload) => {
  const p = payload || {};
  const b = botBySlot(p.slot);
  return b ? b.clickScreenSlot(p.index, p.button) : { ok: false, error: 'no_session' };
});
ipcMain.handle('macro:stop', (_e, slot) => {
  const b = botBySlot(slot);
  return b ? b.stopMacro() : { ok: false, error: 'no_session' };
});
ipcMain.handle('bot:antiafk', (_e, payload) => {
  const enabled = typeof payload === 'object' && payload !== null ? payload.enabled : payload;
  const b = botBySlot(payload && payload.slot);
  return b ? b.setAntiAfk(enabled, store.get().antiAfk) : { ok: false, error: 'no_session' };
});
ipcMain.handle('bot:run-join', (_e, slot) => {
  const b = botBySlot(slot);
  return b ? b.runJoinMessages() : { ok: false, error: 'no_session' };
});

// --- Sunucu ekranlari (dialog) ----------------------------------------------
ipcMain.handle('dialog:submit', (_e, payload) => {
  const b = botBySlot(payload && payload.slot);
  return b ? b.submitDialog((payload && payload.index) || 0, (payload && payload.values) || {}) : { ok: false, error: 'no_session' };
});
ipcMain.handle('dialog:cancel', (_e, slot) => { const b = botBySlot(slot); return b ? b.cancelDialog() : { ok: true }; });
ipcMain.handle('dialog:cancel-auto', (_e, slot) => { const b = botBySlot(slot); return b ? b.cancelDialogAuto() : { ok: true }; });
ipcMain.handle('dialog:command', (_e, payload) => {
  const b = botBySlot(payload && payload.slot);
  return b ? b.submitDialogCommand((payload && payload.template) || '', (payload && payload.values) || {}) : { ok: false, error: 'no_session' };
});

// --- Hesaplar (sifre/token sifreli saklanir) --------------------------------
ipcMain.handle('accounts:add', (_e, acc) => {
  const cfg = store.get();
  const entry = {
    id: 'acc_' + Date.now().toString(36),
    username: acc.username,
    type: acc.type || 'offline',           // offline | microsoft
    email: acc.email || '',
    secret: acc.password ? store.encrypt(acc.password) : '',
    online: false
  };
  cfg.accounts.list.push(entry);
  if (!cfg.accounts.selected) cfg.accounts.selected = entry.id;
  store.saveDebounced();
  logger.info(`Account added: ${entry.username} (${entry.type})`);
  return cfg.accounts;
});

ipcMain.handle('accounts:update', (_e, acc) => {
  const cfg = store.get();
  const item = cfg.accounts.list.find((a) => a.id === acc.id);
  if (item) {
    item.username = acc.username;
    item.type = acc.type;
    item.email = acc.email || '';
    if (acc.password) item.secret = store.encrypt(acc.password);
    store.saveDebounced();
    logger.info(`Account updated: ${item.username}`);
  }
  return cfg.accounts;
});

ipcMain.handle('accounts:remove', (_e, id) => {
  const cfg = store.get();
  // Calisan hesabi once temizle. Aksi halde listede olmayan bir hesabin
  // oturumu durum olaylari gondermeye devam eder ve panel ziplar.
  const running = sessionByAccount(id);
  if (running) removeSession(running.slot);
  cfg.accounts.list = cfg.accounts.list.filter((a) => a.id !== id);
  if (cfg.accounts.selected === id) cfg.accounts.selected = cfg.accounts.list[0] ? cfg.accounts.list[0].id : null;
  if (Array.isArray(cfg.accounts.picked)) {
    cfg.accounts.picked = cfg.accounts.picked.filter((accountId) => accountId !== id);
  }
  if (cfg.settings && Array.isArray(cfg.settings.startupAccounts)) {
    cfg.settings.startupAccounts = cfg.settings.startupAccounts.filter((accountId) => accountId !== id);
  }
  // Silinen hesap tum ayar listelerinden de cikarilir
  cfg.featureAccounts = cfg.featureAccounts || {};
  for (const k of FEATURE_KEYS) {
    if (Array.isArray(cfg.featureAccounts[k])) {
      cfg.featureAccounts[k] = cfg.featureAccounts[k].filter((accountId) => accountId !== id);
    }
  }
  syncToggleSummary();
  store.saveDebounced();
  return cfg.accounts;
});

ipcMain.handle('accounts:select', (_e, id) => {
  const cfg = store.get();
  cfg.accounts.selected = id;
  store.saveDebounced();
  return cfg.accounts;
});

ipcMain.handle('accounts:reorder', (_e, ids) => {
  const cfg = store.get();
  if (!Array.isArray(ids)) return safeConfig().accounts;

  // Sadece mevcut hesap kimliklerini kabul et; hesap nesnelerini renderer'dan
  // geri almayarak sifre/token alanlarinin kaybolmasini veya degismesini onle.
  const byId = new Map(cfg.accounts.list.map((account) => [account.id, account]));
  const seen = new Set();
  const ordered = [];
  ids.forEach((id) => {
    if (typeof id !== 'string' || seen.has(id) || !byId.has(id)) return;
    seen.add(id);
    ordered.push(byId.get(id));
  });
  cfg.accounts.list.forEach((account) => {
    if (!seen.has(account.id)) ordered.push(account);
  });

  cfg.accounts.list = ordered;
  store.saveDebounced();
  return safeConfig().accounts;
});

// --- Proxyler ---------------------------------------------------------------
ipcMain.handle('proxies:add', (_e, p) => {
  const cfg = store.get();
  cfg.proxies.list.push({
    id: 'px_' + Date.now().toString(36),
    type: p.type || 'socks5',
    host: p.host,
    port: Number(p.port),
    username: p.username || '',
    password: p.password ? store.encrypt(p.password) : ''
  });
  store.saveDebounced();
  return cfg.proxies;
});

ipcMain.handle('proxies:remove', (_e, id) => {
  const cfg = store.get();
  cfg.proxies.list = cfg.proxies.list.filter((p) => p.id !== id);
  if (cfg.proxies.selected === id) cfg.proxies.selected = null;
  store.saveDebounced();
  return cfg.proxies;
});

ipcMain.handle('proxies:select', (_e, id) => {
  const cfg = store.get();
  cfg.proxies.selected = id;
  store.saveDebounced();
  return cfg.proxies;
});

// --- Loglar -----------------------------------------------------------------
ipcMain.handle('logs:all', () => logger.all());
ipcMain.handle('logs:clear', () => { logger.clear(); return true; });
ipcMain.handle('logs:export', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export Logs',
    defaultPath: path.join(app.getPath('documents'), `karabarakorsa-logs-${Date.now()}.txt`),
    filters: [{ name: 'Text', extensions: ['txt'] }]
  });
  if (canceled || !filePath) return { ok: false };
  logger.exportTo(filePath);
  return { ok: true, path: filePath };
});

// --- Microsoft hesap girisi (msmc / resmi OAuth pop-up) ---------------------
// "Microsoft ile giris yap" butonuna basilinca Microsoft'un kendi giris sayfasi
// bir pop-up pencerede acilir. Sifre uygulamaya hicbir zaman yazilmaz; geriye
// sadece yenileme jetonu (refresh token) saklanir ve o da DPAPI ile sifrelenir.
let msaBusy = false;

function msmcAuth(prompt) {
  const { Auth } = require('msmc');
  return new Auth(prompt || 'select_account');
}

function msaWindowProps() {
  return {
    width: 520,
    height: 700,
    resizable: false,
    minimizable: false,
    parent: win || undefined,
    modal: false,
    title: L('Microsoft ile giriş yap', 'Sign in with Microsoft'),
    backgroundColor: '#0d0f14',
    autoHideMenuBar: true,
    icon: iconPath(),
    webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:msa' }
  };
}

function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

// msmc surumleri arasinda alan adlari degisebiliyor: hem mclc() hem de dogrudan
// alanlari deneyerek jeton / isim / uuid cikarilir.
function mcProfileOf(token) {
  let p = null;
  try { p = token && typeof token.mclc === 'function' ? token.mclc() : null; } catch (_) { p = null; }
  const prof = (token && token.profile) || {};
  return {
    accessToken: (p && (p.access_token || p.accessToken)) || (token && token.mcToken) || '',
    name: (p && p.name) || prof.name || '',
    uuid: String((p && p.uuid) || prof.id || '').replace(/-/g, '')
  };
}

// Kayitli yenileme jetonundan yeni bir oyun oturumu uretir (baglanmak icin)
async function msSessionFor(acc) {
  const refresh = store.decrypt(acc.msRefresh || '');
  if (!refresh) throw new Error(L('Bu hesapta Microsoft girişi yok. HESAPLAR sayfasından giriş yapın.',
    'This account has no Microsoft sign-in. Sign in on the ACCOUNTS page.'));
  const xbox = await msmcAuth().refresh(refresh);
  const token = await xbox.getMinecraft();
  const p = mcProfileOf(token);
  if (!p.accessToken || !p.name) throw new Error(L('Minecraft profili alınamadı.', 'Could not fetch the Minecraft profile.'));
  const cfg = store.get();
  const row = cfg.accounts.list.find((a) => a.id === acc.id);
  if (row) { row.msRefresh = store.encrypt(xbox.save()); store.saveDebounced(); }
  return { accessToken: p.accessToken, id: p.uuid, name: p.name };
}

ipcMain.handle('auth:microsoft', async () => {
  if (msaBusy) return { ok: false, error: 'busy' };
  msaBusy = true;
  try {
    logger.info(L('Microsoft giriş penceresi açıldı', 'Microsoft sign-in window opened'));
    const auth = msmcAuth('select_account');
    const xbox = await auth.launch('electron', msaWindowProps());
    const token = await xbox.getMinecraft();
    if (!token || !token.profile) {
      throw new Error(L('Bu Microsoft hesabında Minecraft: Java Edition bulunamadı.',
        'No Minecraft: Java Edition was found on this Microsoft account.'));
    }
    const p = mcProfileOf(token);
    const name = p.name || token.profile.name;
    const uuid = p.uuid || String(token.profile.id || '').replace(/-/g, '');
    const cfg = store.get();
    let acc = cfg.accounts.list.find((a) => a.uuid === uuid)
      || cfg.accounts.list.find((a) => a.type === 'microsoft' && String(a.username || '').toLowerCase() === name.toLowerCase());
    if (!acc) {
      acc = { id: rid(), type: 'microsoft', username: name, email: '', password: '' };
      cfg.accounts.list.push(acc);
    }
    acc.type = 'microsoft';
    acc.username = name;
    acc.uuid = uuid;
    acc.authed = true;
    acc.premium = true;
    acc.msRefresh = store.encrypt(xbox.save());
    cfg.accounts.selected = acc.id;
    store.saveDebounced();
    logger.info(L('Microsoft girişi başarılı: ', 'Microsoft sign-in successful: ') + name);
    send('msa-done', { ok: true, name, id: acc.id });
    send('config-changed', safeConfig());
    return { ok: true, name, id: acc.id };
  } catch (e) {
    const raw = (e && e.message) || String(e);
    const cancelled = /error\.gui\.closed|closed/i.test(raw);
    const msg = cancelled
      ? L('Giriş penceresi kapatıldı.', 'The sign-in window was closed.')
      : (/Cannot find module/.test(raw)
        ? L('msmc kurulu değil. Klasörde "npm install" çalıştırın.', 'msmc is not installed. Run "npm install" in the folder.')
        : raw);
    if (!cancelled) logger.error(L('Microsoft girişi başarısız: ', 'Microsoft sign-in failed: ') + msg);
    send('msa-done', { ok: false, error: msg, cancelled });
    return { ok: false, error: msg, cancelled };
  } finally {
    msaBusy = false;
  }
});

ipcMain.handle('win:minimize', () => win.minimize());
ipcMain.handle('win:maximize', () => {
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
  return win.isMaximized();
});
ipcMain.handle('win:close', () => { hideToBackground(); return { ok: true }; });
ipcMain.handle('shell:open', (_e, url) => shell.openExternal(url));
ipcMain.handle('log:open', () => { try { shell.openPath(diagPath()); } catch (_) {} return { ok: true }; });
ipcMain.handle('diag', (_e, msg) => { logger.error('UI: ' + msg); writeDiag(msg); return true; });
