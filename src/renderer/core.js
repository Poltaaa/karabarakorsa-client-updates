'use strict';
/* ===========================================================================
   core.js - EN ONCE yuklenir. Hata yakalama, navigasyon, akici bilesenler
   (custom dropdown, toast), i18n uygulayici. renderer.js'ten bagimsiz calisir.
   =========================================================================== */
window.__stage = { scripts: true, rendererParsed: false, rendererEnd: false, bootDone: false };
window.__errors = [];

function report(msg) {
  window.__errors.push(msg);
  const el = document.getElementById('fatal');
  const tx = document.getElementById('fatal-text');
  if (el) {
    el.classList.remove('hidden');
    if (tx) tx.textContent = window.__errors.join('\n');
    else el.textContent = window.__errors.join('\n');
  }
  try { if (window.api && window.api.diag) window.api.diag(msg); } catch (_) {}
  console.error(msg);
}
window.report = report;
window.addEventListener('error', (e) => report('[JS ERROR] ' + (e.message || e.error) + '  ->  ' + (e.filename || '') + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', (e) => report('[PROMISE] ' + (e.reason && e.reason.message ? e.reason.message : e.reason)));

/* --------------------------- Sayfa gecisi --------------------------------- */
const firstPage = ((document.querySelector('.page.active') || {}).id || 'page-dashboard').replace(/^page-/, '');
let pageHistory = [firstPage];
let pageHistoryIndex = 0;

function navigate(page, options) {
  const target = document.getElementById('page-' + page);
  if (!target) return;
  const opts = options || {};
  const current = pageHistory[pageHistoryIndex];
  if (opts.record !== false && page !== current) {
    pageHistory = pageHistory.slice(0, pageHistoryIndex + 1);
    pageHistory.push(page);
    pageHistoryIndex = pageHistory.length - 1;
  }
  document.querySelectorAll('.nav').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.page').forEach((p) => {
    if (p === target) { p.classList.add('active'); p.classList.remove('leaving'); }
    else p.classList.remove('active');
  });
  const c = document.querySelector('.content');
  if (c) c.scrollTo({ top: 0, behavior: 'smooth' });
  // sayfa gorunur olunca kaydirma kenarlari yeniden hesaplanir
  try { requestAnimationFrame(() => window.enhanceScrollFade(target)); } catch (_) {}
  window.dispatchEvent(new CustomEvent('page-change', { detail: page }));
}
window.navigate = navigate;

function navigateHistory(delta) {
  const next = pageHistoryIndex + delta;
  if (next < 0 || next >= pageHistory.length) return false;
  pageHistoryIndex = next;
  navigate(pageHistory[pageHistoryIndex], { record: false });
  return true;
}
window.navigateBack = () => navigateHistory(-1);
window.navigateForward = () => navigateHistory(1);

document.addEventListener('click', (e) => {
  const back = e.target.closest('[data-history-back]');
  if (back) { e.preventDefault(); navigateHistory(-1); return; }
  const nav = e.target.closest('.nav');
  if (nav && nav.dataset.page) { navigate(nav.dataset.page); return; }
  const go = e.target.closest('[data-goto]');
  if (go) { e.preventDefault(); navigate(go.dataset.goto); }
});

// Metin olmayan arayuz elemanlarinda cift tiklama secim parlamasi yapmasin.
document.addEventListener('dblclick', (e) => {
  // Form alanlariyla sohbet/kayit konsollarinda secim ve kopyalama serbest.
  if (e.target.closest('input, textarea, [contenteditable="true"], .console')) return;
  e.preventDefault();
  const selection = window.getSelection && window.getSelection();
  if (selection) selection.removeAllRanges();
});

// Chromium'da yan fare tuslari button=3 (geri) ve button=4 (ileri) olarak gelir.
// Mousedown varsayilan tarayici gecisini engeller; mouseup uygulama gecmisini calistirir.
window.addEventListener('mousedown', (e) => {
  if (e.button === 3 || e.button === 4) e.preventDefault();
}, true);
window.addEventListener('mouseup', (e) => {
  if (e.button !== 3 && e.button !== 4) return;
  e.preventDefault();
  e.stopPropagation();
  navigateHistory(e.button === 3 ? -1 : 1);
}, true);

/* ------------------------------ Toast ------------------------------------- */
function toast(message, type) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.innerHTML = '<i class="tdot"></i><span></span><button class="tclose">&#10005;</button>';
  el.querySelector('span').textContent = message;
  while (host.childElementCount >= 4) host.removeChild(host.firstChild);
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  const kill = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 220); };
  el.querySelector('.tclose').onclick = kill;
  setTimeout(kill, type === 'error' ? 8000 : 4000);
}
window.toast = toast;

/* --------------------- Akici custom dropdown ------------------------------ */
/* Native <select> gizlenir, uzerine animasyonlu bir liste cizilir.
   Secim yapilinca native select degeri guncellenip 'change' tetiklenir,
   boylece mevcut tum mantik degismeden calisir.                              */
function buildSelect(sel) {
  if (sel.dataset.enhanced === '1') return;
  sel.dataset.enhanced = '1';
  sel.classList.add('native-hidden');

  const wrap = document.createElement('div');
  wrap.className = 'cselect';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cselect-btn';
  btn.innerHTML = '<span class="cselect-label"></span><i class="cselect-arrow"></i>';
  const menu = document.createElement('div');
  menu.className = 'cselect-menu';
  wrap.appendChild(btn); wrap.appendChild(menu);
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);

  const label = btn.querySelector('.cselect-label');
  const sync = () => {
    const opt = sel.options[sel.selectedIndex];
    label.textContent = opt ? opt.textContent : '';
    menu.querySelectorAll('.cselect-item').forEach((it) => it.classList.toggle('sel', it.dataset.value === sel.value));
  };
  const rebuild = () => {
    menu.innerHTML = '';
    Array.from(sel.options).forEach((o) => {
      const it = document.createElement('div');
      it.className = 'cselect-item';
      it.dataset.value = o.value;
      it.textContent = o.textContent;
      it.onmousedown = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
      it.onclick = (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        close();                                   // once kapat: menu acik kalmasin
        if (sel.value !== o.value) {
          sel.value = o.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        sync();
      };
      menu.appendChild(it);
    });
    sync();
  };
  const open = () => {
    document.querySelectorAll('.cselect.open').forEach((c) => c !== wrap && c.classList.remove('open'));
    wrap.classList.add('open');
    const active = menu.querySelector('.cselect-item.sel');
    if (active) active.scrollIntoView({ block: 'nearest' });
  };
  const close = () => wrap.classList.remove('open');
  btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); wrap.classList.contains('open') ? close() : open(); };
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
  sel.addEventListener('options-changed', rebuild);
  sel.addEventListener('change', sync);
  rebuild();
}
function enhanceSelects(root) {
  (root || document).querySelectorAll('select').forEach(buildSelect);
}
window.enhanceSelects = enhanceSelects;
window.refreshSelect = (sel) => sel.dispatchEvent(new Event('options-changed'));


/* ---------------------- Ozel sayi kutusu (spinner) ------------------------ */
const CHEV = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
function buildNumber(inp) {
  if (inp.dataset.numDone || !inp.parentNode) return;
  inp.dataset.numDone = '1';
  const wrap = document.createElement('div');
  wrap.className = 'numwrap';
  inp.parentNode.insertBefore(wrap, inp);
  wrap.appendChild(inp);
  const box = document.createElement('div');
  box.className = 'numbtns';
  box.innerHTML = '<button type="button" tabindex="-1" title="Arttir">' + CHEV('<path d="m6 15 6-6 6 6"/>') + '</button>'
    + '<button type="button" tabindex="-1" title="Azalt">' + CHEV('<path d="m6 9 6 6 6-6"/>') + '</button>';
  wrap.appendChild(box);

  const step = (dir) => {
    const st = Number(inp.step) || 1;
    const min = inp.min === '' ? -Infinity : Number(inp.min);
    const max = inp.max === '' ? Infinity : Number(inp.max);
    let v = Number(inp.value);
    if (!isFinite(v)) v = 0;
    v = Math.min(max, Math.max(min, v + dir * st));
    inp.value = String(v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  };
  box.querySelectorAll('button').forEach((b, i) => {
    const dir = i === 0 ? 1 : -1;
    let wait, rep;
    const stop = () => { clearTimeout(wait); clearInterval(rep); };
    b.addEventListener('mousedown', (e) => {          // basili tutunca hizlanir
      e.preventDefault();
      step(dir);
      wait = setTimeout(() => { rep = setInterval(() => step(dir), 70); }, 340);
    });
    b.addEventListener('mouseup', stop);
    b.addEventListener('mouseleave', stop);
    window.addEventListener('blur', stop);
  });
}
function enhanceNumbers(root) {
  (root || document).querySelectorAll('input[type="number"]').forEach(buildNumber);
}
window.enhanceNumbers = enhanceNumbers;

/* --------------------- Sifre alanlarinda goz tusu ------------------------- */
const EYE_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-2.8 3.5"/><path d="M6.5 7.8A16.6 16.6 0 0 0 2 12s3.6 7 10 7c1.5 0 2.9-.3 4.1-.8"/><path d="M9.9 10a3 3 0 0 0 4.2 4.2"/></svg>';

function buildPassword(inp) {
  if (inp.dataset.eyeDone || !inp.parentNode) return;
  inp.dataset.eyeDone = '1';
  const wrap = document.createElement('div');
  wrap.className = 'pwwrap';
  inp.parentNode.insertBefore(wrap, inp);
  wrap.appendChild(inp);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pweye';
  btn.tabIndex = -1;
  btn.title = window.t ? window.t('showPass') : 'Show password';
  btn.innerHTML = EYE_OPEN;
  btn.onclick = (e) => {
    e.preventDefault();
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.innerHTML = show ? EYE_OFF : EYE_OPEN;
    btn.title = window.t ? window.t(show ? 'hidePass' : 'showPass') : (show ? 'Hide password' : 'Show password');
    inp.focus();
  };
  wrap.appendChild(btn);
}
function enhancePasswords(root) {
  (root || document).querySelectorAll('input[type="password"]').forEach(buildPassword);
}
window.enhancePasswords = enhancePasswords;
window.EYE_OPEN = EYE_OPEN;
window.EYE_OFF = EYE_OFF;

/* ------------------ "+" ile acilip kapanan gelismis bolum ----------------- */
function bindAdvToggles(root) {
  (root || document).querySelectorAll('.adv-toggle[data-adv]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.onclick = () => {
      const panel = document.getElementById(btn.dataset.adv);
      if (!panel) return;
      const open = !panel.classList.contains('open');
      panel.classList.toggle('open', open);
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
  });
}
window.bindAdvToggles = bindAdvToggles;

/* --------------- Sag tik: secenegin kisa aciklamasi ----------------------- */
let tipEl = null;
function hideTip() {
  if (!tipEl) return;
  const el = tipEl;
  tipEl = null;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 220);
}
function showTip(x, y, title, text) {
  hideTip();
  const el = document.createElement('div');
  el.className = 'tipcard';
  el.innerHTML = '<div class="tt"></div><div class="tb"></div>';
  el.querySelector('.tt').textContent = title || '';
  el.querySelector('.tb').textContent = text || '';
  document.body.appendChild(el);
  const r = el.getBoundingClientRect();
  el.style.left = Math.min(Math.max(8, x + 4), window.innerWidth - r.width - 8) + 'px';
  el.style.top = Math.min(Math.max(8, y + 4), window.innerHeight - r.height - 8) + 'px';
  requestAnimationFrame(() => el.classList.add('open'));
  tipEl = el;
}
window.showTip = showTip;
window.hideTip = hideTip;

document.addEventListener('contextmenu', (e) => {
  const t = e.target;
  const host = t && t.closest ? t.closest('[data-tip], .check') : null;
  if (!host) return;
  // Satir icindeki tuslar (x, disli) aciklama balonu acmaz
  const btn = t.closest ? t.closest('button') : null;
  if (btn && host.contains(btn)) return;
  e.preventDefault();
  if (tipEl) { hideTip(); return; }        // ikinci sag tik: aciklamayi kapat
  const inp = host.querySelector('input, select');
  const key = host.dataset.tipKey
    || (inp && (inp.dataset.toggle || inp.id || (inp.dataset.lvl ? 'lvl' : ''))) || '';
  const all = window.TIPS || {};
  const dict = all[window.__lang || 'en'] || all.en || all;
  const text = host.dataset.tip || dict[key] || window.t('tipFallback');
  const label = host.querySelector('span');
  showTip(e.clientX, e.clientY, (label ? label.textContent : '').trim(), text);
});
document.addEventListener('click', hideTip);
document.addEventListener('scroll', hideTip, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });

/* ---------------------------- SVG ikonlar --------------------------------- */
const SVG = (d) => '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
window.ICON = {
  check: SVG('<path d="m5 13 4 4L19 7"/>'),
  edit: SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: SVG('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
  up: SVG('<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>'),
  down: SVG('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'),
  power: SVG('<path d="M12 3v9"/><path d="M7.6 6.4a7 7 0 1 0 8.8 0"/>')
};

/* ------------------------------ i18n -------------------------------------- */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = window.t(el.dataset.i18n);
    if (v && v !== el.dataset.i18n) el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const v = window.t(el.dataset.i18nPh);
    if (v && v !== el.dataset.i18nPh) el.placeholder = v;
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const v = window.t(el.dataset.i18nTitle);
    if (v && v !== el.dataset.i18nTitle) el.title = v;
  });
  // ozel secim kutularinin gorunen metinleri yeniden yazilir
  document.querySelectorAll('select').forEach((sel) => { try { window.refreshSelect(sel); } catch (_) {} });
}
window.applyI18n = applyI18n;

/* --------------------------- Acilis kontrolu ------------------------------ */
function showBlocker(title, lines) {
  const wrap = document.createElement('div');
  wrap.className = 'blocker';
  wrap.innerHTML = '<div class="blocker-card"><div class="blocker-title">' + title + '</div>' +
    lines.map((l) => '<p>' + l + '</p>').join('') + '</div>';
  document.body.appendChild(wrap);
}

/* --------- Kaydirilabilir listelerde yumusak kenar (ani kesilme yok) ------ */
function paintFade(el) {
  const over = el.scrollHeight - el.clientHeight;
  if (over < 8) { el.classList.remove('fade-top', 'fade-bot'); return; }
  el.classList.toggle('fade-top', el.scrollTop > 6);
  el.classList.toggle('fade-bot', el.scrollTop < over - 6);
}
function enhanceScrollFade(root) {
  (root || document).querySelectorAll('.list, .mini-log').forEach((el) => {
    if (el.dataset.fadeDone) { paintFade(el); return; }   // sadece durumu tazele
    el.dataset.fadeDone = '1';
    el.classList.add('softfade');
    el.addEventListener('scroll', () => paintFade(el), { passive: true });
    paintFade(el);
  });
}
window.enhanceScrollFade = enhanceScrollFade;
window.addEventListener('resize', () => enhanceScrollFade());

document.addEventListener('DOMContentLoaded', () => {
  enhanceSelects();
  enhanceNumbers();
  enhancePasswords();
  enhanceScrollFade();
  bindAdvToggles();
  const fx = document.getElementById('fatal-close');
  if (fx) fx.onclick = () => {
    window.__errors.length = 0;
    const el = document.getElementById('fatal');
    const tx = document.getElementById('fatal-text');
    if (tx) tx.textContent = '';
    if (el) el.classList.add('hidden');
  };
  if (!window.api) {
    showBlocker('UYGULAMA YANLIS SEKILDE ACILDI', [
      'Bu dosyayi tarayicida actiniz. Bu sekilde hicbir buton calismaz.',
      'Klasordeki <b>BASLAT.bat</b> dosyasina cift tiklayarak calistirin.',
      'Alternatif: klasorde terminal acip <b>npm install</b> sonra <b>npm start</b> yazin.'
    ]);
    return;
  }
  setTimeout(() => {
    const s = window.__stage;
    if (!s.rendererEnd) {
      report('[BOOT] renderer.js tamamlanmadi. Durum: ' + JSON.stringify(s));
      const foot = document.querySelector('.sidebar-foot');
      if (foot) foot.style.color = '#ff5f57';
    }
  }, 1200);
});
