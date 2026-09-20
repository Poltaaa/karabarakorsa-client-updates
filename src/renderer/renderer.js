'use strict';
/* ===========================================================================
   renderer.js - Sayfa mantigi ve TUM buton baglantilari.
   NOT: 'api' ismi kullanilamaz (contextBridge global'i ile cakisir) -> bridge
   =========================================================================== */
window.__stage.rendererParsed = true;

const bridge = window.api;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const attr = (s) => esc(s).replace(/"/g, '&quot;');
const fatal = (m) => window.report(m);
function safe(fn, label) { try { return fn(); } catch (e) { fatal('[' + (label || 'init') + '] ' + e.message); } }

let cfg = null;
let state = { status: 'OFFLINE', ping: 0, uptime: 0, spam: false, antiAfk: false, server: '-', account: '-', lastError: '' };
const logFilters = new Set(['INFO', 'WARNING', 'ERROR', 'CHAT', 'CONNECT', 'DISCONNECT', 'RECONNECT']);

/* ---------------- COKLU HESAP: numarali oturum sekmeleri ------------------ */
let slotInfo = { list: [], active: 0 };   // main tarafindan gelen oturum listesi
let chatSlot = 0;                         // sohbette gosterilen oturum (0 = aktif)
let logSlot = 0;                          // kayitlarda gosterilen oturum (0 = TUMU)
let slotTabsSig = '';
let dashSessionsSig = '';
let accountMutationDepth = 0;
const unreadChat = new Set();
const unreadLog = new Set();
const effChatSlot = () => chatSlot || slotInfo.active || 0;
const slotOf = (id) => slotInfo.list.find((s) => s.accountId === id) || null;
const liveCls = (st) => (st === 'ONLINE' ? 'on' : (st === 'CONNECTING' || st === 'RECONNECTING') ? 'wait' : '');

function slotTabHtml(s, isActive, unread) {
  return `<button class="slot-tab ${isActive ? 'active' : ''} ${unread ? 'unread' : ''}" data-slot="${s.slot}" title="${attr(s.name)} · ${s.status}">
      <span class="num">${s.slot}</span><span class="who">${esc(s.name)}</span><i class="live ${liveCls(s.status)}"></i>
    </button>`;
}

function renderSlotTabs() {
  const cw = $('chat-slots'), lw = $('log-slots');
  if (!cw || !lw) return;
  const list = slotInfo.list || [];
  if (list.length < 2) { unreadChat.clear(); unreadLog.clear(); }
  const cur = effChatSlot();
  const sig = JSON.stringify([
    cur, logSlot, [...unreadChat].sort(), [...unreadLog].sort(),
    list.map((s) => [s.slot, s.name, s.status])
  ]);
  if (sig === slotTabsSig) return;
  slotTabsSig = sig;
  if (!list.length) { cw.innerHTML = ''; lw.innerHTML = ''; return; }
  cw.innerHTML = list.map((s) => slotTabHtml(s, s.slot === cur, unreadChat.has(s.slot))).join('');
  lw.innerHTML = `<button class="slot-tab all ${logSlot === 0 ? 'active' : ''}" data-slot="0">${window.t('allSessions')}</button>`
    + list.map((s) => slotTabHtml(s, s.slot === logSlot, unreadLog.has(s.slot))).join('');
  cw.querySelectorAll('[data-slot]').forEach((b) => { b.onclick = () => selectChatSlot(Number(b.dataset.slot)); });
  lw.querySelectorAll('[data-slot]').forEach((b) => { b.onclick = () => selectLogSlot(Number(b.dataset.slot)); });
}

async function selectChatSlot(slot) {
  chatSlot = Number(slot) || 0;
  unreadChat.delete(chatSlot);
  const st = await bridge.bot.setActive(chatSlot);      // aktif oturumu da degistir
  slotInfo.active = chatSlot || slotInfo.active;
  if (st) applyState(st);
  await renderChatHistory();
  renderSlotTabs();
}
async function selectLogSlot(slot) {
  logSlot = Number(slot) || 0;
  unreadLog.delete(logSlot);
  await renderLogHistory();
  renderSlotTabs();
}
async function renderChatHistory() {
  chatBox.innerHTML = '';
  const dash = document.getElementById('dash-chat');
  if (dash) dash.innerHTML = '';
  const h = await bridge.bot.chatHistory(effChatSlot());
  (h || []).forEach((e) => addChatLine(e, true));
}
function pruneSlots() {
  const has = (n) => (slotInfo.list || []).some((s) => s.slot === n);
  if (chatSlot && !has(chatSlot)) chatSlot = 0;
  if (logSlot && !has(logSlot)) logSlot = 0;
}
async function refreshSlots() {
  slotInfo = (await bridge.bot.slots()) || { list: [], active: 0 };
  pruneSlots();
  renderSlotTabs();
}

function hhmmss(ms) {
  const s = Math.floor(ms / 1000), p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
function nowTime() { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
const T = (k) => window.t(k);
const save = (patch) => bridge.config.patch(patch).then((data) => { cfg = data; return data; });

/* ============================ BOOT ======================================== */
async function boot() {
  if (!bridge) return;
  cfg = await bridge.config.get();
  window.__lang = cfg.settings.language;
  document.body.dataset.theme = cfg.settings.theme;

  await safe(loadVersions, 'loadVersions');
  safe(fillConnect, 'fillConnect');
  safe(fillToggles, 'fillToggles');
  safe(fillSpam, 'fillSpam');
  safe(fillAntiAfk, 'fillAntiAfk');
  safe(fillJoin, 'fillJoin');
  safe(fillMacros, 'fillMacros');
  safe(fillDialogSettings, 'fillDialogSettings');
  safe(fillSettings, 'fillSettings');
  safe(renderAccounts, 'renderAccounts');
  safe(renderProxies, 'renderProxies');
  safe(renderSpamList, 'renderSpamList');
  safe(renderJoinList, 'renderJoinList');
  safe(() => window.applyI18n(), 'i18n');
  safe(() => window.enhanceSelects(), 'selects');

  await refreshSlots();
  await renderLogHistory();
  await renderChatHistory();
  applyState(await bridge.bot.state());
  safe(refreshTopChips, 'topChips');
  bridge.appInfo().then((i) => {
    const box = $('s-appinfo');
    if (box) box.textContent = `${i.name} v${i.version}\nmade by ${i.author}\n${i.configPath}\n${i.logPath}`;
    const fv = $('foot-ver'); if (fv) fv.textContent = 'v' + i.version;
    appVer = i.version || '';
  });
  if (bridge.update && bridge.update.state) {
    bridge.update.state().then((s) => { updState = s || { ok: false }; paintUpdateState(); }).catch(() => {});
  }
  startUptimeTimer();
  window.__stage.bootDone = true;
}

/* ------------------------- Minecraft surumleri ---------------------------- */
async function loadVersions() {
  const sel = $('c-version');
  const res = await bridge.versions();
  sel.innerHTML = `<option value="auto" data-i18n="autoDetect">${esc(T('autoDetect'))}</option>`;
  res.versions.slice().reverse().forEach((v) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
  sel.value = res.versions.includes(cfg.connection.version) ? cfg.connection.version : 'auto';
  if (sel.value !== cfg.connection.version) save({ connection: { version: sel.value } });
  window.refreshSelect(sel);
}

/* ============================ CONNECT ===================================== */
function fillConnect() {
  const c = cfg.connection, r = cfg.autoReconnect;
  $('c-host').value = c.host; $('c-port').value = c.port;
  $('c-delay').value = c.loginDelay; $('c-fakehost').value = c.fakeHost || '';
  $('c-respack').value = c.resourcePack || 'smart';
  $('r-delay').value = r.delay; $('r-unlimited').checked = r.unlimited; $('r-max').value = r.maxAttempts;

  const bindConn = (el, key, num) => el.addEventListener('change', () => save({ connection: { [key]: num ? Number(el.value) : el.value } }));
  bindConn($('c-host'), 'host'); bindConn($('c-port'), 'port', true);
  bindConn($('c-version'), 'version'); bindConn($('c-delay'), 'loginDelay', true);
  bindConn($('c-fakehost'), 'fakeHost');
  $('c-respack').onchange = () => {
    save({ connection: { resourcePack: $('c-respack').value } });
    window.toast(T('tRespackSaved'), 'ok');
  };
  $('r-delay').onchange = () => save({ autoReconnect: { delay: Number($('r-delay').value) } });
  $('r-max').onchange = () => save({ autoReconnect: { maxAttempts: Number($('r-max').value) } });
  $('r-unlimited').onchange = () => save({ autoReconnect: { unlimited: $('r-unlimited').checked } });
  applyFeatureUI();
  updateReconnectFields();
  updateFakeHostField();
}

// "Sinirsiz deneme" acikken "En fazla deneme" alanina gerek yok
function updateReconnectFields() {
  const w = $('r-max-wrap'); if (!w) return;
  w.classList.toggle('hidden', !!$('r-unlimited').checked);
}

// Sahte host alani sadece anahtar acikken gorunur
function updateFakeHostField() {
  const w = $('c-fakehost-wrap'); if (!w || !cfg) return;
  w.classList.toggle('hidden', !featOn('fakeHost'));
}

function fillToggles() {
  bindFeatureSwitches(document);
  renderDashTiles();
  applyFeatureUI();
}

// accountId verilirse o hesapla yeni bir oturum acilir (coklu baglanti).
async function doConnect(accountId) {
  const id = typeof accountId === 'string' ? accountId : undefined;
  $('c-connect').disabled = true;
  const res = await bridge.bot.connect(id);
  $('c-connect').disabled = false;
  if (res && res.slot) { chatSlot = res.slot; unreadChat.delete(res.slot); }
  await refreshSlots();
  await renderChatHistory();
  if (!res || res.ok) return;
  if (res.error === 'no_account') { window.navigate('accounts'); window.toast(T('tAddAccountFirst'), 'warn'); }
  else if (res.error === 'already_connected') window.toast(T('tAlreadyConnected'), 'warn');
  else if (res.error) window.toast(res.error, 'error');
}

// CONNECT tusu: secili (tik) hesaplarin hepsini sirayla baglar.
async function connectPicked() {
  const connected = new Set((slotInfo.list || []).map((x) => x.accountId));
  const ids = pickedIds().filter((id) => !connected.has(id));
  if (!ids.length) return doConnect();
  for (const id of ids) await doConnect(id);      // her hesap kendi oturumunu acar
}

// BAGLANTIYI KES: birden fazla oturum varsa hepsini kapatir.
async function disconnectAll() {
  const slots = (slotInfo.list || []).map((x) => x.slot);
  if (slots.length <= 1) return doDisconnect();
  for (const n of slots) await bridge.bot.disconnect(n);
  await refreshSlots();
  return { ok: true };
}

async function doDisconnect(slot) {
  const r = await bridge.bot.disconnect(slot === undefined ? effChatSlot() : slot);
  await refreshSlots();
  return r;
}

/* ============================ ACCOUNTS ==================================== */
function accRowHtml(a, opts) {
  const o = opts || {};
  const s = slotOf(a.id);
  const busy = !!s && s.status !== 'OFFLINE';
  // Bagli her hesap "secili" gorunur; ayrica elle secilenler de secili kalir
  const picked = o.picked !== undefined ? o.picked : (busy || isPicked(a.id));
  const kind = a.type === 'microsoft' ? T('premium') : 'CRACKED';
  const sub = s ? s.status : (picked ? T('rowSelected') : T('rowIdle'));
  const actions = o.pickOnly ? '' : `
      <button class="icon-btn power ${busy && s.status === 'ONLINE' ? 'on' : ''}" data-act="${busy ? 'off' : 'on'}" data-id="${a.id}"
        title="${busy ? T('rowDisconnect') : T('rowConnect')}">${window.ICON.power}</button>
      <button class="icon-btn ${picked ? 'on' : ''}" data-act="select" data-id="${a.id}"
        title="${picked ? T('rowUnselect') : T('rowSelect')}">${window.ICON.check}</button>
      <button class="icon-btn" data-act="edit" data-id="${a.id}" title="${T('rowEdit')}">${window.ICON.edit}</button>
      <button class="icon-btn del" data-act="del" data-id="${a.id}" title="${T('rowDelete')}">${window.ICON.trash}</button>`;
  return `
    <div class="item ${picked ? 'selected' : ''} ${o.pickOnly ? '' : 'account-sortable'}"
      ${o.pickOnly ? `data-pick="${a.id}"` : `data-account-row="${a.id}"`}>
      <i class="dot ${s ? liveCls(s.status) : ''}"></i>
      <div class="main">
        <span class="name">${esc(a.username)}${s ? `<b class="slotbadge">#${s.slot}</b>` : ''}</span>
        <span class="sub">${kind} · ${sub}</span>
      </div>${actions}
    </div>`;
}

// Elle secilen hesaplar (birden fazla olabilir)
function pickedIds() {
  const a = cfg.accounts.picked;
  if (Array.isArray(a)) return a;
  return cfg.accounts.selected ? [cfg.accounts.selected] : [];
}
function isPicked(id) { return pickedIds().includes(id); }

function syncAccountOrder(ids) {
  ['accounts-list', 'connect-accounts'].forEach((listId) => {
    const list = $(listId);
    if (!list) return;
    const currentIds = [...list.querySelectorAll('[data-account-row]')].map((el) => el.dataset.accountRow);
    // Suruklenen (gorunen) liste zaten dogru sirada. Elemanlari yeniden append
    // etmek CSS giris animasyonlarini bastan baslatip refresh hissi veriyordu.
    if (currentIds.length === ids.length && currentIds.every((id, i) => id === ids[i])) return;

    const rows = new Map([...list.querySelectorAll('[data-account-row]')].map((el) => [el.dataset.accountRow, el]));
    ids.forEach((id, index) => {
      const row = rows.get(id);
      const atIndex = list.querySelectorAll('[data-account-row]')[index];
      if (row && row !== atIndex) list.insertBefore(row, atIndex || null);
    });
  });
}

// Hesap satirlarini yalnizca dikey eksende siralar. Native HTML drag/drop
// kullanilmiyor; boylece satir saga/sola suruklenmez ve liste disina birakilmaz.
function bindAccountSorting(list) {
  if (!list) return;
  list.querySelectorAll('[data-account-row]').forEach((row) => {
    row.onpointerdown = (e) => {
      if (e.button !== 0 || e.target.closest('button, input, a')) return;
      const startY = e.clientY;
      let dragging = false;
      let finished = false;
      let ghost = null;
      let lastDy = 0;
      let startRect = null;

      const animateReorder = (before) => {
        [...list.querySelectorAll('[data-account-row]')].forEach((item) => {
          if (item === row || !before.has(item)) return;
          const delta = before.get(item) - item.getBoundingClientRect().top;
          if (Math.abs(delta) < 1) return;
          item.animate(
            [{ transform: `translate3d(0, ${delta}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
            { duration: 190, easing: 'cubic-bezier(.2,.8,.2,1)' }
          );
        });
      };

      const begin = () => {
        dragging = true;
        startRect = row.getBoundingClientRect();
        ghost = row.cloneNode(true);
        ghost.removeAttribute('data-account-row');
        ghost.classList.add('account-drag-ghost');
        ghost.style.left = startRect.left + 'px';
        ghost.style.top = startRect.top + 'px';
        ghost.style.width = startRect.width + 'px';
        ghost.style.height = startRect.height + 'px';
        document.body.appendChild(ghost);
        requestAnimationFrame(() => ghost && ghost.classList.add('lifted'));
        row.classList.add('drag-placeholder');
        list.classList.add('sorting');
        document.body.classList.add('account-sorting');
        try { row.setPointerCapture(e.pointerId); } catch (_) {}
      };

      const move = (ev) => {
        const dy = ev.clientY - startY;
        if (!dragging && Math.abs(dy) < 6) return;
        if (!dragging) begin();
        ev.preventDefault();
        lastDy = dy;
        if (ghost) ghost.style.transform = `translate3d(0, ${dy}px, 0) scale(1.025)`;

        // Yatay koordinat sabit tutulur; sadece pointer'in dikey konumu hedefi belirler.
        const x = list.getBoundingClientRect().left + Math.min(24, list.clientWidth / 2);
        const target = document.elementsFromPoint(x, ev.clientY)
          .map((el) => el.closest && el.closest('[data-account-row]'))
          .find((el) => el && el !== row && el.parentElement === list);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const before = new Map([...list.querySelectorAll('[data-account-row]')].map((item) => [item, item.getBoundingClientRect().top]));
        if (ev.clientY < rect.top + rect.height / 2) list.insertBefore(row, target);
        else list.insertBefore(row, target.nextSibling);
        animateReorder(before);
      };

      const finish = async () => {
        if (finished) return;
        finished = true;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        list.classList.remove('sorting');
        document.body.classList.remove('account-sorting');
        try { row.releasePointerCapture(e.pointerId); } catch (_) {}
        if (!dragging) return;

        const ids = [...list.querySelectorAll('[data-account-row]')].map((el) => el.dataset.accountRow);
        const finalRect = row.getBoundingClientRect();
        row.classList.remove('drag-placeholder');
        const dropAnimation = ghost && startRect
          ? ghost.animate([
              { transform: `translate3d(0, ${lastDy}px, 0) scale(1.025)`, opacity: 1 },
              { transform: `translate3d(0, ${finalRect.top - startRect.top}px, 0) scale(1)`, opacity: .88 }
            ], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished.catch(() => {})
          : Promise.resolve();
        accountMutationDepth++;
        let saved = false;
        try {
          const result = await Promise.all([bridge.accounts.reorder(ids), dropAnimation]);
          cfg.accounts = result[0];
          syncAccountOrder(ids);
          accountsSig = accountSignature();
          saved = true;
        } catch (err) {
          fatal('[account reorder] ' + err.message);
        } finally {
          if (ghost) ghost.remove();
          ghost = null;
          accountMutationDepth--;
          // Basarili siralamada DOM'u bastan cizme: anlik refresh/twitch yapar.
          // Yalnizca kayit basarisizsa sunucudaki gercek siraya geri don.
          if (!saved) renderAccounts();
        }
      };

      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', finish, { once: true });
      window.addEventListener('pointercancel', finish, { once: true });
    };
  });
}

function renderAccounts() {
  const list = cfg.accounts.list;
  const html = list.length ? list.map((a) => accRowHtml(a)).join('') : `<div class="empty">${window.t('noAccounts')}</div>`;
  $('accounts-list').innerHTML = html;
  $('connect-accounts').innerHTML = html;
  bindAccountSorting($('accounts-list'));
  bindAccountSorting($('connect-accounts'));
  accountsSig = accountSignature();
  paintStartupRow();
  try { applyFeatureUI(); if (featPick || spamAct) renderFeatPicker(); } catch (_) {}
  try { window.enhanceScrollFade(); } catch (_) {}

  document.querySelectorAll('#accounts-list [data-act], #connect-accounts [data-act]').forEach((b) => {
    b.onclick = async () => {
      if (b.disabled) return;
      const id = b.dataset.id;
      if (b.dataset.act === 'on') {
        window.toast(T('tConnecting'), 'info');
        await doConnect(id);
        renderAccounts(); refreshDashboard();
        return;
      }
      if (b.dataset.act === 'off') {
        const s = slotOf(id);
        await doDisconnect(s ? s.slot : 0);
        renderAccounts(); refreshDashboard();
        return;
      }
      if (b.dataset.act === 'select') {
        const on = isPicked(id);
        const next = on ? pickedIds().filter((x) => x !== id) : pickedIds().concat([id]);
        cfg.accounts.picked = next;
        cfg.accounts.selected = next.length ? next[next.length - 1] : null;
        await save({ accounts: { picked: next, selected: cfg.accounts.selected } });
        window.toast(T(on ? 'tUnselected' : 'tSelected'), on ? 'info' : 'ok');
      } else if (b.dataset.act === 'del') {
        accountMutationDepth++;
        b.disabled = true;
        b.closest('.item')?.classList.add('busy');
        try {
          cfg.accounts = await bridge.accounts.remove(id);
          window.toast(T('tAccDeleted'), 'info');
        } finally {
          accountMutationDepth--;
        }
      } else {
        const a = cfg.accounts.list.find((x) => x.id === id);
        $('a-id').value = a.id;
        $('a-username').value = a.username;
        $('a-password').value = '';
        window.navigate('accounts');
      }
      renderAccounts(); refreshDashboard();
    };
  });
}

// "Baslangicta acilsin" artik uygulama ici hesap seciciyle yapilir:
// checkbox'a basinca secim penceresi acilir (renderStartupList kaldirildi).

async function saveAccount() {
  const payload = {
    id: $('a-id').value || undefined,
    type: 'offline',
    username: $('a-username').value.trim(),
    password: $('a-password').value,
  };
  if (!payload.username) return window.toast(T('tUsernameNeeded'), 'warn');
  cfg.accounts = payload.id ? await bridge.accounts.update(payload) : await bridge.accounts.add(payload);
  resetAccountForm(); renderAccounts(); refreshDashboard();
  window.toast(T('tAccSaved'), 'ok');
}
function resetAccountForm() {
  $('a-id').value = ''; $('a-username').value = ''; $('a-password').value = '';
}

/* ============================= PROXIES ==================================== */
function renderProxies() {
  const list = cfg.proxies.list;
  $('proxy-list').innerHTML = list.length ? list.map((p) => `
    <div class="item ${p.id === cfg.proxies.selected ? 'selected' : ''}">
      <i class="dot ${p.id === cfg.proxies.selected ? 'on' : ''}"></i>
      <div class="main">
        <span class="name">${esc(p.host)}:${p.port}</span>
        <span class="sub">${String(p.type).toUpperCase()}${p.username ? ' · auth' : ''}</span>
      </div>
      <button class="icon-btn" data-pact="select" data-id="${p.id}" title="${T('rowSelect')}">${window.ICON.check}</button>
      <button class="icon-btn del" data-pact="del" data-id="${p.id}" title="${T('rowDelete')}">${window.ICON.trash}</button>
    </div>`).join('') : `<div class="empty">${window.t('noProxies')}</div>`;
  try { window.enhanceScrollFade(); } catch (_) {}

  document.querySelectorAll('[data-pact]').forEach((b) => {
    b.onclick = async () => {
      cfg.proxies = b.dataset.pact === 'select' ? await bridge.proxies.select(b.dataset.id) : await bridge.proxies.remove(b.dataset.id);
      renderProxies();
      window.toast(b.dataset.pact === 'select' ? T('tProxySelected') : T('tProxyDeleted'), 'info');
    };
  });
}
async function addProxy() {
  if (!$('p-host').value.trim() || !$('p-port').value) return window.toast(T('tProxyNeed'), 'warn');
  cfg.proxies = await bridge.proxies.add({
    type: $('p-type').value, host: $('p-host').value.trim(), port: $('p-port').value,
    username: $('p-user').value.trim(), password: $('p-pass').value
  });
  $('p-host').value = ''; $('p-port').value = ''; $('p-user').value = ''; $('p-pass').value = '';
  renderProxies(); window.toast(T('tProxyAdded'), 'ok');
}

let vpnBusy = false;
const VPN_COUNTRIES = [
  ['', 'Automatic'], ['AR', 'Argentina'], ['AU', 'Australia'], ['AT', 'Austria'], ['BE', 'Belgium'], ['BR', 'Brazil'],
  ['BG', 'Bulgaria'], ['CA', 'Canada'], ['CL', 'Chile'], ['CN', 'China'], ['CO', 'Colombia'], ['HR', 'Croatia'],
  ['CZ', 'Czechia'], ['DK', 'Denmark'], ['EG', 'Egypt'], ['EE', 'Estonia'], ['FI', 'Finland'], ['FR', 'France'],
  ['DE', 'Germany'], ['GR', 'Greece'], ['HK', 'Hong Kong'], ['HU', 'Hungary'], ['IN', 'India'], ['ID', 'Indonesia'],
  ['IE', 'Ireland'], ['IL', 'Israel'], ['IT', 'Italy'], ['JP', 'Japan'], ['LV', 'Latvia'], ['LT', 'Lithuania'],
  ['LU', 'Luxembourg'], ['MY', 'Malaysia'], ['MX', 'Mexico'], ['NL', 'Netherlands'], ['NZ', 'New Zealand'],
  ['NO', 'Norway'], ['PL', 'Poland'], ['PT', 'Portugal'], ['RO', 'Romania'], ['RS', 'Serbia'], ['SG', 'Singapore'],
  ['SK', 'Slovakia'], ['SI', 'Slovenia'], ['ZA', 'South Africa'], ['KR', 'South Korea'], ['ES', 'Spain'],
  ['SE', 'Sweden'], ['CH', 'Switzerland'], ['TW', 'Taiwan'], ['TR', 'Turkey'], ['UA', 'Ukraine'], ['GB', 'United Kingdom'],
  ['US', 'United States']
];
function vpnCountryName() {
  const list = (cfg && cfg.tor && cfg.tor.countries) || [];
  if (!list.length) return 'Automatic';
  return list.map((x) => (VPN_COUNTRIES.find((c) => c[0] === x) || [x, x])[1]).join(', ');
}
async function renderTor() {
  if (!bridge.tor || !cfg) return;
  const vpn = cfg.tor || (cfg.tor = {});
  const r = await bridge.tor.status(); const on = vpn.enabled === true && vpn.connectionEnabled === true && !!(r && r.running);
  const el = $('tor-status'); if (el) { el.textContent = on ? 'ON' : 'OFF'; el.classList.toggle('on', on); }
  if ($('vpn-state')) { $('vpn-state').textContent = on ? 'ON' : 'OFF'; $('vpn-state').classList.toggle('vpn-on', on); }
  if ($('tor-new')) $('tor-new').disabled = !on || vpnBusy;
  if ($('tor-start')) $('tor-start').disabled = vpnBusy;
  if ($('tor-stop')) $('tor-stop').disabled = vpnBusy;
  if ($('vpn-country-name')) $('vpn-country-name').textContent = vpnCountryName();
  if ($('vpn-prevent')) $('vpn-prevent').checked = vpn.preventNonVpn !== false;
  if ($('vpn-stream')) $('vpn-stream').checked = !!vpn.streamSeparation;
  if ($('vpn-dns')) $('vpn-dns').checked = vpn.resolveDns !== false;
  if ($('vpn-strict')) $('vpn-strict').checked = !!vpn.strictNodes;
}
async function startTor() {
  if (vpnBusy) return;
  vpnBusy = true; renderTor();
  try {
    const t = cfg.tor || {};
    const r = await bridge.tor.start({ countries: t.countries || [], strictNodes: !!t.strictNodes });
    if (r && r.ok) { cfg.tor = { ...t, enabled: true, connectionEnabled: true, country: r.status.country }; await save({ tor: cfg.tor }); window.toast('VPN aktif.', 'ok'); }
    else { cfg.tor = { ...t, enabled: false, connectionEnabled: false }; await save({ tor: { enabled: false, connectionEnabled: false } }); window.toast((r && r.error) || 'VPN başlatılamadı.', 'error'); }
  } finally { vpnBusy = false; renderTor(); }
}
async function stopTor() {
  if (vpnBusy) return;
  vpnBusy = true; renderTor();
  try { await bridge.tor.stop(); cfg.tor = { ...(cfg.tor || {}), enabled: false, connectionEnabled: false }; await save({ tor: { enabled: false, connectionEnabled: false } }); window.toast('VPN kapatıldı.', 'info'); }
  finally { vpnBusy = false; renderTor(); }
}
async function newTorIdentity() { if (!cfg || !cfg.tor || cfg.tor.enabled !== true || cfg.tor.connectionEnabled !== true || vpnBusy || ($('tor-new') && $('tor-new').disabled)) return; const r = await bridge.tor.newIdentity(); window.toast(r && r.ok ? 'VPN IP adresi değiştirildi.' : ((r && r.error) || 'VPN IP değiştirilemedi.'), r && r.ok ? 'ok' : 'error'); renderTor(); }
async function toggleVpn() { if (vpnBusy) return; const r = await bridge.tor.status(); return r && r.running ? stopTor() : startTor(); }
function openVpnSettings() { $('vpn-settings-modal').classList.remove('hidden'); renderTor(); }
function closeVpnSettings() { $('vpn-settings-modal').classList.add('hidden'); }
async function saveVpnSettings() {
  if (!cfg) return;
  const before = cfg.tor || {};
  const next = { ...before, preventNonVpn: $('vpn-prevent').checked, streamSeparation: $('vpn-stream').checked, resolveDns: $('vpn-dns').checked };
  const changed = ['preventNonVpn', 'streamSeparation', 'resolveDns'].some((k) => before[k] !== next[k]);
  cfg.tor = next;
  if (changed) { await save({ tor: next }); window.toast('VPN ayarları kaydedildi.', 'ok'); }
  closeVpnSettings();
}
function renderVpnCountryList() {
  const box = $('vpn-country-list'); if (!box) return;
  const selected = new Set((cfg.tor && cfg.tor.countries) || []);
  box.innerHTML = VPN_COUNTRIES.slice(1).map(([code, name]) => `<label class="vpn-country-option"><input type="checkbox" data-vpn-code="${code}" ${selected.has(code) ? 'checked' : ''}><span>${name}</span><small>${code}</small></label>`).join('');
}
function openVpnCountries() { if (!cfg) return; renderVpnCountryList(); $('vpn-strict').checked = !!(cfg.tor && cfg.tor.strictNodes); $('vpn-country-modal').classList.remove('hidden'); }
async function saveVpnCountries() {
  if (!cfg) return;
  const countries = [...document.querySelectorAll('[data-vpn-code]:checked')].map((x) => x.dataset.vpnCode);
  const strictNodes = $('vpn-strict').checked;
  const oldCountries = (cfg.tor && cfg.tor.countries) || [];
  const oldStrict = !!(cfg.tor && cfg.tor.strictNodes);
  const changed = JSON.stringify(oldCountries) !== JSON.stringify(countries) || oldStrict !== strictNodes;
  $('vpn-country-modal').classList.add('hidden');
  if (!changed) return;
  const next = { ...(cfg.tor || {}), countries, country: countries.join(','), strictNodes };
  const r = await bridge.tor.setCountry({ countries, strictNodes });
  if (r && !r.ok) { window.toast(r.error || 'Ülke seçimi uygulanamadı.', 'error'); return; }
  await save({ tor: next }); renderTor(); window.toast('VPN ülkesi güncellendi.', 'ok');
}
function resetVpnCountries() { document.querySelectorAll('[data-vpn-code]').forEach((x) => { x.checked = false; }); $('vpn-strict').checked = false; }
let vpnPick = null;
function openVpnAccountPicker() {
  if (!cfg) return;
  vpnPick = { sel: Array.isArray(cfg.tor && cfg.tor.accountIds) ? [...cfg.tor.accountIds] : [] };
  $('am-title').textContent = 'VPN HESABI';
  $('am-off').classList.add('hidden');
  const sub = document.querySelector('#acc-modal [data-i18n="amSub"]'); if (sub) sub.textContent = 'VPN’in hangi hesaplarda kullanılacağını seçin. Oyunda olan hesaplarda değişiklik, bağlantıyı kesip yeniden bağlandığınızda uygulanır.';
  renderVpnAccountPicker(); $('acc-modal').classList.remove('hidden');
}
function closeVpnAccountPicker() { vpnPick = null; $('am-off').classList.remove('hidden'); $('acc-modal').classList.add('hidden'); }
function renderVpnAccountPicker() {
  if (!vpnPick) return;
  const box = $('am-list'); const list = (cfg.accounts && cfg.accounts.list) || []; const live = {};
  (slotInfo.list || []).forEach((x) => { live[x.accountId] = x; });
  box.innerHTML = list.length ? list.map((a) => {
    const selected = vpnPick.sel.includes(a.id); const online = !!live[a.id];
    const tag = online ? 'OYUNDA' : (a.type === 'microsoft' ? T('amPremium') : T('amCracked'));
    return `<button class="amrow${selected ? ' on' : ''}" data-vpn-account="${attr(a.id)}"><i class="amck"></i><span class="amname">${esc(a.username)}</span><span class="amtag${online ? ' live' : ''}">${tag}</span></button>`;
  }).join('') : `<p class="hint">${esc(T('amNoAcc'))}</p>`;
  box.querySelectorAll('[data-vpn-account]').forEach((b) => { b.onclick = () => {
    const id = b.dataset.vpnAccount; const i = vpnPick.sel.indexOf(id); if (i < 0) vpnPick.sel.push(id); else vpnPick.sel.splice(i, 1);
    if ((slotInfo.list || []).some((x) => x.accountId === id)) window.toast('Bu hesap şu anda oyunda. VPN, bağlantıyı kesip yeniden bağlandığınızda uygulanacak.', 'info');
    renderVpnAccountPicker();
  }; });
  $('am-count').textContent = vpnPick.sel.length + '/' + list.length;
}
async function commitVpnPicker() {
  if (!vpnPick) return;
  const ids = [...vpnPick.sel]; const target = ids.length ? ids : null; cfg.tor = { ...(cfg.tor || {}), accountIds: target };
  await save({ tor: { accountIds: target } }); closeVpnAccountPicker();
  window.toast(ids.length ? 'VPN seçilen hesaplara atandı.' : 'Hesap seçilmedi; VPN otomatik olarak tüm hesaplarda kullanılacak.', 'info');
}

/* =============================== CHAT ===================================== */
const chatBox = $('chat-box');
// Minecraft renk parcalarini (spans) guvenli HTML'e cevirir
function spanHtml(spans) {
  return (spans || []).map((s) => {
    const cls = ['mcs'];
    if (s.b) cls.push('mc-b');
    if (s.i) cls.push('mc-i');
    if (s.u) cls.push('mc-u');
    if (s.s) cls.push('mc-s');
    if (s.o) cls.push('mc-o');
    const col = typeof s.c === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.c) ? ` style="color:${s.c}"` : '';
    return `<span class="${cls.join(' ')}"${col}>${esc(s.t)}</span>`;
  }).join('');
}
// Akilli kaydirma: kullanici en alttayken yeni icerik gelince otomatik en
// alta iner. Kullanici yukari kaydirdiysa ekran yerinde kalir - yeni mesajlar
// onu zorla asagi indirmez. En alta geri donunce takilma kendiliginden devam
// eder. (Sohbet, kayit ve paneldeki canli sohbet bu kuralla calisir.)
function atChatBottom(box) {
  if (!box) return true;
  return box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
}
function snapChatToBottom(box) {
  if (!box || !box.isConnected) return;
  const run = () => { if (box.isConnected) box.scrollTop = box.scrollHeight; };
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
  else window.setTimeout(run, 0);
}
function addChatLine(entry, skipFilter) {
  if (!entry) return;
  // Baska bir hesabin sohbeti: satir yazilmaz, o sekmede okunmamis isareti cikar
  if (!skipFilter && entry.slot && entry.slot !== effChatSlot()) {
    unreadChat.add(entry.slot); renderSlotTabs(); return;
  }
  const cls = entry.type === 'self' ? 'self' : entry.type === 'error' ? 'error' : entry.type === 'system' ? 'system' : '';
  // Gonderen adi: sunucu mesajin icine koymadiysa basa eklenir
  const who = entry.from ? `<span class="who">${esc(entry.from)}</span><span class="wsep">:</span>` : '';
  const body = Array.isArray(entry.spans) && entry.spans.length
    ? spanHtml(entry.spans)
    : esc(entry.message == null ? '' : entry.message);
  const html = `<span class="time">[${entry.time || nowTime()}]</span>${who}<span class="msg">${body}</span>`;
  const limit = cfg && cfg.settings.memoryOptimization ? 250 : 600;
  const put = (box, cap) => {
    if (!box) return;
    const stick = atChatBottom(box);
    const div = document.createElement('div');
    div.className = 'line ' + cls;
    div.innerHTML = html;
    box.appendChild(div);
    while (box.childElementCount > cap) box.removeChild(box.firstChild);
    if (stick) snapChatToBottom(box);
  };
  const stickChat = atChatBottom(chatBox);
  const div = document.createElement('div');
  div.className = 'line ' + cls;
  div.innerHTML = html;
  chatBox.appendChild(div);
  while (chatBox.childElementCount > limit) chatBox.removeChild(chatBox.firstChild);
  if (stickChat) snapChatToBottom(chatBox);
  const dash = document.getElementById('dash-chat');
  put(dash, 60);   // panelde sadece son satirlar
}
const chatInputState = new Map();
function inputChatState(inputId) {
  const key = `${effChatSlot()}:${inputId}`;
  if (!chatInputState.has(key)) chatInputState.set(key, {
    history: [], index: 0, draft: '', tab: null
  });
  return chatInputState.get(key);
}
function resetChatTab(inputId) { inputChatState(inputId).tab = null; }
function rememberChatInput(inputId, text) {
  const st = inputChatState(inputId);
  if (text && st.history[st.history.length - 1] !== text) st.history.push(text);
  if (st.history.length > 80) st.history.splice(0, st.history.length - 80);
  st.index = st.history.length; st.draft = ''; st.tab = null;
}
function moveChatHistory(inputId, direction) {
  const el = $(inputId); if (!el) return;
  const st = inputChatState(inputId);
  if (!st.history.length) return;
  if (st.index === st.history.length) st.draft = el.value;
  st.index = direction < 0 ? Math.max(0, st.index - 1) : Math.min(st.history.length, st.index + 1);
  el.value = st.index === st.history.length ? st.draft : st.history[st.index];
  el.setSelectionRange(el.value.length, el.value.length);
  st.tab = null;
}
async function completeChatInput(inputId) {
  const el = $(inputId); if (!el) return;
  const pos = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
  const before = el.value.slice(0, pos);
  const m = before.match(/(?:^|\s)([^\s]*)$/);
  if (!m || !m[1]) return;
  const token = m[1];
  const start = pos - token.length;
  const prefix = before.slice(0, start);
  const suffix = el.value.slice(pos);
  const st = inputChatState(inputId);
  const old = st.tab;
  const same = old && old.value === el.value && old.cursor === pos
    && old.prefix === prefix && old.suffix === suffix;
  let matches = same ? old.matches : [];
  if (!matches.length) {
    try {
      if (token.startsWith('/')) {
        matches = await bridge.bot.tabComplete(before, effChatSlot());
      } else {
        let names = await bridge.bot.players(effChatSlot());
        names = Array.isArray(names) ? names : [];
        const at = token.startsWith('@') ? '@' : '';
        const q = token.slice(at.length).toLowerCase();
        matches = names.filter((name) => String(name).toLowerCase().startsWith(q))
          .map((name) => at + name);
      }
    } catch (_) { matches = []; }
    matches = [...new Set((Array.isArray(matches) ? matches : [])
      .map((x) => String(x || '').trim()).filter(Boolean))];
  }
  if (!matches.length) return;
  const index = same ? (old.index + 1) % matches.length : 0;
  let replacement = matches[index];
  if (token.startsWith('/') && !replacement.startsWith('/')) replacement = '/' + replacement;
  const value = prefix + replacement + suffix;
  st.tab = { matches, index, value, cursor: prefix.length + replacement.length, prefix, suffix };
  el.value = value;
  el.setSelectionRange(st.tab.cursor, st.tab.cursor);
}
async function sendChat(inputId) {
  const el = $(inputId || 'chat-input');
  const v = el.value.trim();
  if (!v) return;
  const res = await bridge.bot.chat(v, effChatSlot());
  if (!res || !res.ok) { window.toast(T('tChatFail'), 'error'); return; }
  rememberChatInput(inputId || 'chat-input', v);
  el.value = '';
}

/* ============================= AUTO SPAM ================================== */
// Hangi hesabin listesi duzenleniyor? '' = ortak liste (tum hesaplar)
let spamProfile = '';
const SPAM_KEYS = ['messages', 'random', 'mode', 'interval', 'minDelay', 'maxDelay'];

function spamPerAcc() { return (cfg && cfg.autoSpam && cfg.autoSpam.perAccount) || {}; }
function spamHasOwn(id) { return !!(id && spamPerAcc()[id]); }
// Ekranda gosterilecek ayar: hesaba ozel varsa o, yoksa ortak
function spamView() {
  const base = (cfg && cfg.autoSpam) || {};
  const own = spamHasOwn(spamProfile) ? spamPerAcc()[spamProfile] : null;
  const v = Object.assign({}, base, own || {});
  if (!Array.isArray(v.messages)) v.messages = [];
  return v;
}
// Duzenleme ortak listeyi mi degistiriyor? (hesaba ozel liste yoksa evet)
function spamEditsShared() { return !spamHasOwn(spamProfile); }
function spamSave(partial) {
  if (spamEditsShared()) return save({ autoSpam: partial });
  return save({ autoSpam: { perAccount: { [spamProfile]: partial } } });
}

function fillSpam() {
  const list = accIdList();
  if (spamProfile && list.indexOf(spamProfile) === -1) spamProfile = '';
  renderSpamProfiles();
  const s = spamView();
  $('spam-random').checked = !!s.random; $('spam-mode').value = s.mode || 'fixed';
  $('spam-interval').value = s.interval; $('spam-min').value = s.minDelay; $('spam-max').value = s.maxDelay;
  updateSpamMode(false);
  $('spam-random').onchange = () => spamSave({ random: $('spam-random').checked });
  $('spam-interval').onchange = () => spamSave({ interval: Number($('spam-interval').value) });
  $('spam-min').onchange = () => spamSave({ minDelay: Number($('spam-min').value) });
  $('spam-max').onchange = () => spamSave({ maxDelay: Number($('spam-max').value) });
  applyFeatureUI();
}

// "Hangi hesabin mesajlari?" listesi
function renderSpamProfiles() {
  const sel = $('spam-profile'); if (!sel) return;
  const list = (cfg && cfg.accounts && cfg.accounts.list) ? cfg.accounts.list : [];
  const on = featList('autoSpam');
  sel.innerHTML = [`<option value="">${T('spamShared')}</option>`].concat(list.map((a) => {
    const tags = [];
    if (spamHasOwn(a.id)) tags.push(T('spamOwnTag'));
    if (on.indexOf(a.id) !== -1) tags.push(T('spamOnTag'));
    return `<option value="${attr(a.id)}">${esc(a.username)}${tags.length ? ' · ' + tags.join(' · ') : ''}</option>`;
  })).join('');
  sel.value = spamProfile;
  const wrap = $('spam-own-wrap'), note = $('spam-own-note'), own = $('spam-own');
  if (wrap) wrap.classList.toggle('hidden', !spamProfile);
  if (own) own.checked = spamHasOwn(spamProfile);
  if (note) note.classList.toggle('hidden', !spamProfile || spamHasOwn(spamProfile));
}

// START / STOP artik "Baglaninca otomatik baslat" (autoSpam feature) ile ilgili
// DEGILDIR: her basista hangi hesaplarda islem yapilacagi ayri bir pencerede
// sorulur, secim SADECE o anki islem icin kullanilir. featureAccounts /
// featureEnabled (baglaninca otomatik baslat listesi) hicbir sekilde
// degistirilmez - START'a basinca otomatik baslat'a hicbir sinyal gitmez.
async function spamRunAll(start) {
  if (!cfg) return;
  openSpamActPicker(start);
}
function updateSpamMode(persist) {
  const range = $('spam-mode').value === 'range';
  // "Rastgele aralik" secilince tek "Aralik" alani gizlenir, min/max gorunur
  $('spam-fixed-wrap').classList.toggle('hidden', range);
  $('spam-range-wrap').classList.toggle('hidden', !range);
  if (cfg && persist !== false) spamSave({ mode: $('spam-mode').value });
}
function persistSpamMessages(msgs) { return spamSave({ messages: msgs }).then(() => { renderSpamProfiles(); renderSpamList(); }); }
function renderSpamList() {
  const msgs = spamView().messages;
  $('spam-list').innerHTML = msgs.length ? msgs.map((m, i) => `
    <div class="item">
      <span class="sub">${i + 1}</span>
      <div class="main"><input type="text" data-mi="${i}" value="${attr(m)}" placeholder="${T('msgOne')} ${i + 1}" /></div>
      <button class="icon-btn" data-mup="${i}" title="${T('up')}">${window.ICON.up}</button>
      <button class="icon-btn" data-mdown="${i}" title="${T('down')}">${window.ICON.down}</button>
      <button class="icon-btn del" data-mdel="${i}" title="${T('rowDelete')}">${window.ICON.trash}</button>
    </div>`).join('') : `<div class="empty">${window.t('noMessages')}</div>`;
  try { window.enhanceScrollFade(); } catch (_) {}

  $('spam-list').querySelectorAll('[data-mi]').forEach((inp) => {
    inp.onchange = () => {
      const a = spamView().messages.slice();
      a[Number(inp.dataset.mi)] = inp.value;
      spamSave({ messages: a });
    };
  });
  const move = (i, d) => {
    const a = spamView().messages.slice(), j = i + d;
    if (j < 0 || j >= a.length) return;
    const t = a[i]; a[i] = a[j]; a[j] = t;
    persistSpamMessages(a);
  };
  $('spam-list').querySelectorAll('[data-mup]').forEach((b) => { b.onclick = () => move(Number(b.dataset.mup), -1); });
  $('spam-list').querySelectorAll('[data-mdown]').forEach((b) => { b.onclick = () => move(Number(b.dataset.mdown), 1); });
  $('spam-list').querySelectorAll('[data-mdel]').forEach((b) => {
    b.onclick = () => {
      const a = spamView().messages.slice();
      a.splice(Number(b.dataset.mdel), 1);
      persistSpamMessages(a);
    };
  });
}

/* =========================== JOIN MESSAGES ================================ */
function fillJoin() {
  $('join-reconnect').checked = cfg.joinMessages.runOnReconnect;
  $('join-reconnect').onchange = () => save({ joinMessages: { runOnReconnect: $('join-reconnect').checked } });
  // Ayni anahtar BAGLANTI sayfasinda da var: ikisi birlikte degisir
  applyFeatureUI();
}

/* ================= HESAP BAZLI AYARLAR (v1.13) ===========================
   BAGLANTI ve MAKROLAR sayfasindaki anahtarlar artik "hangi hesaplarda acik"
   listesiyle calisir. Anahtara basinca hesap secme penceresi acilir:
     - hic hesap yok  -> ayar KAPALI
     - bazi hesaplar  -> anahtar MOR yanar
     - tum hesaplar   -> anahtar SARI yanar
   Secili hesaplar sunucuya her girdiginde o ayar kendiliginden acilir.
   ======================================================================== */
const FEATURE_KEYS = ['offline', 'sneak', 'physics', 'antiAfk', 'autoReconnect',
  'joinMessages', 'worldChangeMessages', 'proxy', 'fakeHost', 'noChatSign',
  'vanillaLike', 'macroFarmer', 'autoSpam'];
const FEATURE_I18N = {
  offline: 'tOffline', sneak: 'tSneak', physics: 'tPhysics', antiAfk: 'antiAfk',
  autoReconnect: 'tAutoReconnect', joinMessages: 'tJoin',
  worldChangeMessages: 'tWorldChange', proxy: 'tProxy', fakeHost: 'fakeHost',
  noChatSign: 'tNoChatSign', vanillaLike: 'tVanilla', macroFarmer: 'macFarmer',
  autoSpam: 'autoSpamTitle', startup: 'startWithWindows'
};
const FEATURE_PAGE = { macroFarmer: 'macrosCaps', autoSpam: 'navSpam' };

function featLabel(key) { return T(FEATURE_I18N[key] || key); }
const PANEL_KEYS = FEATURE_KEYS;
function accIdList() {
  const l = (cfg && cfg.accounts && cfg.accounts.list) ? cfg.accounts.list : [];
  return l.map((a) => a.id);
}
// O an secili oturumun hesabi (yoksa listede secili olan)
function activeAccountId() {
  const slot = effChatSlot();
  const s = (slotInfo.list || []).find((x) => x.slot === slot);
  if (s && s.accountId) return s.accountId;
  if (cfg && cfg.accounts && cfg.accounts.selected) return cfg.accounts.selected;
  const l = accIdList();
  return l.length ? l[0] : '';
}
function featList(key) {
  const all = (cfg && cfg.featureAccounts) || {};
  const ids = accIdList();
  return (Array.isArray(all[key]) ? all[key] : []).filter((id) => ids.indexOf(id) !== -1);
}
// Ayar acik mi? Hesap secimi silinmeden kapatilabildigi icin ayri bayrak var.
function featEnabled(key) {
  const fe = (cfg && cfg.featureEnabled) || {};
  return fe[key] !== false && featList(key).length > 0;
}
function featState(key) {
  if (!featEnabled(key)) return 'off';
  const n = featList(key).length;
  return n >= accIdList().length ? 'all' : 'part';
}
function featOn(key) { return featState(key) !== 'off'; }
// Tek bir hesapta acik mi? (PANEL'deki hizli anahtarlar bunu kullanir)
function featOnFor(key, accountId) {
  return featEnabled(key) && !!accountId && featList(key).indexOf(accountId) !== -1;
}

// Anahtarlarin gorunumu: kapali / mor (bazi hesaplar) / sari (hepsi)
function applyFeatureUI() {
  if (!cfg) return;
  const total = accIdList().length;
  document.querySelectorAll('[data-feat]').forEach((el) => {
    const key = el.dataset.feat;
    const st = featState(key);
    const n = featList(key).length;
    el.checked = st !== 'off';
    el.classList.toggle('part', st === 'part');
    const lab = el.closest('.check');
    if (!lab) return;
    lab.classList.toggle('part', st === 'part');
    let b = lab.querySelector('.featn');
    if (!b) {
      b = document.createElement('i');
      b.className = 'featn';
      const anchor = lab.querySelector('.gear, .dtx');
      if (anchor) lab.insertBefore(b, anchor); else lab.appendChild(b);
    }
    b.textContent = n ? n + '/' + total : '';
    b.classList.toggle('hidden', !n);
  });
  paintDashTiles();
}

// Anahtara basinca hesap secme penceresi acilir (kapatirken de ayni pencere)
function bindFeatureSwitches(root) {
  (root || document).querySelectorAll('[data-feat]').forEach((el) => {
    if (el.dataset.featBound) return;
    el.dataset.featBound = '1';
    el.addEventListener('click', (e) => {
      e.preventDefault();
      // "Baglaninca otomatik baslat" da diger ayarlar gibi davranir:
      // checkbox'a her iki yonde de (acarken ve kapatirken) hesap secme
      // penceresi acilir. Kapatmak istedigin hesaplarin tikini kaldirirsin,
      // KAYDET'e basinca listeden cikar; sagdaki sayi (n/toplam) azalir,
      // hic hesap kalmazsa sayi kaybolur ve ayar kapanir.
      openFeatPicker(el.dataset.feat);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      el.click();
    });
  });
}

async function saveFeature(key, ids, enabled) {
  const valid = accIdList();
  const clean = [];
  (ids || []).forEach((id) => {
    if (valid.indexOf(id) !== -1 && clean.indexOf(id) === -1) clean.push(id);
  });
  const on = enabled === undefined ? clean.length > 0 : !!enabled;
  if (!cfg.featureAccounts) cfg.featureAccounts = {};
  if (!cfg.featureEnabled) cfg.featureEnabled = {};
  cfg.featureAccounts[key] = clean;
  cfg.featureEnabled[key] = on;
  await save({ featureAccounts: { [key]: clean }, featureEnabled: { [key]: on } });
  afterFeatureChange(key);
  return on ? clean : [];
}
// Bir ayar degisince ona bagli her yer tazelenir (senkron kalsin)
function afterFeatureChange(key) {
  applyFeatureUI();
  try { updateFakeHostField(); } catch (_) {}
  try { refreshDashboard(); } catch (_) {}
  if (key === 'joinMessages') { try { renderMacroOrder(); renderMacroPlan(); } catch (_) {} }
  if (key === 'macroFarmer') { try { renderMacro(); } catch (_) {} }
  if (key === 'autoSpam') { try { renderSpamProfiles(); } catch (_) {} }
}

/* --- hesap secme penceresi ------------------------------------------------ */
let featPick = null;
let spamAct = null;
function openFeatPicker(key) {
  if (!cfg) return;
  vpnPick = null;
  spamAct = null;
  $('am-off').classList.remove('hidden');
  featPick = { key, sel: featList(key) };
  const sub = document.querySelector('#acc-modal [data-i18n="amSub"]'); if (sub) sub.textContent = T('amSub');
  const t = $('am-title'); if (t) t.textContent = featLabel(key);
  renderFeatPicker();
  const m = $('acc-modal'); if (m) m.classList.remove('hidden');
}
function closeFeatPicker() {
  featPick = null;
  const m = $('acc-modal'); if (m) m.classList.add('hidden');
}
// AYARLAR > "Baslangicta acilsin": disli kaldirildi. Diger ayarlar gibi
// checkbox'a basinca (acarken ve kapatirken) hesap secme penceresi acilir.
function openStartupPicker() {
  if (!cfg) return;
  vpnPick = null;
  spamAct = null;
  featPick = { key: 'startup', sel: (cfg.settings.startupAccounts || []).slice() };
  $('am-off').classList.remove('hidden');
  const t = $('am-title'); if (t) t.textContent = T('startWithWindows');
  const sub = document.querySelector('#acc-modal [data-i18n="amSub"]');
  if (sub) sub.textContent = T('startupSub');
  renderFeatPicker();
  const m = $('acc-modal'); if (m) m.classList.remove('hidden');
}
// Checkbox durumu + sayac (diger ayarlar gibi): n/toplam rozeti, MOR = bazi
// hesaplar, SARI (varsayilan) = tum hesaplar, hesap yoksa rozet kaybolur.
function paintStartupRow() {
  const el = $('s-startup'); const lab = el ? el.closest('.check') : null;
  if (!el || !lab || !cfg) return;
  const ids = (cfg.settings.startupAccounts || []).filter((id) => accIdList().indexOf(id) !== -1);
  const total = accIdList().length;
  const n = ids.length;
  const all = total > 0 && n >= total;
  el.checked = n > 0;
  el.classList.toggle('part', n > 0 && !all);
  lab.classList.toggle('part', n > 0 && !all);
  let b = lab.querySelector('.featn');
  if (!b) {
    b = document.createElement('i');
    b.className = 'featn';
    const anchor = lab.querySelector('.gear, .dtx');
    if (anchor) lab.insertBefore(b, anchor); else lab.appendChild(b);
  }
  b.textContent = n ? n + '/' + total : '';
  b.classList.toggle('hidden', !n);
}
function renderFeatPicker() {
  const pick = featPick || spamAct;
  if (!pick) return;
  const box = $('am-list'); if (!box) return;
  const list = (cfg.accounts && cfg.accounts.list) ? cfg.accounts.list : [];
  const live = {};
  (slotInfo.list || []).forEach((x) => { live[x.accountId] = x; });
  box.innerHTML = list.length
    ? list.map((a) => {
      const on = pick.sel.indexOf(a.id) !== -1;
      const s = live[a.id];
      const tag = s ? '#' + s.slot : T(a.type === 'microsoft' ? 'amPremium' : 'amCracked');
      return `<button class="amrow${on ? ' on' : ''}" data-amid="${attr(a.id)}">
        <i class="amck"></i><span class="amname">${esc(a.username)}</span>
        <span class="amtag${s ? ' live' : ''}">${esc(tag)}</span></button>`;
    }).join('')
    : `<p class="hint">${esc(T('amNoAcc'))}</p>`;
  box.querySelectorAll('[data-amid]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.amid;
      const i = pick.sel.indexOf(id);
      if (i === -1) pick.sel.push(id); else pick.sel.splice(i, 1);
      renderFeatPicker();
    };
  });
  const c = $('am-count'); if (c) c.textContent = pick.sel.length + '/' + list.length;
}
// enabled=false ile cagrilirsa hesap secimi SILINMEZ, ayar sadece kapanir
async function commitFeatPicker(ids, enabled) {
  if (!featPick) return;
  const key = featPick.key;
  const label = featLabel(key);
  closeFeatPicker();
  if (key === 'startup') {
    const valid = accIdList();
    const clean = (ids || []).filter((id) => valid.indexOf(id) !== -1);
    const on = enabled === undefined ? clean.length > 0 : !!enabled;
    cfg.settings.startupAccounts = on ? clean : [];
    await save({ settings: { startupAccounts: on ? clean : [], startWithWindows: on } });
    paintStartupRow();
    window.toast(on
      ? T('tFeatSaved').replace('{s}', label).replace('{n}', String(clean.length))
      : T('tFeatOff').replace('{s}', label),
      on ? 'ok' : 'info');
    return;
  }
  const saved = await saveFeature(key, ids, enabled);
  window.toast(saved.length
    ? T('tFeatSaved').replace('{s}', label).replace('{n}', String(saved.length))
    : (key === 'autoSpam' ? T('tAutoSpamOff') : T('tFeatOff').replace('{s}', label)),
    saved.length ? 'ok' : 'info');
}

/* --- START / STOP icin gecici hesap secimi --------------------------------
   AUTO SPAM sayfasindaki BASLAT/DURDUR, "Baglaninca otomatik baslat" ayarindan
   tamamen bagimsizdir. Bu picker hicbir ayara yazmaz; secilen hesaplarda
   spamMany uzerinden islem yapar ve biter. */
function openSpamActPicker(start) {
  if (!cfg) return;
  vpnPick = null;
  featPick = null;
  const all = accIdList();
  // Varsayilan secim: BASLAT icin bagli olan hesaplar,
  // DURDUR icin su an spam'i DONEN hesaplar.
  const sel = (slotInfo.list || [])
    .filter((x) => all.indexOf(x.accountId) !== -1 && (start ? true : !!x.spam))
    .map((x) => x.accountId);
  spamAct = { start: !!start, sel };
  $('am-off').classList.add('hidden');   // gecici islem: "ayari kapat" yok
  const t = $('am-title'); if (t) t.textContent = T(start ? 'spamStartAsk' : 'spamStopAsk');
  const sub = document.querySelector('#acc-modal [data-i18n="amSub"]');
  if (sub) sub.textContent = T(start ? 'spamStartSub' : 'spamStopSub');
  renderFeatPicker();
  const m = $('acc-modal'); if (m) m.classList.remove('hidden');
}
function closeSpamActPicker() {
  spamAct = null;
  const m = $('acc-modal'); if (m) m.classList.add('hidden');
}
// Secim SADECE o anki islemde kullanilir: hicbir ayara/fonksiyona yazilmaz.
async function commitSpamAct() {
  if (!spamAct) return;
  const start = spamAct.start;
  const ids = spamAct.sel.slice();
  closeSpamActPicker();
  if (!ids.length) { window.toast(T('tSpamPickFirst'), 'warn'); return; }
  const live = (slotInfo.list || []).filter((x) => ids.indexOf(x.accountId) !== -1);
  if (!live.length) { window.toast(T('tSpamNoLive'), 'warn'); return; }
  const r = await bridge.bot.spamMany({ start, accountIds: ids });
  const names = (r && r.list ? r.list : []).filter((x) => x.ok).map((x) => x.name || accNameOf(x.accountId)).filter(Boolean);
  if (r && r.ok) window.toast((start ? T('tSpamStarted') : T('tSpamStopped')) + (names.length ? ': ' + names.join(', ') : ''), start ? 'ok' : 'info');
  else window.toast(T(start ? 'tSpamStartFail' : 'tSpamStopFail'), 'error');
}

/* --- PANEL'e sabitlenen ayarlar ------------------------------------------ */
function dashTiles() {
  const l = (cfg && cfg.settings && cfg.settings.dashTiles) || [];
  return Array.isArray(l) ? l.filter((k) => PANEL_KEYS.indexOf(k) !== -1) : [];
}
// PANEL'deki anahtarlar SADECE o an secili hesaba etki eder: hesap sormaz.
function renderDashTiles() {
  const box = $('dash-tiles'); if (!box) return;
  const keys = dashTiles();
  box.innerHTML = keys.map((k) => `<label class="check dashtile" data-tip-key="${k}">
      <input type="checkbox" data-featacc="${k}" />
      <span>${esc(featLabel(k))}</span>
      <button class="icon-btn dtx" data-dtx="${k}" title="${attr(T('remove'))}">×</button>
    </label>`).join('');
  box.classList.toggle('hidden', !keys.length);
  const hint = $('dash-tiles-empty'); if (hint) hint.classList.toggle('hidden', !!keys.length);
  box.querySelectorAll('[data-dtx]').forEach((b) => {
    b.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      await save({ settings: { dashTiles: dashTiles().filter((x) => x !== b.dataset.dtx) } });
      renderDashTiles();
    };
  });
  box.querySelectorAll('[data-featacc]').forEach((el) => {
    el.addEventListener('click', (e) => { e.preventDefault(); toggleFeatureForActive(el.dataset.featacc); });
  });
  paintDashTiles();
}
// Panelde secili hesabin durumu
function paintDashTiles() {
  const acc = activeAccountId();
  document.querySelectorAll('[data-featacc]').forEach((el) => { el.checked = featOnFor(el.dataset.featacc, acc); el.classList.remove('part'); });
  const who = $('dash-quick-who');
  if (who) {
    const a = (cfg && cfg.accounts && cfg.accounts.list || []).find((x) => x.id === acc);
    who.textContent = a ? a.username : '-';
  }
}
async function toggleFeatureForActive(key) {
  const acc = activeAccountId();
  // NOT: tarayici, preventDefault edilen bir kutuyu biz boyadiktan SONRA eski
  // haline dondurur. Bu yuzden bir sonraki karede tekrar boyuyoruz.
  const repaint = () => setTimeout(paintDashTiles, 0);
  if (!acc) { window.toast(T('tAddAccountFirst'), 'warn'); repaint(); return; }
  const cur = featList(key);
  const has = featOnFor(key, acc);
  const next = has ? cur.filter((x) => x !== acc) : cur.concat(cur.indexOf(acc) === -1 ? [acc] : []);
  await saveFeature(key, next, true);
  repaint();
  const a = (cfg.accounts.list || []).find((x) => x.id === acc);
  window.toast(featLabel(key) + ' · ' + (a ? a.username : '') + ' · ' + T(has ? 'stateOff' : 'stateOn'),
    has ? 'info' : 'ok');
}
let tilePick = null;
function openTilePicker() {
  tilePick = dashTiles();
  renderTilePicker();
  const m = $('feat-modal'); if (m) m.classList.remove('hidden');
}
function closeTilePicker() {
  tilePick = null;
  const m = $('feat-modal'); if (m) m.classList.add('hidden');
}
function renderTilePicker() {
  if (!tilePick) return;
  const box = $('fp-list'); if (!box) return;
  box.innerHTML = PANEL_KEYS.map((k) => {
    const on = tilePick.indexOf(k) !== -1;
    const st = featState(k);
    const tag = T(FEATURE_PAGE[k] || 'navConnect');
    return `<button class="amrow${on ? ' on' : ''}" data-fpk="${k}">
      <i class="amck"></i><span class="amname">${esc(featLabel(k))}</span>
      <span class="amtag${st === 'off' ? '' : ' live'}">${esc(tag)}</span></button>`;
  }).join('');
  box.querySelectorAll('[data-fpk]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.fpk;
      const i = tilePick.indexOf(k);
      if (i === -1) tilePick.push(k); else tilePick.splice(i, 1);
      renderTilePicker();
    };
  });
}

// Eski isim: artik sadece gorunumu tazeler (deger featureAccounts'ta tutulur)
function syncToggle() { applyFeatureUI(); }
function persistJoin() { return save({ joinMessages: { commands: cfg.joinMessages.commands } }).then(renderJoinList); }
function renderJoinList() {
  const cmds = cfg.joinMessages.commands;
  $('join-list').innerHTML = cmds.length ? cmds.map((c, i) => `
    <div class="item">
      <label class="check tiny-check"><input type="checkbox" data-jen="${i}" ${c.enabled ? 'checked' : ''} /></label>
      <span class="sub">${i + 1}</span>
      <div class="main"><div class="masked-wrap"><input type="text" data-jc="${i}" value="${attr(c.command)}" placeholder="/login ********" spellcheck="false" /></div></div>
      <input type="number" data-jd="${i}" value="${c.delay}" min="0" style="width:84px" title="${T('delaySec')}" />
      <span class="sub">${T('secShort')}</span>
      <button class="icon-btn del" data-jdel="${i}" title="${T('rowDelete')}">${window.ICON.trash}</button>
    </div>`).join('') : `<div class="empty">${window.t('noCommands')}</div>`;
  try { window.enhanceScrollFade(); } catch (_) {}

  const upd = (i, key, val) => {
    cfg.joinMessages.commands[i][key] = val;
    save({ joinMessages: { commands: cfg.joinMessages.commands } });
    try { renderMacroOrder(); renderMacroPlan(); } catch (_) {}
  };
  $('join-list').querySelectorAll('[data-jc]').forEach((el) => {
    el.onchange = () => { upd(Number(el.dataset.jc), 'command', maskedValue(el)); };
    el.oninput = () => refreshMask(el, { fromInput: true });
    refreshMask(el);
  });
  $('join-list').querySelectorAll('[data-jd]').forEach((el) => { el.onchange = () => upd(Number(el.dataset.jd), 'delay', Number(el.value)); });
  $('join-list').querySelectorAll('[data-jen]').forEach((el) => { el.onchange = () => upd(Number(el.dataset.jen), 'enabled', el.checked); });
  $('join-list').querySelectorAll('[data-jdel]').forEach((b) => {
    b.onclick = () => { cfg.joinMessages.commands.splice(Number(b.dataset.jdel), 1); persistJoin(); };
  });
  // MAKROLAR sayfasindaki "sunucuya girince sira" onizlemesi ile senkron
  try { renderMacroOrder(); renderMacroPlan(); } catch (_) {}
}

/* ---- /login ve /register komutlarinda sifreyi gizleme ------------------- */
// Komut "/login" veya "/register" ile basliyorsa ilk bosluktan sonrasi
// yildizla gosterilir; sagdaki goz tusu ile gercek metin gorulebilir.
const SECRET_CMD = /^\s*\/?(login|register|reg|l)\b/i;

function maskedValue(el) {
  return el.dataset.real !== undefined ? el.dataset.real : el.value;
}

// Ekranda gorunen (yildizli) metinde yapilan bir duzenlemeyi, gercek (sifreli)
// metne uygular. Imlec konumunu ve uzunluk farkini kullanarak eklenen/silinen
// karakterleri hesaplar; boylece yildizlarin hepsi ayni karakter oldugu icin
// olusabilecek belirsizlikten kacinilir.
function reconcileMaskedEdit(oldMasked, newVisible, oldReal, cursor) {
  if (cursor == null) cursor = newVisible.length;
  const delta = newVisible.length - oldMasked.length;
  if (delta > 0) {
    // Ekleme: yeni karakterler imlecin hemen oncesine eklenmis kabul edilir.
    const insertPos = Math.max(0, Math.min(oldReal.length, cursor - delta));
    const inserted = newVisible.slice(insertPos, cursor);
    return oldReal.slice(0, insertPos) + inserted + oldReal.slice(insertPos);
  }
  if (delta < 0) {
    // Silme (Backspace/Delete/secim silme): imlecten "delta" kadar karakter
    // silinmis kabul edilir.
    const removeEnd = Math.min(oldReal.length, cursor - delta);
    const removeStart = Math.max(0, Math.min(removeEnd, cursor));
    return oldReal.slice(0, removeStart) + oldReal.slice(removeEnd);
  }
  // Ayni uzunlukta bir degisiklik (secili kismi ayni uzunlukta bir metinle
  // degistirme gibi): basit onek/sonek karsilastirmasina dus.
  let start = 0;
  const minLen = Math.min(oldMasked.length, newVisible.length);
  while (start < minLen && oldMasked[start] === newVisible[start]) start++;
  let endOld = oldMasked.length, endNew = newVisible.length;
  while (endOld > start && endNew > start && oldMasked[endOld - 1] === newVisible[endNew - 1]) {
    endOld--; endNew--;
  }
  const inserted = newVisible.slice(start, endNew);
  return oldReal.slice(0, start) + inserted + oldReal.slice(endOld);
}

function refreshMask(el, opts) {
  opts = opts || {};
  let real = el.dataset.real !== undefined ? el.dataset.real : el.value;

  if (opts.fromInput && el.dataset.real !== undefined && el.dataset.masked !== undefined) {
    real = reconcileMaskedEdit(el.dataset.masked, el.value, el.dataset.real, el.selectionStart);
  }

  const secret = SECRET_CMD.test(real) && /\s\S/.test(real);
  if (!secret) {
    delete el.dataset.real;
    delete el.dataset.masked;
    removeMaskEye(el);
    return;
  }
  el.dataset.real = real;
  addMaskEye(el);
  const cursor = el.selectionStart;
  if (el.dataset.revealed === '1') {
    el.value = real;
    el.dataset.masked = real;
    return;
  }
  const i = real.indexOf(' ');
  const masked = real.slice(0, i + 1) + '*'.repeat(Math.max(0, real.length - i - 1));
  el.value = masked;
  el.dataset.masked = masked;
  if (opts.fromInput && cursor != null) {
    try { el.setSelectionRange(cursor, cursor); } catch (_) {}
  }
}
function addMaskEye(el) {
  const wrap = el.closest('.masked-wrap');
  if (!wrap || wrap.querySelector('.pweye')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pweye';
  b.tabIndex = -1;
  b.title = T('showPass');
  b.innerHTML = window.EYE_OPEN;
  b.onclick = (e) => {
    e.preventDefault();
    const on = el.dataset.revealed !== '1';
    el.dataset.revealed = on ? '1' : '0';
    b.innerHTML = on ? window.EYE_OFF : window.EYE_OPEN;
    b.title = T(on ? 'hidePass' : 'showPass');
    refreshMask(el);
  };
  wrap.appendChild(b);
}
function removeMaskEye(el) {
  const wrap = el.closest('.masked-wrap');
  const b = wrap && wrap.querySelector('.pweye');
  if (b) b.remove();
  delete el.dataset.revealed;
}


/* ============== Sag tik aciklamalari (anahtarlarin ne ise yaradigi) ======= */
window.TIPS = {
  tr: {
    offline: 'Cracked (premium olmayan) sunucular için. Açıkken Microsoft doğrulaması yapılmaz, sadece kullanıcı adıyla girilir. '
      + 'DonutSMP, Hypixel gibi premium sunucularda KAPALI olmalı.',
    sneak: 'Bot sürekli eğilmiş (Shift) durur. Bazı AFK havuzlarında düşmemek veya daha az göze batmak için kullanılır.',
    physics: 'Bot fiziği: yürüme, düşme, çarpışma hesaplanır. Kapatırsan bot hiç hareket etmez ve işlemci kullanımı biraz azalır.',
    antiAfk: 'Sunucunun "hareketsiz" diye atmasını engeller: belirli aralıklarla yürür, zıplar, sağa sola bakar. '
      + 'Ayrıntılı ayarlar yanındaki dişli tuşunda.',
    autoReconnect: 'Bağlantı koparsa kendiliğinden yeniden bağlanır. Bekleme süresi ve deneme sayısı yanındaki dişli tuşunda.',
    joinMessages: 'Oyuna girdikten sonra sırayla komut/mesaj gönderir (örnek: /login şifre). GİRİŞ KOMUTLARI sayfasından düzenlenir.',
    worldChangeMessages: 'Sunucu içinde dünya veya alt sunucu değişince (lobi -> spawn) giriş komutlarını tekrar gönderir.',
    proxy: 'Bağlantıyı SOCKS4/SOCKS5/HTTP proxy üzerinden kurar. IP engeli varsa veya farklı bir ülke IP\'si gerekiyorsa kullan.',
    fakeHost: 'El sıkışmada sunucuya başka bir adres bildirir (örnek: hub.example.com). Bazı ağlar bunu ister. '
      + 'Açtığında BİLGİLER kartında sahte host alanı görünür.',
    noChatSign: 'Açıkken sohbet mesajları imzalanmadan gönderilir. Bazı sunucular (özellikle Velocity/BungeeCord ağları) imzalı '
      + 'sohbet paketlerinde hata verip "An internal error occurred in your connection." diyerek atar.',
    vanillaLike: 'İstemci kendini vanilla Minecraft gibi tanıtır (brand paketi "vanilla"). Bot koruması olan sunucularda açık kalması daha güvenli.',
    'rc-enabled': 'Bağlantı koparsa kendiliğinden yeniden bağlanır.',
    'r-unlimited': 'Sınırsız deneme: bağlantı kurulana kadar tekrar dener. Kapatırsan "En fazla deneme" kadar dener.',
    'spam-random': 'Mesajları listedeki sırayla değil rastgele gönderir.',
    'spam-autostart': 'Bot oyuna girer girmez otomatik mesaj göndermeye başlar.',
    'join-enabled': 'Giriş komutlarını açar/kapatır. Bu anahtar BAĞLANTI sayfasındaki "Giriş komutları" ile aynıdır.',
    'join-reconnect': 'Her yeniden bağlanmada giriş komutlarını tekrar gönderir (kayıt/giriş gerektiren sunucularda gerekli).',
    'dg-show': 'Sunucu ekranda form açarsa (kayıt/giriş) aynı form uygulamada da gösterilir; elle doldurup gönderebilirsin.',
    'dg-auto': 'Formdaki şifre alanlarını kayıtlı şifreyle doldurup gecikme sonunda kendiliğinden gönderir. '
      + 'Sen yazmaya başlarsan otomatik gönderim iptal olur.',
    'dg-cmdmode': 'Form cevabını paket olarak değil sohbet komutu olarak gönderir (örnek: /register şifre şifre).',
    'afk-enabled': 'Anti AFK motorunu açar/kapatır. Değişiklikler anında uygulanır.',
    'afk-random': 'Hareketleri rastgele sıralar, daha insan gibi görünür.',
    'afk-walk': 'Kısa mesafeler yürür.',
    'afk-jump': 'Aralıklarla zıplar.',
    'afk-sneak': 'Aralıklarla eğilir (Shift).',
    'afk-rotate': 'Kendi etrafında döner.',
    'afk-look': 'Rastgele yönlere bakar.',
    's-startup': 'Bilgisayar açılınca uygulama kendiliğinden başlar. Checkbox\'a basınca hangi hesapların '
      + 'otomatik bağlanacağını seçersin.',
    's-notify': 'Sadece gerçekten önemli olaylarda (hata, sunucudan atılma) Windows bildirimi gösterir.',
    's-lowcpu': 'Animasyonları ve güncelleme sıklığını azaltır; zayıf bilgisayarlarda işlemciyi rahatlatır.',
    's-mem': 'Sohbet ve kayıt satırlarını daha az tutar; uygulama daha az RAM kullanır.',
    's-packetlog': 'Paket günlüğü açıkken sunucuyla alınıp verilen tüm paket adları KAYITLAR sayfasına yazılır. '
      + 'Bağlantı takılıyorsa açın, bir kez bağlanmayı deneyin ve kaydı paylaşın. Sadece hata ayıklama içindir.',
    lvl: 'Bu seviyedeki kayıt satırlarını gösterir veya gizler.'
  },
  en: {
    offline: 'For cracked (non-premium) servers. When on, no Microsoft check is done and the bot joins with the username only. '
      + 'Keep it OFF on premium servers such as DonutSMP or Hypixel.',
    sneak: 'The bot stays sneaking (Shift) all the time. Useful in some AFK pools to avoid falling or being noticed.',
    physics: 'Bot physics: walking, falling and collision are simulated. With it off the bot never moves and uses slightly less CPU.',
    antiAfk: 'Stops the server from kicking you for being idle: walks, jumps and looks around at intervals. '
      + 'Detailed options are behind the gear button next to it.',
    autoReconnect: 'Reconnects by itself if the connection drops. Delay and attempt count are behind the gear button.',
    joinMessages: 'Sends commands/messages in order after joining (e.g. /login password). Edit them on the JOIN MESSAGES page.',
    worldChangeMessages: 'Re-sends the join commands when the world or sub-server changes (lobby -> spawn).',
    proxy: 'Connects through a SOCKS4/SOCKS5/HTTP proxy. Use it when your IP is blocked or you need another country IP.',
    fakeHost: 'Reports a different address to the server during the handshake (e.g. hub.example.com). Some networks require it. '
      + 'When on, the fake host field appears in the INFORMATION card.',
    noChatSign: 'Chat messages are sent unsigned. Some servers (especially Velocity/BungeeCord networks) fail on signed chat '
      + 'packets and kick you with "An internal error occurred in your connection."',
    vanillaLike: 'The client identifies itself as vanilla Minecraft (brand packet "vanilla"). Safer on servers with anti-bot checks.',
    'rc-enabled': 'Reconnects by itself if the connection drops.',
    'r-unlimited': 'Unlimited attempts: keeps retrying until it connects. With it off only "Max attempts" tries are made.',
    'spam-random': 'Sends the messages in random order instead of list order.',
    'spam-autostart': 'The bot starts sending the messages as soon as it joins.',
    'join-enabled': 'Turns join messages on or off. This is the same switch as "Join messages" on the CONNECT page.',
    'join-reconnect': 'Sends the join commands again on every reconnect (needed on servers with register/login).',
    'dg-show': 'If the server opens a form (register/login), the same form is shown in the app so you can fill and submit it.',
    'dg-auto': 'Fills the password fields with the saved password and submits after the delay. '
      + 'If you start typing, the automatic submit is cancelled.',
    'dg-cmdmode': 'Sends the form answer as a chat command instead of a packet (e.g. /register pass pass).',
    'afk-enabled': 'Turns the Anti AFK engine on or off. Changes apply instantly.',
    'afk-random': 'Shuffles the movements so they look more human.',
    'afk-walk': 'Walks short distances.',
    'afk-jump': 'Jumps at intervals.',
    'afk-sneak': 'Sneaks (Shift) at intervals.',
    'afk-rotate': 'Spins around.',
    'afk-look': 'Looks in random directions.',
    's-startup': 'The app starts by itself when the computer starts. Click the checkbox to pick which '
      + 'accounts connect automatically.',
    's-notify': 'Shows a Windows notification on important events (connected, kicked).',
    's-lowcpu': 'Reduces animations and update frequency; easier on weak computers.',
    's-mem': 'Keeps fewer chat and log lines so the app uses less RAM.',
    's-packetlog': 'With the packet log on, every packet name sent to and from the server is written to the LOGS page. '
      + 'Turn it on if connecting gets stuck, try connecting once and share the log. Debug only.',
    lvl: 'Shows or hides the log lines of this level.'
  }
};

/* ==================== SUNUCU EKRANLARI (DIALOG) ============================ */
function fillDialogSettings() {
  const d = cfg.dialogs || {};
  $('dg-show').checked = d.show !== false;
  $('dg-auto').checked = !!d.autoAnswer;
  $('dg-delay').value = d.delay === undefined ? 2 : d.delay;
  $('dg-passinfo').textContent = d.hasPassword ? '✓' : '—';

  $('dg-show').onchange = () => save({ dialogs: { show: $('dg-show').checked } });
  $('dg-auto').onchange = async () => {
    await save({ dialogs: { autoAnswer: $('dg-auto').checked } });
    if ($('dg-auto').checked && !cfg.dialogs.hasPassword) window.toast(T('tPassFirst'), 'warn');
  };
  $('dg-delay').onchange = () => save({ dialogs: { delay: Number($('dg-delay').value) || 0 } });
  $('dg-cmdmode').checked = !!d.commandMode;
  $('dg-cmdtpl').value = d.commandTemplate || '';
  $('dg-cmdmode').onchange = async () => {
    await save({ dialogs: { commandMode: $('dg-cmdmode').checked } });
    if ($('dg-cmdmode').checked && !$('dg-cmdtpl').value.trim()) window.toast(T('tCmdTplNeed'), 'warn');
  };
  $('dg-cmdtpl').onchange = () => save({ dialogs: { commandTemplate: $('dg-cmdtpl').value.trim() } });
  $('dg-save').onclick = async () => {
    const v = $('dg-pass').value;
    if (!v) return window.toast(T('tPassEmpty'), 'warn');
    await save({ dialogs: { password: v } });
    $('dg-pass').value = '';
    cfg = await bridge.config.get();
    $('dg-passinfo').textContent = '✓';
    window.toast(T('tPassSaved'), 'ok');
  };
  $('dg-clear').onclick = async () => {
    await save({ dialogs: { clearPassword: true } });
    cfg = await bridge.config.get();
    $('dg-pass').value = '';
    $('dg-passinfo').textContent = '—';
    window.toast(T('tPassDeleted'), 'info');
  };
}

let currentDialog = null;
function showDialog(d) {
  currentDialog = d;
  $('dlg-title').textContent = (d.title || T('dlgTitle')).toUpperCase();
  const who = d.slot ? (slotInfo.list.find((x) => x.slot === d.slot) || {}) : {};
  const sub = $('dlg-sub');
  if (sub) sub.textContent = d.slot ? `#${d.slot} ${who.name || ''} · ${T('dlgSub')}` : T('dlgSub');
  $('dlg-body').innerHTML = (d.body || []).map((line) => `<div>${esc(line)}</div>`).join('');

  const inputs = d.inputs || [];
  $('dlg-fields').innerHTML = inputs.length ? inputs.map((i, idx) => {
    const isPass = /sifre|şifre|password|pass|parola/i.test((i.key || '') + ' ' + (i.label || ''));
    if (i.options && i.options.length) {
      return `<label class="field"><span>${esc(i.label)}</span>
        <select data-din="${idx}">${i.options.map((o) => `<option value="${attr(o.id)}">${esc(o.label)}</option>`).join('')}</select></label>`;
    }
    return `<label class="field"><span>${esc(i.label)}</span>
      <input data-din="${idx}" type="${isPass ? 'password' : 'text'}" maxlength="${Number(i.maxLength) || 128}"
        value="${attr(i.initial || '')}" autocomplete="off" /></label>`;
  }).join('') : '';

  const btns = (d.buttons && d.buttons.length) ? d.buttons : [{ index: 0, label: 'GONDER' }];
  $('dlg-buttons').innerHTML = btns.map((b, i) =>
    `<button class="btn ${i === 0 ? 'primary' : 'ghost'}" data-dbtn="${b.index}">${esc(b.label || 'GONDER')}</button>`).join('');
  $('dlg-buttons').querySelectorAll('[data-dbtn]').forEach((b) => { b.onclick = () => submitDialog(Number(b.dataset.dbtn)); });
  try {
    window.enhanceSelects($('dlg-fields'));
    window.enhanceNumbers($('dlg-fields'));
    window.enhancePasswords($('dlg-fields'));
  } catch (_) {}

  $('dlg-cmd').value = (cfg && cfg.dialogs && cfg.dialogs.commandTemplate) || d.suggestion || '';
  $('dlg-status').textContent = inputs.length ? '' : T('dlgWaitChoice');
  const adv = $('dlg-adv'); const advBtn = document.querySelector('[data-adv="dlg-adv"]');
  if (adv) adv.classList.remove('open');
  if (advBtn) advBtn.classList.remove('open');
  startAutoCountdown(Number(d.autoIn) || 0);
  $('dlg-modal').classList.remove('hidden');
  const first = $('dlg-fields').querySelector('input, select');
  if (first) setTimeout(() => first.focus(), 60);
  window.toast(T('tDlgOpened') + (d.title || 'form'), 'warn');
}

function dialogValues() {
  const values = {};
  (currentDialog && currentDialog.inputs || []).forEach((inp, idx) => {
    const el = $('dlg-fields').querySelector(`[data-din="${idx}"]`);
    values[inp.key] = el ? el.value : (inp.initial || '');
  });
  return values;
}

let autoTick = null;
function stopAutoCountdown(tellMain) {
  if (autoTick) { clearInterval(autoTick); autoTick = null; }
  $('dlg-auto-bar').classList.add('hidden');
  if (tellMain) bridge.dialog.cancelAuto(currentDialog && currentDialog.slot);
}
function startAutoCountdown(seconds) {
  stopAutoCountdown(false);
  if (!seconds) return;
  let left = seconds;
  const bar = $('dlg-auto-bar');
  bar.classList.remove('hidden');
  const paint = () => { $('dlg-auto-text').textContent = window.tf('dlgAutoIn', left); };
  paint();
  autoTick = setInterval(() => {
    left--;
    if (left <= 0) { stopAutoCountdown(false); $('dlg-status').textContent = T('dlgAutoSent'); return; }
    paint();
  }, 1000);
  // Kullanici alanlara dokunursa otomatik gonderim iptal
  $('dlg-fields').querySelectorAll('input, select').forEach((el) => {
    el.addEventListener('input', () => { if (autoTick) { stopAutoCountdown(true); window.toast(T('tAutoStopped'), 'info'); } }, { once: true });
  });
}

async function submitDialogAsCommand() {
  const tpl = $('dlg-cmd').value.trim();
  if (!tpl) return window.toast(T('tCmdTplNeed'), 'warn');
  $('dlg-status').textContent = T('dlgSendingCmd');
  const r = await bridge.dialog.command(tpl, dialogValues(), currentDialog && currentDialog.slot);
  if (r && r.ok) {
    window.toast(r.mode === 'queued' ? T('tDlgCmdQueued') : T('tDlgCmdSent'), r.mode === 'queued' ? 'warn' : 'ok');
    $('dlg-modal').classList.add('hidden');
  } else {
    $('dlg-status').textContent = T('tDlgFail') + ((r && r.error) || '?');
  }
}

async function submitDialog(index) {
  stopAutoCountdown(true);
  const values = dialogValues();
  $('dlg-status').textContent = T('dlgSending');
  const r = await bridge.dialog.submit(index, values, currentDialog && currentDialog.slot);
  if (r && r.ok) {
    const queued = r.mode === 'queued';
    window.toast(queued ? T('tDlgQueued') : T('tDlgSent'), queued ? 'warn' : 'ok');
    $('dlg-modal').classList.add('hidden');
  } else {
    $('dlg-status').textContent = T('tDlgFail') + ((r && r.error) || '?') + T('dlgTryCmd');
    window.toast(T('tDlgFail') + ((r && r.error) || ''), 'error');
  }
}

/* ============================== ANTI AFK ================================== */
/* ============================ MAKROLAR ==================================== */
/* Auto Farm: komutu yazar, acilan sandik ekranindaki secili karelere
   SIRAYLA tiklar. Kare sayilari Minecraft penceresindeki slot numaralaridir
   (0-53: 9 kolon x 6 satir). Adim listesi cfg.macros.farmer.steps icinde. */
const MACRO_COLS = 9;
const MACRO_ROWS = 6;
let macroState = { running: false, index: -1, cycles: 0, total: 0, clicks: 0 };
let macroPeek = null;          // son okunan ekranin esyalari

// Tiklama turleri (window_click paketindeki mouseButton + mode ikilisi)
const CLICK_KEYS = ['left', 'right', 'shift', 'shiftRight'];
const CLICK_LBL = { left: 'macClickLeft', right: 'macClickRight', shift: 'macClickShift', shiftRight: 'macClickShiftRight' };
function clickKey(st) { return CLICK_KEYS.indexOf(st && st.click) >= 0 ? st.click : 'left'; }

// Minecraft metinleri bazen nesne olarak gelir; "[object Object]" yazmasin diye
// her zaman duz yaziya cevrilir.
function mcText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') {
    const t = v.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return mcText(JSON.parse(t)); } catch (_) { return v.replace(/§./g, ''); }
    }
    return v.replace(/§./g, '');
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(mcText).join('');
  if (typeof v === 'object') {
    let out = '';
    if (v.text !== undefined) out += mcText(v.text);
    if (!out && v.value !== undefined) out += mcText(v.value);
    if (!out && v.translate !== undefined) out += mcText(v.translate);
    if (Array.isArray(v.extra)) out += mcText(v.extra);
    return out.replace(/§./g, '');
  }
  return '';
}

let macroScreenTimer = null;
let macroScreenBusy = false;
let macroScreenSignature = '';

async function refreshMacroScreenAuto() {
  const page = $('page-macrofarmer');
  if (!page || !page.classList.contains('active') || macroScreenBusy) return;
  macroScreenBusy = true;
  try {
    const r = await bridge.bot.macroPeek(effChatSlot(), true);
    const next = r && r.ok ? r : null;
    const sig = next ? JSON.stringify([next.title, next.size, next.items]) : '';
    if (sig !== macroScreenSignature) {
      macroScreenSignature = sig;
      macroPeek = next;
      renderMacro();
    }
  } catch (_) {
    if (macroScreenSignature) {
      macroScreenSignature = '';
      macroPeek = null;
      renderMacro();
    }
  } finally {
    macroScreenBusy = false;
  }
}

function startMacroScreenAuto() {
  if (macroScreenTimer) clearInterval(macroScreenTimer);
  macroScreenSignature = '';
  refreshMacroScreenAuto();
  macroScreenTimer = setInterval(refreshMacroScreenAuto, 1200);
}
function stopMacroScreenAuto() {
  if (macroScreenTimer) clearInterval(macroScreenTimer);
  macroScreenTimer = null;
  macroScreenBusy = false;
}

function farmerCfg() {
  if (!cfg.macros) cfg.macros = { farmer: { enabled: false, command: '', steps: [], cycle: 60, closeAfter: true, rawClick: false, startMode: 'join', joinIndex: 0, startDelay: 3 } };
  if (!cfg.macros.farmer) cfg.macros.farmer = { enabled: false, command: '', steps: [], cycle: 60, closeAfter: true, rawClick: false, startMode: 'join', joinIndex: 0, startDelay: 3 };
  if (!Array.isArray(cfg.macros.farmer.steps)) cfg.macros.farmer.steps = [];
  return cfg.macros.farmer;
}
function saveFarmer(partial) {
  const f = farmerCfg();
  Object.assign(f, partial || {});
  return save({ macros: { farmer: {
    command: f.command, steps: f.steps, cycle: f.cycle, enabled: f.enabled,
    closeAfter: f.closeAfter, rawClick: !!f.rawClick,
    startMode: f.startMode === 'delay' ? 'delay' : 'join',
    joinIndex: Math.max(0, Number(f.joinIndex) || 0),
    startDelay: Math.max(0, Number(f.startDelay) === 0 ? 0 : (Number(f.startDelay) || 3))
  } } });
}

// --- esya ikonlari (assets/items.png atlasi) ---
const ICON_SZ = 32;                       // ekranda kac piksel gozukecek
function iconReady() {
  const IC = window.ITEM_ICONS;
  return !!(IC && IC.map && IC.cols);
}
function iconStyle(id) {
  const IC = window.ITEM_ICONS;
  if (!iconReady() || !id) return '';
  const i = IC.map[String(id).replace(/^minecraft:/, '')];
  if (i === undefined) return '';
  const col = i % IC.cols;
  const row = Math.floor(i / IC.cols);
  return `background-position:-${col * ICON_SZ}px -${row * ICON_SZ}px`;
}
function iconSetup() {
  const IC = window.ITEM_ICONS;
  if (!iconReady()) return;
  const r = document.documentElement.style;
  r.setProperty('--ic-w', IC.cols * ICON_SZ + 'px');
  r.setProperty('--ic-h', IC.rows * ICON_SZ + 'px');
}

// Minecraft'taki gibi fareyle ustune gelince esya adini gosterir
function macroTip() {
  let tip = $('mf-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'mf-tip';
    tip.className = 'mctip hidden';
    document.body.appendChild(tip);
  }
  return tip;
}
function showItemTip(btn, ev) {
  const tip = macroTip();
  const nm = btn.dataset.nm || '';
  const sub = btn.dataset.sub || '';
  if (!nm && !sub) { tip.classList.add('hidden'); return; }
  tip.innerHTML = (nm ? `<b>${esc(nm)}</b>` : '') + (sub ? `<small>${esc(sub)}</small>` : '');
  tip.classList.remove('hidden');
  const pad = 14;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  if (x + w > window.innerWidth - 6) x = ev.clientX - w - pad;
  if (y + h > window.innerHeight - 6) y = ev.clientY - h - pad;
  tip.style.left = Math.max(6, x) + 'px';
  tip.style.top = Math.max(6, y) + 'px';
}
function hideItemTip() { const t = $('mf-tip'); if (t) t.classList.add('hidden'); }

// 54 kareyi bir kez olusturur
function buildChest() {
  const g = $('mf-grid');
  if (!g || g.childElementCount) return;
  let html = '';
  for (let i = 0; i < MACRO_COLS * MACRO_ROWS; i++) {
    html += `<button type="button" class="mcslot" data-mslot="${i}"><span class="ordwrap"></span><span class="idx">${i}</span></button>`;
  }
  g.innerHTML = html;
  g.querySelectorAll('[data-mslot]').forEach((b) => {
    b.onclick = () => addMacroStep(Number(b.dataset.mslot));
  });
  iconSetup();
  g.addEventListener('mousemove', (e) => {
    const b = e.target.closest ? e.target.closest('.mcslot') : null;
    if (!b) { hideItemTip(); return; }
    showItemTip(b, e);
  });
  g.addEventListener('mouseleave', hideItemTip);
  g.addEventListener('click', hideItemTip);
}

let liveScreenTimer = null;
let liveScreenBusy = false;
const screenUnreadSlots = new Set();

function paintScreenAlert() {
  const badge = $('screen-alert');
  if (badge) badge.classList.toggle('hidden', screenUnreadSlots.size === 0);
  // Sol sekmelerdeki PANEL butonunda da ayni animasyonlu unlem parlar
  const navBadge = $('nav-panel-alert');
  if (navBadge) navBadge.classList.toggle('hidden', screenUnreadSlots.size === 0);
}
function clearCurrentScreenAlert() {
  screenUnreadSlots.delete(effChatSlot());
  paintScreenAlert();
}

function buildLiveScreen() {
  const g = $('live-grid');
  if (!g || g.childElementCount) return;
  let html = '';
  for (let i = 0; i < MACRO_COLS * MACRO_ROWS; i++) {
    html += `<button type="button" class="mcslot" tabindex="-1" data-lslot="${i}"><span class="idx">${i}</span></button>`;
  }
  g.innerHTML = html;
  g.querySelectorAll('[data-lslot]').forEach((b) => {
    b.onclick = () => clickLiveScreenSlot(Number(b.dataset.lslot), 0);
    b.oncontextmenu = (e) => { e.preventDefault(); clickLiveScreenSlot(Number(b.dataset.lslot), 1); };
  });
  iconSetup();
  g.addEventListener('mousemove', (e) => {
    const b = e.target.closest ? e.target.closest('.mcslot') : null;
    if (!b) { hideItemTip(); return; }
    showItemTip(b, e);
  });
  g.addEventListener('mouseleave', hideItemTip);
}

function renderLiveScreen(data) {
  buildLiveScreen();
  const g = $('live-grid');
  const stateEl = $('live-screen-state');
  const accountEl = $('live-screen-account');
  if (accountEl) accountEl.textContent = accNameOf(activeAccountId()) || '-';
  if (!g) return;
  const ok = !!(data && data.ok);
  const size = ok ? Number(data.size) || 54 : 0;
  const items = ok && Array.isArray(data.items) ? data.items : [];
  g.querySelectorAll('[data-lslot]').forEach((b) => {
    const n = Number(b.dataset.lslot);
    const it = items.find((x) => Number(x.slot) === n);
    const void_ = !!(ok && size && n >= size);
    const nm = it ? (mcText(it.name) || it.id || '?') : '';
    const pos = it ? iconStyle(it.id) : '';
    let inner = '';
    if (pos) inner += `<i class="ic" style="${pos}"></i>`;
    else if (it) inner += `<span class="it">${esc(nm)}</span>`;
    inner += `<span class="idx">${n}</span>`;
    if (it && Number(it.count) > 1) inner += `<span class="cnt">${Number(it.count)}</span>`;
    b.innerHTML = inner;
    b.classList.toggle('has', !!it);
    b.classList.toggle('img', !!pos);
    b.classList.toggle('void', void_);
    b.dataset.nm = nm;
    b.dataset.sub = '#' + n + (it && Number(it.count) > 1 ? ' · x' + Number(it.count) : '');
  });
  if (stateEl) stateEl.textContent = ok ? T('screenItems').replace('{n}', items.length) : T('screenWaiting');
}

async function clickLiveScreenSlot(slot, button) {
  const g = $('live-grid');
  const b = g && g.querySelector(`[data-lslot="${slot}"]`);
  if (b) b.classList.add('live-click');
  try {
    const r = await bridge.bot.screenClick(effChatSlot(), slot, button);
    if (!r || !r.ok) window.toast(T('screenClickFailed'), 'error');
    setTimeout(refreshLiveScreen, 100);
    setTimeout(refreshLiveScreen, 450);
    setTimeout(refreshLiveScreen, 950);
  } catch (_) {
    window.toast(T('screenClickFailed'), 'error');
  } finally {
    if (b) setTimeout(() => b.classList.remove('live-click'), 220);
  }
}

async function refreshLiveScreen() {
  const page = $('page-screen');
  if (!page || !page.classList.contains('active') || liveScreenBusy) return;
  liveScreenBusy = true;
  try {
    const r = await bridge.bot.macroPeek(effChatSlot(), true);
    renderLiveScreen(r && r.ok ? r : null);
  } catch (_) {
    renderLiveScreen(null);
  } finally {
    liveScreenBusy = false;
  }
}

function startLiveScreen() {
  clearCurrentScreenAlert();
  if (liveScreenTimer) clearInterval(liveScreenTimer);
  buildLiveScreen();
  refreshLiveScreen();
  liveScreenTimer = setInterval(refreshLiveScreen, 1200);
}
function stopLiveScreen() {
  if (liveScreenTimer) clearInterval(liveScreenTimer);
  liveScreenTimer = null;
  liveScreenBusy = false;
  hideItemTip();
}

function addMacroStep(slot) {
  const f = farmerCfg();
  const first = !f.steps.length;
  f.steps.push({ slot, delay: first ? 1.5 : 1, click: 'left' });
  const outside = macroPeek && macroPeek.size && slot >= macroPeek.size;
  saveFarmer({ steps: f.steps }).then(() => {
    renderMacro();
    if (outside) window.toast(T('tMacVoid'), 'warn');
    else window.toast(T('tMacStepAdded') + ' · ' + T('macStepSlot') + ' #' + slot, 'ok');
  });
}

// SOL -> SAG -> SHIFT+SOL -> SHIFT+SAG -> SOL ...
function cycleMacroClick(i) {
  const f = farmerCfg();
  const st = f.steps[i];
  if (!st) return;
  st.click = CLICK_KEYS[(CLICK_KEYS.indexOf(clickKey(st)) + 1) % CLICK_KEYS.length];
  saveFarmer({ steps: f.steps }).then(() => {
    renderMacro();
    window.toast(T('macClickType') + ': ' + T(CLICK_LBL[st.click]), 'info');
  });
}
function removeMacroStep(i) {
  const f = farmerCfg();
  f.steps.splice(i, 1);
  saveFarmer({ steps: f.steps }).then(renderMacro);
}
function moveMacroStep(i, dir) {
  const f = farmerCfg();
  const j = i + dir;
  if (j < 0 || j >= f.steps.length) return;
  const tmp = f.steps[i]; f.steps[i] = f.steps[j]; f.steps[j] = tmp;
  saveFarmer({ steps: f.steps }).then(renderMacro);
}

// Sandik karelerini ve adim listesini cizer
function renderMacro() {
  if (!$('mf-grid')) return;
  buildChest();
  const f = farmerCfg();

  // kareler: kacinci adim(lar)da kullaniliyor?
  const used = {};
  f.steps.forEach((st, i) => {
    const k = Number(st.slot);
    (used[k] = used[k] || []).push(i + 1);
  });
  $('mf-grid').querySelectorAll('[data-mslot]').forEach((b) => {
    const n = Number(b.dataset.mslot);
    const orders = used[n];
    const live = macroState.running && macroState.index >= 0
      && f.steps[macroState.index] && Number(f.steps[macroState.index].slot) === n;
    b.classList.toggle('on', !!orders);
    b.classList.toggle('live', !!live);
    // "Ekrani oku" ile gelen esyalar: once FOTOGRAF, bulunamazsa kisa isim
    const it = macroPeek && macroPeek.items ? macroPeek.items.find((x) => Number(x.slot) === n) : null;
    const void_ = !!(macroPeek && macroPeek.size && n >= macroPeek.size);
    const nm = it ? (mcText(it.name) || it.id || '?') : '';
    const pos = it ? iconStyle(it.id) : '';
    let inner = '';
    if (pos) inner += `<i class="ic" style="${pos}"></i>`;
    else if (it) inner += `<span class="it">${esc(nm)}</span>`;
    inner += `<span class="idx">${n}</span>`;
    if (it && Number(it.count) > 1) inner += `<span class="cnt">${Number(it.count)}</span>`;
    if (orders) {
      // Ayni kare cok kez kullanilabilir; karenin icine en fazla bir rozet +
      // "+N" sigar, gerisi ipucu balonunda yazar (tasma olmasin).
      const head = orders[0];
      const rest = orders.length - 1;
      inner += `<span class="ordwrap"><i class="ord">${head}</i>${rest ? `<i class="ord more">+${rest}</i>` : ''}</span>`;
    }
    b.innerHTML = inner;
    b.classList.toggle('has', !!it);
    b.classList.toggle('img', !!pos);
    b.classList.toggle('void', void_ && !orders);
    // ipucu balonu icin veri (fareyle ustune gelince gorunur)
    b.dataset.nm = nm;
    b.dataset.sub = '#' + n + (it && Number(it.count) > 1 ? ' · x' + Number(it.count) : '')
      + (orders ? ' · ' + T('macStepNow') + ' ' + orders.join(', ') : '')
      + (void_ ? ' · ' + T('macVoid') : '');
    b.removeAttribute('title');
  });

  // adim listesi
  const box = $('mf-steps');
  if (box) {
    box.innerHTML = f.steps.map((st, i) => {
      const slot = Number(st.slot);
      const r = Math.floor(slot / MACRO_COLS) + 1;
      const c = (slot % MACRO_COLS) + 1;
      const live = macroState.running && macroState.index === i;
      const ck = clickKey(st);
      return `<div class="step${live ? ' live' : ''}">
        <i class="no">${i + 1}</i>
        <div class="txt"><b>${T('macStepSlot')} #${slot}</b><small>${T('macStepRowCol').replace('{r}', r).replace('{c}', c)}</small></div>
        <button type="button" class="ctype${ck === 'left' ? '' : ' alt'}" data-sclick="${i}" title="${T('macClickType')}">${T(CLICK_LBL[ck])}</button>
        <label class="dly"><input type="number" data-sdly="${i}" min="0" step="0.5" value="${st.delay}" title="${T('macStepDelay')}" /><span>${T('secShort')}</span></label>
        <div class="acts">
          <button class="icon-btn" data-sup="${i}" title="${T('macUp')}">${window.ICON.up}</button>
          <button class="icon-btn" data-sdown="${i}" title="${T('macDown')}">${window.ICON.down}</button>
          <button class="icon-btn del" data-sdel="${i}" title="${T('macRemove')}">${window.ICON.trash}</button>
        </div>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-sdly]').forEach((el) => {
      el.onchange = () => {
        const i = Number(el.dataset.sdly);
        farmerCfg().steps[i].delay = Math.max(0, Number(el.value) || 0);
        saveFarmer({ steps: farmerCfg().steps });
      };
    });
    box.querySelectorAll('[data-sclick]').forEach((b) => { b.onclick = () => cycleMacroClick(Number(b.dataset.sclick)); });
    box.querySelectorAll('[data-sdel]').forEach((b) => { b.onclick = () => removeMacroStep(Number(b.dataset.sdel)); });
    box.querySelectorAll('[data-sup]').forEach((b) => { b.onclick = () => moveMacroStep(Number(b.dataset.sup), -1); });
    box.querySelectorAll('[data-sdown]').forEach((b) => { b.onclick = () => moveMacroStep(Number(b.dataset.sdown), 1); });
  }

  const ct = $('mf-chest-title');
  if (ct) ct.textContent = (macroPeek && mcText(macroPeek.title)) || 'FARMER';

  const has = f.steps.length > 0;
  const panel = $('mf-panel'); if (panel) panel.classList.toggle('open', has);
  const empty = $('mf-empty'); if (empty) empty.classList.toggle('hidden', has);
  try { window.enhanceNumbers($('mf-steps')); } catch (_) {}
  renderMacroOrder();
  renderMacroPlan();
  renderMacroStatus();
}

// --- GIRIS KOMUTLARI ile senkron baslatma -----------------------------------
const MASK_CMD = /(\/(?:login|l|register|reg)\s+)\S+/i;
function joinCmdList() {
  const l = (cfg.joinMessages && cfg.joinMessages.commands) || [];
  return l.filter((c) => c && c.enabled && String(c.command || '').trim());
}
function macroPlan() {
  const f = farmerCfg();
  const on = !!(cfg.toggles && cfg.toggles.joinMessages);
  const list = (on ? joinCmdList() : []).map((c) => ({
    txt: String(c.command).replace(MASK_CMD, '$1********'),
    delay: Math.max(0, Number(c.delay) || 0),
    me: false
  }));
  if (f.startMode !== 'delay') {
    let at = Number(f.joinIndex) || 0;
    if (!at || at > list.length + 1) at = list.length + 1;
    list.splice(at - 1, 0, {
      txt: (String(f.command || '').trim() || '/çiftçi') + '  ·  ' + T('macFarmer'),
      delay: Math.max(0, Number(f.startDelay) === 0 ? 0 : (Number(f.startDelay) || 3)),
      me: true
    });
  }
  return list;
}
function renderMacroOrder() {
  const sel = $('mf-order');
  if (!sel) return;
  const f = farmerCfg();
  const n = joinCmdList().length;
  let html = `<option value="0">${T('macStartOrderLast')}</option>`;
  for (let k = 1; k <= n + 1; k++) html += `<option value="${k}">${T('macStartOrderNth').replace('{n}', k)}</option>`;
  html += `<option value="free">${T('macStartOrderFree')}</option>`;
  sel.innerHTML = html;
  sel.value = f.startMode === 'delay' ? 'free' : String(Math.min(Math.max(0, Number(f.joinIndex) || 0), n + 1));
  try { window.refreshSelect(sel); } catch (_) {}
}
function renderMacroPlan() {
  const box = $('mf-plan');
  if (!box) return;
  const list = macroPlan();
  box.innerHTML = `<div class="joinplan-head">${T('macPlanHead')}</div>` + (list.length
    ? list.map((x, i) => `<div class="jp${x.me ? ' me' : ''}"><i>${i + 1}</i><b>${esc(x.txt)}</b><span>+${x.delay} ${T('secShort')}</span></div>`).join('')
    : `<p class="hint">${T('macPlanNone')}</p>`);
  const sd = $('mf-sdelay');
  if (sd) sd.value = Math.max(0, Number(farmerCfg().startDelay) === 0 ? 0 : (Number(farmerCfg().startDelay) || 3));
}

function renderMacroStatus() {
  const f = farmerCfg();
  const on = macroState.running;
  const st = $('mf-state'); if (st) st.textContent = on ? T('macRunning') : T('macStopped');
  const dot = $('mf-dot'); if (dot) dot.classList.toggle('on', on);
  const now = $('mf-step-now');
  if (now) now.textContent = on && macroState.index >= 0 ? `${macroState.index + 1} / ${f.steps.length}` : '-';
  const cy = $('mf-cycles'); if (cy) cy.textContent = String(macroState.cycles || 0);
  const ck = $('mf-clicks'); if (ck) ck.textContent = String(macroState.clicks || 0);
  ['mf-badge', 'mac-badge'].forEach((id) => { const b = $(id); if (b) b.classList.toggle('hidden', !on); });
  applyFeatureUI();
}

function fillMacros() {
  const f = farmerCfg();
  const cmd = $('mf-command');
  if (cmd) {
    cmd.value = f.command || '';
    cmd.onchange = () => saveFarmer({ command: cmd.value.trim() });
  }
  const cyc = $('mf-cycle');
  if (cyc) {
    cyc.value = f.cycle || 60;
    cyc.onchange = () => saveFarmer({ cycle: Math.max(3, Number(cyc.value) || 60) });
  }
  const cls = $('mf-close');
  if (cls) {
    cls.checked = f.closeAfter !== false;
    cls.onchange = () => saveFarmer({ closeAfter: cls.checked });
  }
  const raw = $('mf-raw');
  if (raw) {
    raw.checked = !!f.rawClick;
    raw.onchange = () => saveFarmer({ rawClick: raw.checked });
  }
  const ord = $('mf-order');
  if (ord) {
    ord.onchange = () => {
      const v = ord.value;
      if (v === 'free') saveFarmer({ startMode: 'delay' }).then(renderMacroPlan);
      else saveFarmer({ startMode: 'join', joinIndex: Math.max(0, Number(v) || 0) }).then(renderMacroPlan);
    };
  }
  const sdl = $('mf-sdelay');
  if (sdl) {
    sdl.value = Math.max(0, Number(f.startDelay) === 0 ? 0 : (Number(f.startDelay) || 3));
    sdl.onchange = () => saveFarmer({ startDelay: Math.max(0, Number(sdl.value) || 0) }).then(renderMacroPlan);
  }
  applyFeatureUI();
  const clear = $('mf-clear');
  if (clear) clear.onclick = () => { const ff = farmerCfg(); ff.steps = []; saveFarmer({ steps: [] }).then(() => { renderMacro(); window.toast(T('tMacCleared'), 'info'); }); };
  const run = $('mf-run'); if (run) run.onclick = () => startMacro(false);
  const stop = $('mf-stop'); if (stop) stop.onclick = () => stopMacro(false);
  renderMacro();
}

// CALISTIR = anahtari ac + hemen basla  (kapatana kadar calisir)
async function startMacro(silent) {
  const f = farmerCfg();
  if (!String(f.command || '').trim()) { window.toast(T('tMacNoCmd'), 'warn'); return; }
  if (!f.steps.length) { window.toast(T('tMacNoSteps'), 'warn'); return; }
  // CALISTIR = o anki hesabi makro listesine ekler (anahtar da acilir)
  const acc = activeAccountId();
  if (acc && featList('macroFarmer').indexOf(acc) === -1) {
    await saveFeature('macroFarmer', featList('macroFarmer').concat([acc]));
  }
  const r = await bridge.bot.macroStart(effChatSlot());
  if (r && r.ok) {
    macroState.running = true;
    renderMacro();
    if (!silent) window.toast(T('tMacStarted'), 'ok');
  } else if (r && r.error) {
    window.toast(r.error === 'no_session' ? T('tConnectFirst') : r.error, 'warn');
  }
}
// DURDUR = anahtari kapat + durdur (yoksa denetci tekrar baslatirdi)
async function stopMacro(silent) {
  // DURDUR = o hesabi listeden cikar (yoksa denetci tekrar baslatirdi)
  const acc = activeAccountId();
  const cur = featList('macroFarmer');
  if (acc && cur.indexOf(acc) !== -1) await saveFeature('macroFarmer', cur.filter((x) => x !== acc));
  else if (cur.length) await saveFeature('macroFarmer', []);
  await bridge.bot.macroStop(effChatSlot());
  macroState = { running: false, index: -1, cycles: macroState.cycles, total: macroState.total, clicks: macroState.clicks };
  renderMacro();
  if (!silent) window.toast(T('tMacStopped'), 'info');
}

function fillAntiAfk() {
  const a = cfg.antiAfk;
  const map = { 'afk-random': 'randomMovement', 'afk-walk': 'walk', 'afk-jump': 'jump', 'afk-sneak': 'sneak', 'afk-rotate': 'rotate', 'afk-look': 'lookAround' };
  Object.keys(map).forEach((id) => {
    const key = map[id];
    $(id).checked = !!a[key];
    $(id).onchange = () => save({ antiAfk: { [key]: $(id).checked } });
  });
  applyFeatureUI();
  $('afk-min').value = a.minInterval; $('afk-max').value = a.maxInterval;
  $('afk-min').onchange = () => save({ antiAfk: { minInterval: Number($('afk-min').value) } });
  $('afk-max').onchange = () => save({ antiAfk: { maxInterval: Number($('afk-max').value) } });
}

/* ================================ LOGS ==================================== */
async function renderLogHistory() {
  logBox.innerHTML = '';
  seenLogIds.clear();
  (await bridge.logs.all()).forEach(addLogLine);
}

const logBox = $('log-box');
const seenLogIds = new Set();          // ayni log satiri iki kez eklenmesin
function addLogLine(e) {
  const stickLog = atChatBottom(logBox);
  if (!e) return;
  if (e.id !== undefined) {
    if (seenLogIds.has(e.id)) return;
    seenLogIds.add(e.id);
    if (seenLogIds.size > 1500) seenLogIds.clear();
  }
  if (!logFilters.has(e.level)) return;
  const slot = Number(e.slot) || 0;
  // Secili oturum varsa sadece o oturumun (ve uygulama geneli olan slot 0) satirlari
  if (logSlot && slot && slot !== logSlot) { unreadLog.add(slot); renderSlotTabs(); return; }
  const tag = (!logSlot && slot) ? `<span class="lvl">#${slot}</span>` : '';
  const div = document.createElement('div');
  div.className = 'line';
  div.innerHTML = `<span class="time">[${e.time}]</span><span class="lvl lvl-${e.level}">[${e.level}]</span>${tag}<span class="msg">${esc(e.message)}</span>`;
  logBox.appendChild(div);
  const logLimit = cfg && cfg.settings.memoryOptimization ? 400 : 800;
  while (logBox.childElementCount > logLimit) logBox.removeChild(logBox.firstChild);
  if (stickLog) snapChatToBottom(logBox);
}

/* ============================== SETTINGS ================================== */
function fillSettings() {
  const s = cfg.settings;
  const map = {
    's-notify': 'notifications',
    's-lowcpu': 'lowCpuMode', 's-mem': 'memoryOptimization',
    's-packetlog': 'packetLog'
  };
  Object.keys(map).forEach((id) => {
    const el = $(id); if (!el) return;
    el.checked = !!s[map[id]];
    el.onchange = () => { save({ settings: { [map[id]]: el.checked } }); window.toast(T('tSettingSaved'), 'ok'); };
  });
  // "Baslangicta acilsin": disli kaldirildi; checkbox her iki yonde de
  // (acarken ve kapatirken) hesap secme penceresi acar, diger ayarlar gibi.
  const suEl = $('s-startup');
  if (suEl && !suEl.dataset.startupBound) {
    suEl.dataset.startupBound = '1';
    paintStartupRow();
    suEl.addEventListener('click', (e) => { e.preventDefault(); openStartupPicker(); });
    suEl.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      suEl.click();
    });
  }
  $('s-theme').value = s.theme;
  $('s-lang').value = s.language;
  try { window.refreshSelect($('s-theme')); window.refreshSelect($('s-lang')); } catch (_) {}
}

/* ============================= GUNCELLEME ================================= */
let updState = { ok: false, update: false };
let appVer = '';
let updInstalling = false;
function updErrorText(err) {
  return T('updFailed') + (err ? ' (' + err + ')' : '');
}
function paintUpdateState() {
  const btn = $('upd-btn');
  const has = !!(updState && updState.ok && updState.update && updState.version);
  if (!btn) return;
  btn.classList.toggle('hidden', !has);
  btn.disabled = updInstalling;
  const v = $('upd-btn-ver'); if (v) v.textContent = has && !updInstalling ? 'v' + updState.version : '';
}
function paintUpdateProgress(p) {
  const btn = $('upd-btn'); if (!btn) return;
  const label = btn.querySelector('span');
  const pct = Math.max(0, Math.min(100, Number(p && p.percent) || 0));
  if (label) label.textContent = T('updDownloading') + (pct ? ' ' + pct + '%' : '');
}
async function installUpdateNow() {
  if (updInstalling || !updState || !updState.update) return;
  updInstalling = true; paintUpdateState(); paintUpdateProgress({ percent: 0 });
  const r = await bridge.update.install();
  if (!r || !r.ok) {
    updInstalling = false;
    const btn = $('upd-btn'), label = btn && btn.querySelector('span');
    if (label) label.textContent = T('updBtn');
    paintUpdateState();
    window.toast(updErrorText(r && r.error), 'error');
  }
}

/* ============================ STATE / IPC ================================= */
function applyState(s) {
  state = Object.assign({}, state, s);
  if (s.status === 'ONLINE') state.uptime = s.uptime || state.uptime || 0;
  else state.uptime = 0;
  const online = s.status === 'ONLINE';
  const dotCls = online ? 'on' : s.status === 'CONNECTING' ? 'wait' : '';
  const pill = $('pill-status');
  pill.className = 'pill ' + (online ? 'online' : s.status === 'CONNECTING' ? 'connecting' : '');
  pill.innerHTML = `<i class="dot ${dotCls}"></i><b>${s.status}</b>`;
  refreshTopChips();
  const sdot = $('stat-dot'); if (sdot) sdot.classList.toggle('on', online);
  $('sb-ping').textContent = online ? s.ping + ' ms' : '-';
  $('spam-badge').classList.toggle('hidden', !s.spam);
  $('q-spam').textContent = s.spam ? T('qSpamStop') : T('qSpamStart');
  $('c-connect').disabled = s.status === 'CONNECTING';
  refreshDashboard();
  if ($('page-screen') && $('page-screen').classList.contains('active')) refreshLiveScreen();
  if (cfg) renderAccountsIfChanged();
}

/* ---- Ust bardaki sunucu / hesap cipleri (birden fazla oturum) ------------- */
function accNameOf(id) {
  const a = cfg && cfg.accounts.list.find((x) => x.id === id);
  return a ? a.username : '';
}
function serverLabel() { return (cfg && cfg.connection.host) || '-'; }

function refreshTopChips() {
  const list = slotInfo.list || [];
  const names = list.map((x) => x.name || accNameOf(x.accountId)).filter(Boolean);
  const servers = list.map((x) => x.server || serverLabel()).filter(Boolean);
  const uniqServers = [...new Set(servers)];

  // HESAP
  const accB = $('sb-account'); const accBtn = $('sb-account-btn'); const accMore = $('sb-account-more');
  if (!names.length) { accB.textContent = state.account && state.account !== '-' ? state.account : '-'; }
  else accB.textContent = names.length === 1 ? names[0] : names[0] + ' +' + (names.length - 1);
  const multiAcc = names.length > 1;
  accBtn.classList.toggle('multi', multiAcc);
  accMore.classList.toggle('hidden', !multiAcc);
  fillSbPop('sb-account-pop', list.map((x) => ({
    name: (x.name || accNameOf(x.accountId) || '-'), tag: '#' + x.slot, on: x.status === 'ONLINE'
  })));

  // SUNUCU
  const srvB = $('sb-server'); const srvBtn = $('sb-server-btn'); const srvMore = $('sb-server-more');
  if (!uniqServers.length) srvB.textContent = state.server && state.server !== '-' ? state.server : '-';
  else srvB.textContent = uniqServers.length === 1 ? uniqServers[0] : uniqServers[0] + ' +' + (uniqServers.length - 1);
  // Birden fazla oturum varsa (ayni sunucu olsa bile) "+" ile hepsi gorulebilir
  const multiSrv = uniqServers.length > 1 || list.length > 1;
  srvBtn.classList.toggle('multi', multiSrv);
  srvMore.classList.toggle('hidden', !multiSrv);
  fillSbPop('sb-server-pop', list.map((x) => ({
    name: (x.server || serverLabel() || '-'), tag: '#' + x.slot, on: x.status === 'ONLINE'
  })));
}
function fillSbPop(id, rows) {
  const el = $(id); if (!el) return;
  el.innerHTML = rows.length
    ? rows.map((r) => `<div class="r"><i class="${r.on ? 'on' : ''}"></i>${esc(r.name)}<span>${r.tag}</span></div>`).join('')
    : `<div class="r">${window.t('dashNoSession')}</div>`;
}
function bindSbPop(btnId, popId) {
  const btn = $(btnId); const pop = $(popId);
  if (!btn || !pop) return;
  btn.onclick = (e) => {
    if (!btn.classList.contains('multi')) return;
    e.stopPropagation();
    const on = !pop.classList.contains('open');
    document.querySelectorAll('.sbpop.open').forEach((p) => p.classList.remove('open'));
    pop.classList.toggle('open', on);
  };
  document.addEventListener('click', (e) => {
    if (!pop.classList.contains('open')) return;
    if (pop.contains(e.target) || btn.contains(e.target)) return;
    pop.classList.remove('open');
  });
}

// Hesap satirlarini gereksiz yere yeniden cizmemek icin kucuk bir imza karsilastirmasi
let accountsSig = '';
function accountSignature() {
  if (!cfg) return '';
  return JSON.stringify([
    cfg.accounts.selected, cfg.accounts.picked,
    cfg.accounts.list.map((a) => [a.id, a.username, a.type, a.authed]),
    slotInfo.list.map((s) => [s.slot, s.accountId, s.status])
  ]);
}
function renderAccountsIfChanged() {
  // Bir hesap silinirken main process ayni anda slot olayi da yollar. O ara
  // eski config ile listeyi tekrar cizmek satirin silinip geri gelmesine neden olur.
  if (accountMutationDepth > 0) return;
  const sig = accountSignature();
  if (sig === accountsSig) return;
  accountsSig = sig;
  renderAccounts();
}

function refreshDashboard() {
  const online = state.status === 'ONLINE';
  const nd = $('now-dot');
  if (nd) nd.className = 'now-dot ' + (online ? 'on' : state.status === 'CONNECTING' ? 'wait' : '');
  const ns = $('now-status'); if (ns) ns.textContent = state.status;
  const nsv = $('now-server'); if (nsv) nsv.textContent = (state.server && state.server !== '-') ? state.server : serverLabel();
  const dp = $('d-ping'); if (dp) dp.textContent = online ? state.ping + ' ms' : '-';
  const dc = $('d-count'); if (dc) dc.textContent = String((slotInfo.list || []).length);
  renderDashSessions();
  const note = $('dash-chat-note');
  if (note) {
    const cur = (slotInfo.list || []).find((x) => x.slot === effChatSlot());
    note.textContent = cur ? ('#' + cur.slot + ' ' + (cur.name || '')) : '-';
  }
  $('q-spam').textContent = state.spam ? T('qSpamStop') : T('qSpamStart');
  paintDashTiles();
}

function renderDashSessions() {
  const box = $('dash-list'); if (!box) return;
  const list = slotInfo.list || [];
  const sig = JSON.stringify([
    effChatSlot(),
    list.map((x) => [x.slot, x.name, x.status, x.ping])
  ]);
  if (sig === dashSessionsSig) return;
  dashSessionsSig = sig;
  box.innerHTML = list.length ? list.map((x) => `
    <div class="item ${x.slot === effChatSlot() ? 'selected' : ''}" data-dslot="${x.slot}">
      <i class="dot ${liveCls(x.status)}"></i>
      <div class="main">
        <span class="name">${esc(x.name || '')}<b class="slotbadge">#${x.slot}</b></span>
        <span class="sub">${x.status}${x.ping ? ' · ' + x.ping + ' ms' : ''}</span>
      </div>
      <button class="icon-btn del" data-doff="${x.slot}" title="${T('rowDisconnect')}">${window.ICON.power}</button>
    </div>`).join('') : `<div class="empty">${window.t('dashNoSession')}</div>`;
  box.querySelectorAll('[data-dslot]').forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest('[data-doff]')) return;
      selectChatSlot(Number(row.dataset.dslot));
    };
  });
  box.querySelectorAll('[data-doff]').forEach((b) => {
    b.onclick = async (e) => { e.stopPropagation(); await doDisconnect(Number(b.dataset.doff)); renderAccounts(); refreshDashboard(); };
  });
}

function startUptimeTimer() {
  setInterval(() => {
    if (state.status !== 'ONLINE') {
      const z = '00:00:00';
      const a = $('sb-uptime'); if (a && a.textContent !== z) a.textContent = z;
      const b = $('d-uptime'); if (b && b.textContent !== z) b.textContent = z;
      return;
    }
    state.uptime += 1000;
    const v = hhmmss(state.uptime);
    const a = $('sb-uptime'); if (a) a.textContent = v;
    const b = $('d-uptime'); if (b) b.textContent = v;
  }, 1000);
}

bridge.on('status', (s) => { if (s && s.slot && s.slot !== effChatSlot()) return; applyState(s); });
bridge.on('slots', (d) => {
  if (!d) return;
  const before = (slotInfo.list || []).map((s) => s.slot);
  slotInfo = { list: d.list || [], active: Number(d.active) || 0 };
  try { applyFeatureUI(); if (featPick || spamAct) renderFeatPicker(); } catch (_) {}
  const now = slotInfo.list.map((s) => s.slot);
  const gone = before.some((n) => !now.includes(n));     // oturum kapandi mi?
  if (gone) { before.filter((n) => !now.includes(n)).forEach((n) => { unreadChat.delete(n); unreadLog.delete(n); }); }
  pruneSlots();
  renderSlotTabs();
  refreshTopChips();
  refreshDashboard();
  if (cfg) renderAccountsIfChanged();
  if (gone) { renderLogHistory(); renderChatHistory(); }
});
bridge.on('log', (e) => addLogLine(e));
bridge.on('chat', (m) => addChatLine(m));
bridge.on('notice', (n) => window.toast(n.message, n.type === 'ok' ? 'ok' : n.type === 'warn' ? 'warn' : 'error'));
bridge.on('spam-state', (d) => {
  const active = (d && typeof d === 'object') ? !!d.active : !!d;
  const slot = (d && typeof d === 'object') ? (Number(d.slot) || 0) : 0;
  if (slot && slot !== effChatSlot()) return;              // baska hesabin spam durumu
  state.spam = active; refreshDashboard();
  $('spam-badge').classList.toggle('hidden', !active);
});
// MAKROLAR sayfasina her girildiginde giris sirasi yeniden okunur
window.addEventListener('page-change', (e) => {
  const pg = e && e.detail;
  if (pg === 'macrofarmer' || pg === 'macros') {
    try { renderMacroOrder(); renderMacroPlan(); } catch (_) {}
  }
  if (pg === 'macrofarmer') startMacroScreenAuto(); else stopMacroScreenAuto();
  if (pg === 'screen') startLiveScreen(); else stopLiveScreen();
  // AYARLAR sayfasindan cikip geri gelince acik panelleri kapat
  ['s-info-panel'].forEach((id) => {
    const el = $(id); if (el) el.classList.remove('open');
  });
  const it = $('s-info-toggle'); if (it) it.setAttribute('aria-expanded', 'false');
  // Sayfaya girince sohbet / kayitlar / canli sohbet en son mesaja kayar
  setTimeout(() => {
    try { if (logBox) snapChatToBottom(logBox); } catch (_) {}
    try { if (chatBox) snapChatToBottom(chatBox); } catch (_) {}
    try { const d = document.getElementById('dash-chat'); if (d) snapChatToBottom(d); } catch (_) {}
  }, 80);
  try { applyFeatureUI(); } catch (_) {}
});

bridge.on('screen-open', (d) => {
  const slot = Number(d && d.slot) || 0;
  const page = $('page-screen');
  const macroPage = $('page-macrofarmer');
  const viewingScreen = !!(page && page.classList.contains('active') && slot === effChatSlot());
  const viewingMacro = !!(macroPage && macroPage.classList.contains('active') && slot === effChatSlot());
  const viewing = viewingScreen || viewingMacro;
  if (viewing) {
    clearCurrentScreenAlert();
    if (viewingScreen) {
      setTimeout(refreshLiveScreen, 80);
      setTimeout(refreshLiveScreen, 350);
    }
    if (viewingMacro) {
      setTimeout(refreshMacroScreenAuto, 80);
      setTimeout(refreshMacroScreenAuto, 350);
    }
  } else {
    screenUnreadSlots.add(slot);
    paintScreenAlert();
  }
});
bridge.on('screen-close', (d) => {
  const slot = Number(d && d.slot) || 0;
  screenUnreadSlots.delete(slot);
  paintScreenAlert();
  if ($('page-screen') && $('page-screen').classList.contains('active') && slot === effChatSlot()) {
    setTimeout(refreshLiveScreen, 80);
  }
  if ($('page-macrofarmer') && $('page-macrofarmer').classList.contains('active') && slot === effChatSlot()) {
    setTimeout(refreshMacroScreenAuto, 80);
  }
});
bridge.on('macro-state', (d) => {
  if (!d) return;
  if (d.slot && d.slot !== effChatSlot()) return;           // baska hesabin makrosu
  macroState = {
    running: !!d.running,
    index: Number.isInteger(d.index) ? d.index : -1,
    total: Number(d.total) || 0,
    cycles: Number(d.cycles) || macroState.cycles || 0,
    clicks: Number(d.clicks) || 0
  };
  renderMacro();
});
bridge.on('metrics', (m) => {
  const c = $('sb-cpu'); if (c) c.textContent = m.cpu + '%';
  const r1 = $('sb-ram'); if (r1) r1.textContent = m.ram + ' MB';
  const r2 = $('d-ram'); if (r2) r2.textContent = m.ram + ' MB';
});
bridge.on('msa-done', async (d) => {
  if (d && d.ok) {
    cfg = await bridge.config.get();
    renderAccounts();
  }
});
bridge.on('dialog', (d) => showDialog(d));
bridge.on('config-changed', (data) => {
  cfg = data;
  try { $('c-respack').value = cfg.connection.resourcePack || 'smart'; window.refreshSelect($('c-respack')); } catch (_) {}
  try { renderAccounts(); } catch (_) {}
  try { renderDashTiles(); applyFeatureUI(); updateFakeHostField(); } catch (_) {}
});
bridge.on('dialog-close', (d) => {
  if (d && d.slot && currentDialog && currentDialog.slot && d.slot !== currentDialog.slot) return;
  currentDialog = null; stopAutoCountdown(false); $('dlg-modal').classList.add('hidden');
});
bridge.on('win-state', (max) => { $('win-max').title = window.t(max ? 'winMin' : 'winMax'); });
// Guncelleme olaylari
bridge.on('update-state', (s) => {
  updState = s || { ok: false };
  paintUpdateState();
});
bridge.on('update-progress', (p) => paintUpdateProgress(p));
bridge.on('update-error', (e) => window.toast(updErrorText(e && e.error), 'error'));
// Uygulama arka plandan geri gelince: log/sohbet gecmisi main'deki tampondan yeniden cizilir
bridge.on('refresh', async () => {
  try {
    await refreshSlots();
    await renderLogHistory();
    await renderChatHistory();
    applyState(await bridge.bot.state(effChatSlot()));
  } catch (_) {}
});

/* ------------------------- Microsoft girisi ------------------------------- */
// Tek tik: Microsoft'un kendi giris sayfasi bir pop-up pencerede acilir.
// Giris bitince hesap sagdaki listeye PREMIUM etiketiyle eklenir.
let msaBusy = false;
async function doMicrosoftLogin() {
  if (msaBusy) return;
  msaBusy = true;
  const btn = $('a-mslogin');
  btn.disabled = true;
  $('a-msstatus').textContent = T('tMsWait');
  try {
    const r = await bridge.msLogin();
    cfg = await bridge.config.get();
    renderAccounts();
    if (r && r.ok) {
      $('a-msstatus').textContent = T('tMsOk') + r.name;
      window.toast(T('tMsOk') + r.name, 'ok');
    } else if (r && r.cancelled) {
      $('a-msstatus').textContent = T('tMsCancel');
    } else {
      const err = (r && r.error) || '';
      $('a-msstatus').textContent = T('tMsFail') + err;
      window.toast(T('tMsFail') + err, 'error');
    }
  } catch (e) {
    $('a-msstatus').textContent = T('tMsFail') + e.message;
  } finally {
    btn.disabled = false;
    msaBusy = false;
    setTimeout(() => { if (!msaBusy) $('a-msstatus').textContent = T('accHint'); }, 6000);
  }
}

/* ======================= TUM BUTON BAGLANTILARI =========================== */
function bindStatic() {
  // Connect
  $('c-connect').onclick = () => connectPicked();
  $('c-disconnect').onclick = async () => { await disconnectAll(); window.toast(T('tDisconnected'), 'info'); };
  // Dashboard
  $('q-connect').onclick = () => connectPicked();
  $('q-disconnect').onclick = () => disconnectAll();
  $('q-spam').onclick = async () => {
    const r = state.spam
      ? await bridge.bot.spamStop(effChatSlot())
      : await bridge.bot.spamStart(effChatSlot());
    if (!r || !r.ok) window.toast(T('tSpamFail'), 'warn');
  };
  $('q-join').onclick = async () => {
    const r = await bridge.bot.runJoin(effChatSlot());
    window.toast(r && r.ok ? T('tJoinRan') : T('tConnectFirst'), r && r.ok ? 'ok' : 'warn');
  };
  // Chat
  $('chat-send').onclick = () => sendChat('chat-input');
  $('dash-chat-send').onclick = () => sendChat('dash-chat-input');
  const bindChatInput = (inputId) => {
    const el = $(inputId); if (!el) return;
    el.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await sendChat(inputId);
      } else if (e.key === 'ArrowUp' && !e.altKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        moveChatHistory(inputId, -1);
      } else if (e.key === 'ArrowDown' && !e.altKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        moveChatHistory(inputId, 1);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        await completeChatInput(inputId);
      }
    });
    el.addEventListener('input', () => resetChatTab(inputId));
  };
  bindChatInput('dash-chat-input');
  $('chat-clear').onclick = () => {
    chatBox.innerHTML = '';
    const d = document.getElementById('dash-chat'); if (d) d.innerHTML = '';
    window.toast(T('tChatCleared'), 'info');
  };
  bindChatInput('chat-input');
  // Auto Spam
  $('spam-add').onclick = () => { if (cfg) persistSpamMessages(spamView().messages.concat([''])); };
  $('spam-start').onclick = () => spamRunAll(true);
  $('spam-stop').onclick = () => spamRunAll(false);
  $('spam-mode').onchange = updateSpamMode;
  $('spam-profile').onchange = () => {
    spamProfile = $('spam-profile').value || '';
    fillSpam(); renderSpamList();
  };
  // "Bu hesaba ozel liste": ortak listeden kopyalanir, kaldirilinca ortak donulur
  $('spam-own').onchange = async () => {
    if (!spamProfile) return;
    if ($('spam-own').checked) {
      const base = (cfg && cfg.autoSpam) || {};
      const copy = {};
      SPAM_KEYS.forEach((k) => { copy[k] = Array.isArray(base[k]) ? base[k].slice() : base[k]; });
      await save({ autoSpam: { perAccount: { [spamProfile]: copy } } });
    } else {
      await save({ autoSpam: { perAccount: { [spamProfile]: null } } });
    }
    fillSpam(); renderSpamList();
  };
  // Accounts
  $('a-save').onclick = saveAccount;
  $('a-reset').onclick = resetAccountForm;
  $('a-mslogin').onclick = doMicrosoftLogin;
  // Ust bardaki teknik bilgi cipi (ping/sure/CPU/RAM)
  const statBtn = $('stat-toggle'); const statPop = $('stat-pop');
  if (statBtn && statPop) {
    const setOpen = (v) => { statPop.classList.toggle('open', v); statBtn.classList.toggle('open', v); };
    statBtn.onclick = (e) => { e.stopPropagation(); setOpen(!statPop.classList.contains('open')); };
    document.addEventListener('click', (e) => {
      if (!statPop.classList.contains('open')) return;
      if (statPop.contains(e.target) || statBtn.contains(e.target)) return;
      setOpen(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  }
  // Sunucu ekrani (dialog)
  $('dlg-close').onclick = () => { const sl = currentDialog && currentDialog.slot; stopAutoCountdown(false); bridge.dialog.cancel(sl); $('dlg-modal').classList.add('hidden'); };
  $('dlg-auto-cancel').onclick = () => { stopAutoCountdown(true); window.toast(T('tAutoStoppedYou'), 'ok'); };
  $('dlg-sendcmd').onclick = submitDialogAsCommand;
  // Pencere kontrolleri
  $('win-min').onclick = () => bridge.win.minimize();
  $('win-max').onclick = () => bridge.win.maximize();
  $('win-close').onclick = () => bridge.win.close();
  // Join messages
  $('join-add').onclick = () => {
    if (!cfg) return;
    cfg.joinMessages.commands.push({ command: '', delay: 2, enabled: true });
    persistJoin();
  };
  $('join-run').onclick = async () => {
    const r = await bridge.bot.runJoin(effChatSlot());
    window.toast(r && r.ok ? T('tJoinRan') : T('tConnectFirst'), r && r.ok ? 'ok' : 'warn');
  };
  // Proxies
  $('p-add').onclick = addProxy;
  if ($('tor-start')) { $('tor-start').onclick = toggleVpn; $('tor-new').onclick = newTorIdentity; $('vpn-settings').onclick = openVpnSettings; $('vpn-settings-save').onclick = saveVpnSettings; $('vpn-country').onclick = openVpnCountries; $('vpn-country-done').onclick = saveVpnCountries; $('vpn-country-reset').onclick = resetVpnCountries; renderTor(); }
  // Logs - "Otomatik kaydir" kaldirildi, kayitlar akilli kayar
  $('log-clear').onclick = async () => { await bridge.logs.clear(); logBox.innerHTML = ''; seenLogIds.clear(); window.toast(T('tLogsCleared'), 'info'); };
  $('log-export').onclick = async () => {
    const r = await bridge.logs.export();
    if (r && r.ok) window.toast(T('tLogsSaved') + r.path, 'ok');
  };
  document.querySelectorAll('#log-filters input').forEach((el) => {
    el.onchange = async () => {
      if (el.checked) logFilters.add(el.dataset.lvl); else logFilters.delete(el.dataset.lvl);
      await renderLogHistory();
    };
  });
  // Settings
  $('s-theme').onchange = () => {
    document.body.dataset.theme = $('s-theme').value;
    save({ settings: { theme: $('s-theme').value } });
    window.toast($('s-theme').value === 'dark' ? T('tThemeDark') : T('tThemeLight'), 'ok');
  };
  $('s-lang').onchange = async () => {
    window.__lang = $('s-lang').value;
    await save({ settings: { language: $('s-lang').value } });
    window.applyI18n();
    renderAccounts(); renderProxies(); renderSpamList(); renderJoinList();
    renderSpamProfiles(); paintUpdateState();
    renderMacro(); renderSlotTabs(); applyState(state);
    document.documentElement.lang = $('s-lang').value;
    window.toast(T('tLangSet'), 'ok');
  };
  $('s-openfolder').onclick = () => bridge.config.openFolder();
  $('s-openlog').onclick = () => bridge.openLog();
  // Guncelleme: tek tikla indir, sessiz kur ve yeniden baslat.
  const uBtn = $('upd-btn'); if (uBtn) uBtn.onclick = installUpdateNow;
  // Uygulama bilgileri (kucuk "i" tusu)
  const itg = $('s-info-toggle'); const ipn = $('s-info-panel');
  if (itg && ipn) {
    itg.onclick = () => {
      const on = !ipn.classList.contains('open');
      ipn.classList.toggle('open', on);
      itg.setAttribute('aria-expanded', on ? 'true' : 'false');
    };
  }
  // BAGLANTI sayfasindaki ince cizgi + disli: ayarlari asagi dogru acar
  const csGear = $('cs-gear'); const csPanel = $('cs-panel');
  if (csGear && csPanel) {
    csGear.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const on = !csPanel.classList.contains('open');
      csPanel.classList.toggle('open', on);
      csGear.classList.toggle('open', on);
      csGear.setAttribute('aria-expanded', on ? 'true' : 'false');
    };
  }
  // Otomatik yeniden baglanma sayfasi
  const rUn = $('r-unlimited');
  if (rUn) rUn.addEventListener('change', updateReconnectFields);
  // Ust bardaki sunucu / hesap cipleri
  bindSbPop('sb-server-btn', 'sb-server-pop');
  bindSbPop('sb-account-btn', 'sb-account-pop');
  // --- Hesap secme penceresi -----------------------------------------------
  const amSave = $('am-save'); if (amSave) amSave.onclick = () => { if (vpnPick) commitVpnPicker(); else if (spamAct) commitSpamAct(); else if (featPick) commitFeatPicker(featPick.sel.slice()); };
  // secimi silmeden kapat
  const amOff = $('am-off'); if (amOff) amOff.onclick = () => { if (featPick) commitFeatPicker(featPick.sel.slice(), false); };
  const amAll = $('am-all'); if (amAll) amAll.onclick = () => { if (vpnPick) { vpnPick.sel = accIdList(); renderVpnAccountPicker(); } else if (spamAct) { spamAct.sel = accIdList(); renderFeatPicker(); } else if (featPick) { featPick.sel = accIdList(); renderFeatPicker(); } };
  const amNone = $('am-none'); if (amNone) amNone.onclick = () => { if (vpnPick) { vpnPick.sel = []; renderVpnAccountPicker(); } else if (spamAct) { spamAct.sel = []; renderFeatPicker(); } else if (featPick) { featPick.sel = []; renderFeatPicker(); } };
  const amCan = $('am-cancel'); if (amCan) amCan.onclick = () => { if (vpnPick) closeVpnAccountPicker(); else if (spamAct) closeSpamActPicker(); else closeFeatPicker(); };
  const amMod = $('acc-modal');
  if (amMod) amMod.addEventListener('click', (e) => { if (e.target !== amMod) return; if (vpnPick) closeVpnAccountPicker(); else if (spamAct) closeSpamActPicker(); else closeFeatPicker(); });
  const vpnSettingsMod = $('vpn-settings-modal'); if (vpnSettingsMod) vpnSettingsMod.addEventListener('click', (e) => { if (e.target === vpnSettingsMod) closeVpnSettings(); });
  const vpnCountryMod = $('vpn-country-modal'); if (vpnCountryMod) vpnCountryMod.addEventListener('click', (e) => { if (e.target === vpnCountryMod) vpnCountryMod.classList.add('hidden'); });
  // --- PANEL'e ayar sabitleme ---------------------------------------------
  const dAdd = $('dash-add'); if (dAdd) dAdd.onclick = openTilePicker;
  const fpSave = $('fp-save');
  if (fpSave) fpSave.onclick = async () => {
    const keys = (tilePick || []).slice();
    closeTilePicker();
    await save({ settings: { dashTiles: keys } });
    renderDashTiles();
    window.toast(T('tSettingSaved'), 'ok');
  };
  const fpCan = $('fp-cancel'); if (fpCan) fpCan.onclick = closeTilePicker;
  const fpMod = $('feat-modal');
  if (fpMod) fpMod.addEventListener('click', (e) => { if (e.target === fpMod) closeTilePicker(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (vpnPick) closeVpnAccountPicker();
    else if (spamAct) closeSpamActPicker();
    else if (featPick) closeFeatPicker();
    if (tilePick) closeTilePicker();
    if ($('vpn-settings-modal') && !$('vpn-settings-modal').classList.contains('hidden')) closeVpnSettings();
    if ($('vpn-country-modal') && !$('vpn-country-modal').classList.contains('hidden')) $('vpn-country-modal').classList.add('hidden');
  });
  $('s-reset').onclick = async () => {
    if (!confirm(T('tResetAsk'))) return;
    cfg = await bridge.config.reset();
    location.reload();
  };
}

safe(bindStatic, 'bindStatic');
boot().catch((e) => fatal('[boot] ' + e.message));
window.__stage.rendererEnd = true;
