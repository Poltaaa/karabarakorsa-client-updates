'use strict';
(() => {
  const el = id => document.getElementById('ab-' + id), api = window.api.autoBuild;
  const t = key => window.t(key), fmt = n => { try { return BigInt(n || 0).toLocaleString(window.__lang === 'tr' ? 'tr-TR' : 'en-US'); } catch (_) { return '0'; } };
  const aliases = { nether_wart:'nether yumrusu cehennem yumrusu nether mantari', soul_sand:'ruh kumu', soul_soil:'ruh topragi', stone:'tas', cobblestone:'kirik tas', glass:'cam', sand:'kum', dirt:'toprak', grass_block:'cimen', honey_block:'bal blogu', slime_block:'balcik slime', gravel:'cakil', oak_planks:'mese tahta', obsidian:'obsidyen', ice:'buz', snow_block:'kar blogu' };
  const normalize = s => String(s).toLocaleLowerCase('tr').replace(/ı/g,'i').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/_/g,' ');
  const reasonText = {
    manual_last_block:['Plan tamamlandı; son 1 blok elle yerleştirilmek üzere bırakıldı.','Pattern complete; the last block is left for manual placement.'],
    pattern_corner_unavailable:['Sıradaki boş hücre için erişilebilir dayanak veya yüklü duruş bulunamadı. Zemini/dayanağı kontrol et; dolu köşeye yürünmedi.','No supported empty frontier with a loaded stance. Check support/ground; no walk to a filled corner was issued.'],
    pathfinder_compatibility:['Yürüyüş bağımlılığı bu paketle uyumlu değil; Auto Build başlatılmadı. Paket 132’u ayrı klasöre çıkarıp BASLAT-132.bat ile bağımlılıkları yeniden kur.','The pathfinder dependency is incompatible; Auto Build was not started. Extract package 132 into a separate folder and reinstall with BASLAT-132.bat.'],
    server_moderation:['Sunucu ban bildirimi verdi. Otomatik tekrar durduruldu; sunucunun resmî itiraz kanalını kullan.','Server reported a ban. Automatic retries stopped; use the server’s official appeal channel.'],
    server_corrections:['Sunucu karakterin konumunu düzeltti; ilk belirgin düzeltmede inşa duraklatıldı. Tekrar denemeden teşhis kaydını ve sunucu kurallarını incele.','The server adjusted the character position; build paused on the first significant correction. Inspect diagnostics and server rules before retrying.'],
    inventory_changed:['Envanterden blok yenileme kararlı biçimde tamamlanamadı. Envanteri kontrol et.','Could not reliably refill the held block from inventory. Check inventory.'],
    permission_denied:['Sunucu: Bu adada bu hesabın Blok Koyabilme yetkisi yok. Ada sahibinden izin al; yetki verilmeden tekrar deneme.','Server: This account has no permission to place blocks on this island. Ask the island owner for permission before retrying.'],
    client_tick_order:['İstemcinin tick/paket sırası tutarsız; işlem güvenlik için duraklatıldı. Tekrar denemeden kaydı incele.','Client tick/packet ordering was inconsistent; paused for safety. Inspect diagnostics before retrying.'],
    client_tick_compatibility:['Fizik bağımlılığı tick-sonu uyumluluk katmanıyla eşleşmiyor; bağlantı başlatılmadı. Paketin kilitli bağımlılıklarını yeniden kur.','Physics dependency does not match the tick-end compatibility layer; connection was not started. Reinstall the locked dependencies.'],
    server_teleport:['Sunucu karakteri farklı bir konuma taşıdı; inşa duraklatıldı. Hedefleri ve sunucu kurallarını kontrol et.','The server moved the character to another position; build paused. Check targets and server rules.'],
    movement_disabled:['Sunucunun bildirdiği gerçek hareket hızı sıfır; yürüyüş duraklatıldı. Sunucudaki hareket kilidi kalkmadan tekrar deneme.','The server-reported effective movement speed is zero; walking paused. Wait until the server removes the movement lock.'],
    walk_stalled:['Karakter 12 saniyedir yerel yol hedefine anlamlı yaklaşamadı; inşa duraklatıldı. Otomatik tekrar yapılmadı.','No meaningful progress toward the local route goal for 12 seconds; build paused without automatic retries.'],
    row_route_blocked:['Sonraki şeride güvenli geçiş yok; yerleştirme yapılmadan duraklatıldı. Geçiş alanını kontrol et.','No safe continuation to the next strip; paused before placement. Check the working corridor.'],
    movement_cooldown:['Konum koruması beklemede. En az üç saniye bekle; nedeni incelemeden devam etme.','Position watchdog cooldown. Wait at least three seconds; inspect the cause before resuming.'],
    packet_guard:['Anormal giden paket yoğunluğu: inşa duraklatıldı. Kalıcı teşhis kaydını kontrol et; sunucuda tekrar tekrar deneme yapma.','Abnormal outbound packet traffic: build paused. Check the saved diagnostic log; do not repeatedly retry on the server.'],
    packet_cooldown:['Paket koruması beklemede. En az 3 saniye bekle; nedeni incelemeden devam etme.','Packet watchdog cooldown. Wait at least 3 seconds; inspect the cause before resuming.'],
    moving_at_target:['Karakter henüz duramadı. Zemini kontrol edip Devam et.','The character has not stopped yet. Check the floor, then Resume.'],
    look_not_sent:['Hedefe bakış sunucuya gönderilemedi. Aşama kaydını kontrol et.','Target view could not be sent. Check the phase log.'],
    equip_timeout:['Eşyayı ele alma yanıtı gecikti. Envanter işleminin bitmesini bekle.','Equipping timed out. Wait for the inventory operation to finish.'],
    escape_unverified:['Güvenli kaçış doğrulanamadı. Karakteri açık alana taşıyıp Devam et.','A safe escape could not be verified. Move to open space, then Resume.'],
    trap_risk:['Bu yerleştirme çıkışı kapatıyor; güvenli açı bulunamadı.','This placement blocks escape; no safe stance found.'],
    rescue_unavailable:['Yalnızca kendi bloklarıyla güvenli bir geçit açılamadı. Önceden var olan yapılar korunuyor.','No safe passage through owned blocks. Pre-existing structures are protected.'],
    rescue_changed:['Kurtarma bloğu değişti; kırma durduruldu.','Rescue block changed; digging stopped.'],
    rescue_not_visible:['Kurtarma bloğunun görünür yüzü yok.','No visible face of the rescue block.'],
    rescue_denied:['Sunucu kırmayı onaylamadı; kurtarma durakladı.','Server did not acknowledge digging; rescue paused.'],
    rescue_too_slow:['Bu blok eldeki araçla güvenli kurtarma için çok yavaş kırılıyor.','This block takes too long to dig with the available tool.'],
    exit_not_reached:['Çıkış henüz gerçekleşmedi. Arkayı kapatma başlamadı.','Exit has not been reached. Resealing has not started.'],
    repair_pending:['Açılmış kurtarma geçidi henüz kapatılamadı; iş tamamlanmadı.','Opened rescue passage could not be resealed; job is not complete.'],
    unreachable_cells:['Bu katmanda ulaşılamayan hücreler var; üst katmana geçilmedi.','Some cells in this layer remain unreachable; upper layer is locked.'],
    join_pending:['Giriş komutları devam ediyor. Tamamlanmasını bekle.','Join commands are still running. Wait until they finish.'],
    manual:['Kullanıcı duraklattı / durdurdu.','Paused / stopped by user.'], materials:['Blok bitti. Envanteri doldurup Devam et.','Out of blocks. Refill inventory, then Resume.'],
    no_path:['Güvenli yol bulunamadı. Engel veya geçit için alanı kontrol et.','No safe path. Check obstacles and passages.'], no_progress:['Karakter ilerleyemedi. Sıkıştığı alanı kontrol et.','No movement progress. Check where the character is stuck.'],
    wart_soil:['Nether wart yalnızca ruh kumu üstüne ekilir. Ekim Y değeri ruh kumundan 1 fazla olmalı (65 → 66).','Nether wart requires soul sand directly underneath. Planting Y must be one above the soul sand (65 → 66).'],
    no_support:['Hedefin yanında yerleştirme yüzeyi yok. Ekstra iskele otomatik kurulmaz.','No supporting placement face. Extra scaffolding is not placed automatically.'],
    unsafe_stance:['Yerleştirme için güvenli duruş yeri yok.','No safe position from which to place the block.'], out_of_reach:['Hedef görünür veya erişilebilir değil.','Target is not visible or in reach.'],
    server_refused:['Sunucu yerleştirmeyi onaylamadı. Ada / inşa izinlerini kontrol et.','Server did not confirm placement. Check build permissions.'], placement_failed:['Blok yerleştirilemedi / yanıt alınamadı. Kaydı ve izinleri kontrol et.','Placement failed / no response. Check logs and permissions.'],
    falling_block:['Bu blok düşer; hedefin altında sağlam destek gerekli.','This block falls; solid support is required underneath.'], chunk_unloaded:['Hedef hücre sunucu tarafından yüklenmemiş. Komşu chunk tahmin edilmez; ada alanını ve seçimi kontrol et.','The target cell is not loaded by the server. Unknown chunks are not assumed empty; check the island area and selection.'],
    feature_conflict:['Bu hesapta Auto Farm, Auto Sell ve Spawner Koruma kapalı olmalı.','Turn off Auto Farm, Auto Sell and Spawner Protect for this account.'],
    window_open:['Önce açık Minecraft ekranını kapat.','Close the open Minecraft window first.'], world_changed:['Dünya değişti; güvenlik için iş durduruldu.','World changed; build stopped for safety.'], disconnected:['Bağlantı kapandı; iş yeniden başlamaz.','Disconnected; the build will not restart automatically.'],
    world_changed_at_target:['Dönme sırasında hedef / envanter değişti. Kontrol edip Devam et.','Target / inventory changed while turning. Check, then Resume.'], settling:['Son işlem tamamlanıyor. Birkaç saniye bekle.','Last operation is settling. Wait a few seconds.'],
    coordinates:['XYZ değerleri boş olmayan tam sayılar olmalı.','XYZ coordinates must be non-empty integers.'], world_bounds:['Koordinatlar bu dünyanın sınırları dışında.','Coordinates are outside this world’s bounds.'], block_not_placeable:['Bu kayıt blok eşyası değil veya birden fazla hücre kaplıyor.','This block has no matching item or occupies multiple cells.'], not_connected:['Önce sunucuya ve inşa edeceğin dünyaya gir.','First join the server and the world you want to build in.'], busy:['Önce mevcut işi durdur.','Stop the current job first.']
  };
  let sessions = [], slot = 0, accountId = '', blocks = [], filtered = [], selected = 'stone', build = { status:'idle' }, request = 0, previewTimer, confirmed = '', selectorSig = '', uiMessage = '', pending = false, searchIndex = 0;
  const message = code => reasonText[code]?.[window.__lang === 'tr' ? 0 : 1] || code || '';
  const online = () => sessions.some(s => s.slot === slot && s.status === 'ONLINE');
  const locked = () => ['running','paused'].includes(build.status) || build.settling;
  const icon = name => { const style = iconStyle(name); return `<i class="ab-icon${style ? '' : ' missing'}" style="${style}"></i>`; };
  function pickLabel() {
    const b = blocks.find(b => b.name === selected);
    el('selected').innerHTML = `${icon(selected)}<span>${esc(b?.displayName || selected)}</span><span class="ab-arrow">▾</span>`;
  }
  function spec() {
    const p = {};
    for (let i = 1; i <= 2; i++) { p['corner' + i] = {}; for (const k of ['x','y','z']) {
      const v = el(k + i).value.trim(); if (!v || !Number.isSafeInteger(Number(v))) throw Error('coordinates');
      p['corner' + i][k] = Number(v);
    } }
    return { ...p, autoPass:el('auto-pass').checked, block:selected, solidPattern:blocks.find(b=>b.name===selected)?.solid===true, rescueOwn:el('rescue-own').checked, fastWalk:el('fast-walk').checked };
  }
  function paint() {
    const status = { idle:'abIdle', running:'abRunning', paused:'abPaused', stopped:'abStopped', complete:'abComplete' };
    setTextIfChanged(el('badge'), t(status[build.status] || 'abIdle'));
    for (const k of ['placed','skipped','inventory']) setTextIfChanged(el(k), fmt(build[k]));
    setTextIfChanged(el('layer'), build.layer ?? '—');
    el('progress').value = build.percent || 0;
    setTextIfChanged(el('counter'), `${fmt(build.processed)} / ${fmt(build.total)}`);
    setTextIfChanged(el('target'), build.currentTarget ? `${t('abTarget')}: X ${build.currentTarget.x} · Y ${build.currentTarget.y} · Z ${build.currentTarget.z}` : '');
    const phases = {auto_pass_wait:['Otomatik geç: konumun durulması bekleniyor','Automatic continue: waiting for stable position'],idle:['Hazır','Ready'],prepare:['Hazırlanıyor','Preparing'],walk:['Hedefe yürüyor','Walking to target'],strafe:['A/D ile yan sıraya geçiyor','Side-stepping to the next row'],settle:['Hareket duruluyor','Settling movement'],equip:['Blok ele alınıyor','Equipping block'],restock:['Envanterden blok yenileniyor','Refilling block from inventory'],aim:['Hedefe bakılıyor','Aiming at target'],place:['Sunucu onayı bekleniyor','Waiting for server acknowledgement'],confirmed:['Yerleştirme onaylandı','Placement confirmed'],scan:['Katman taranıyor','Scanning layer'],defer:['Diğer uygun hücreler deneniyor','Trying other supported cells'],reposition:['Uygun açıya geçiliyor','Repositioning automatically'],column_step:['Sonraki sütuna kontrollü yürüyor','Walking to the next column'],align_stance:['Sabit duruşa hizalanıyor','Aligning fixed stance'],pattern_check:['Duruş ve sonraki sıra denetleniyor','Checking stance and next row'],manual_handoff:['Son blok sana bırakılıyor','Leaving the last block for you'],escape_check:['Kaçış yolu kontrol ediliyor','Checking escape route'],escape_walk:['Güvenli çıkışa yürüyor','Walking to safe exit'],rescue_plan:['Kurtarma geçidi planlanıyor','Planning rescue passage'],rescue_break:['Kendi bloğuyla geçit açıyor','Opening passage through own blocks'],rescue_close:['Dışarıdan arkayı kapatıyor','Closing passage from outside'],complete:['Tamamlandı','Complete'],stop_brake:['Tuşlar bırakıldı; doğal hareket bitiyor','Inputs released; natural movement settling'],stopped:['Durduruldu','Stopped']};
    const phase = phases[build.autoPassWaiting?'auto_pass_wait':(build.phase || 'idle')]?.[window.__lang === 'tr' ? 0 : 1] || build.phase || '';
    setTextIfChanged(el('phase'), (window.__lang === 'tr' ? 'Aşama: ' : 'Phase: ') + phase);
    setTextIfChanged(el('repairs'), (window.__lang === 'tr' ? 'Kurtarma: kırılan ' : 'Rescue: broken ') + fmt(build.rescueBroken) + (window.__lang === 'tr' ? ' · Kapatılacak ' : ' · To reseal ') + fmt(build.repairedOpen));
    setTextIfChanged(el('reason'), (message(build.reason) || uiMessage)+(build.manualRemaining&&build.manualTarget?' X '+build.manualTarget.x+' · Y '+build.manualTarget.y+' · Z '+build.manualTarget.z:''));
    if(locked() && typeof build.fastWalk === 'boolean')el('fast-walk').checked=build.fastWalk;
    if(locked() && typeof build.rescueOwn === 'boolean')el('rescue-own').checked=build.rescueOwn;
    if(locked()&&typeof build.autoPass==='boolean')el('auto-pass').checked=build.autoPass;
    el('auto-pass').disabled=pending;
    const passNotes={limit:['Otomatik geç sınırı: 60 saniyede ikinci konum düzeltmesi. Elle incele.','Automatic continue limit: second correction within 60 seconds. Review manually.'],position_changed:['Beklerken konum tekrar değişti; otomatik geç iptal edildi.','Position changed again while waiting; automatic continue cancelled.'],timeout:['Konum durulmadı; otomatik geç iptal edildi.','Position did not settle; automatic continue cancelled.']};
    setTextIfChanged(el('auto-pass-note'),passNotes[build.autoPassStatus]?.[window.__lang==='tr'?0:1]||t('abAutoPassHint'));
    el('account').disabled = pending;
    for (const k of ['x1','y1','z1','x2','y2','z2','selected','copy1','copy2','rescue-own','fast-walk']) el(k).disabled = !!locked();
    el('start').disabled = !online() || !!locked() || pending;
    el('pause').disabled = build.status !== 'running' || pending;
    el('resume').disabled = !online() || build.status !== 'paused' || !!build.settling || pending;
    el('stop').disabled = !locked() || pending;
  }
  function closeMenu() { el('menu').classList.add('hidden'); el('selected').setAttribute('aria-expanded','false'); }
  function renderOptions() {
    const space = el('list-space'), start = Math.max(0, Math.floor(el('list').scrollTop / 48));
    const slice = filtered.slice(start, start + 5);
    space.style.height = Math.max(filtered.length * 48, 1) + 'px';
    space.innerHTML = slice.map((b,i) => `<button class="ab-option${start+i === searchIndex ? ' focused' : ''}" role="option" aria-selected="${b.name === selected}" aria-disabled="${!b.placeable}" data-block="${attr(b.name)}" style="top:${(start+i)*48}px" title="${attr(b.placeable ? b.name : t('abDisabledBlock'))}">${icon(b.name)}<span>${esc(b.displayName)}<small>${esc(b.name)}</small></span></button>`).join('');
    setTextIfChanged(el('menu-note'), filtered.length ? `${filtered.length} · ${t('abDisabledBlock')}` : t('abNoMatches'));
  }
  function filter() { const q = normalize(el('search').value); filtered = blocks.filter(b => b.search.includes(q)); searchIndex = 0; el('list').scrollTop = 0; renderOptions(); }
  el('selected').onclick = () => {
    if (locked()) return;
    if (!el('menu').classList.contains('hidden')) return closeMenu();
    el('menu').classList.remove('hidden'); el('selected').setAttribute('aria-expanded','true'); el('search').value = ''; filter(); el('search').focus();
  };
  el('search').oninput = filter;
  let scrollFrame = 0;
  el('list').onscroll = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; renderOptions(); }); };
  function choose(name) { const b = blocks.find(b => b.name === name); if (!b?.placeable) return; selected = name; confirmed = ''; pickLabel(); closeMenu(); schedulePreview(); el('selected').focus(); }
  el('list').onclick = e => { const b = e.target.closest('[data-block]'); if (b) choose(b.dataset.block); };
  el('search').onkeydown = e => {
    if (e.key === 'Escape') { closeMenu(); el('selected').focus(); }
    if (e.key === 'Enter') { e.preventDefault(); if (filtered[searchIndex]) choose(filtered[searchIndex].name); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); searchIndex = Math.max(0, Math.min(filtered.length-1, searchIndex + (e.key === 'ArrowDown' ? 1 : -1)));
      const v = el('list'); if (searchIndex*48 < v.scrollTop || (searchIndex+1)*48 > v.scrollTop+192) v.scrollTop = Math.max(0,(searchIndex-3)*48);
      renderOptions();
    }
  };
  document.addEventListener('click', e => { if (!el('picker').contains(e.target)) closeMenu(); });
  async function preview() {
    const token = request, capturedSlot = slot;
    if (!online()) { setTextIfChanged(el('preview'),t('abOffline')); return; }
    try {
      const p = spec(), result = await api.preview(slot,p);
      if (token !== request || capturedSlot !== slot) return;
      if (!result?.ok) throw Error(result?.error || 'not_connected');
      setTextIfChanged(el('preview'), `${t('abUpper')}: ${fmt(result.total)} (${result.min.y} → ${result.max.y}) · ${t('abInventory')}: ${fmt(result.inventory)}. ${t('abNeed')}${selected === 'nether_wart' ? ' ' + t('abWartHint') : p.solidPattern ? (window.__lang==='tr'?' Sabit köşe → üçlü şerit. Son 1 blok elle bırakılır; otomatik kurtarma/kapatma kullanılmaz.':' Fixed corner → three-cell strips. Last block is manual; no automatic rescue/resealing.') : ''}`);
      if (!locked()) { build.inventory = result.inventory; paint(); }
      if (accountId) { const next = { ...(cfg.autoBuild?.perAccount || {}), [accountId]:p }; const updated = await bridge.config.patch({ autoBuild:{ perAccount:next } }); if (updated) cfg = updated; }
    } catch(e) { setTextIfChanged(el('preview'),message(e.message)); }
  }
  function schedulePreview() { uiMessage = ''; confirmed = ''; clearTimeout(previewTimer); previewTimer = setTimeout(preview,350); }
  el('auto-pass').onchange = async () => {
    const capturedSlot=slot,capturedAccount=accountId,enabled=el('auto-pass').checked;
    try{
      const result=await api.setAutoPass(capturedSlot,enabled);if(!result?.ok)throw Error(result?.error||'not_connected');
      if(capturedAccount){const saved=cfg.autoBuild?.perAccount||{};const next={...saved,[capturedAccount]:{...(saved[capturedAccount]||{}),autoPass:enabled}};const updated=await bridge.config.patch({autoBuild:{perAccount:next}});if(updated)cfg=updated;}
      if(capturedSlot===slot){build=await api.state(capturedSlot);paint();}
    }catch(e){if(capturedSlot===slot)el('auto-pass').checked=!enabled;window.toast(message(e.message),'error');}
  };
  el('rescue-own').onchange = schedulePreview;el('fast-walk').onchange = schedulePreview;
  for (let i=1;i<=2;i++) {
    for (const k of ['x','y','z']) el(k+i).oninput = schedulePreview;
    el('copy'+i).onclick = async () => { const from = slot; const p = await api.position(slot); if (from !== slot) return; if (!p?.ok) return window.toast(message(p?.error || 'not_connected'),'error'); for (const k of ['x','y','z']) el(k+i).value = p[k]; schedulePreview(); };
  }
  async function load() {
    const token = ++request; closeMenu(); confirmed = ''; clearTimeout(previewTimer);
    accountId = sessions.find(s => s.slot === slot)?.accountId || '';
    const saved = cfg?.autoBuild?.perAccount?.[accountId]; selected = saved?.block || 'stone';el('auto-pass').checked=saved?.autoPass===true;el('rescue-own').checked=saved?.rescueOwn !== false;el('fast-walk').checked=saved?.fastWalk === true;
    for (let i=1;i<=2;i++) for (const k of ['x','y','z']) el(k+i).value = saved?.['corner'+i]?.[k] ?? '';
    try {
      const [c,s] = await Promise.all([api.catalog(slot),api.state(slot)]); if (token !== request) return;
      blocks = (c?.blocks || []).map(b => ({...b,search:normalize(`${b.name} ${b.displayName} ${aliases[b.name] || ''}`)}));
      build = s || { status:'idle' };
      setTextIfChanged(el('version'),`${t('abVersion')}: ${c?.version || '—'}${online() ? '' : ' ('+t('abOffline')+')'}`);
      if (build.block && locked()) {el('auto-pass').checked=build.autoPass===true;selected = build.block;el('rescue-own').checked=build.rescueOwn !== false;el('fast-walk').checked=build.fastWalk === true;}
      iconSetup(); pickLabel(); paint(); await preview();
    } catch(e) { window.toast(e.message,'error'); }
  }
  function refreshSessions(data, reload = true) {
    const wasOnline = online();
    sessions = data.list || [];
    const previous = slot;
    if (!sessions.some(s => s.slot === slot)) slot = data.active || sessions[0]?.slot || 0;
    const sig = JSON.stringify(sessions.map(s => [s.slot,s.accountId,s.name,s.status]));
    if (sig !== selectorSig) {
      selectorSig = sig; el('account').innerHTML = sessions.length ? sessions.map(s => `<option value="${s.slot}">#${s.slot} ${esc(s.name)} · ${s.status}</option>`).join('') : `<option value="0">${esc(t('abOffline'))}</option>`;
      el('account').value = String(slot); window.refreshSelect(el('account'));
    }
    paint(); if (reload && (previous !== slot || (!wasOnline && online())) && el('account').closest('.page').classList.contains('active')) load();
  }
  el('account').onchange = () => { const next = Number(el('account').value); if (next !== slot) { slot = next; load(); } };
  async function action(kind) {
    if (pending) return;
    let p; const actionSlot = slot;
    try {
      uiMessage = '';
      if (kind === 'start') {
        p = spec(); const signature = JSON.stringify([slot,p]);
        if (confirmed !== signature) { const check = await api.preview(actionSlot,p); if (actionSlot !== slot) return; if (!check?.ok) throw Error(check?.error || 'not_connected'); confirmed = signature; uiMessage = `${t('abConfirm')} (${fmt(check.total)})`; paint(); return; }
      }
      pending = true; paint();
      const result = kind === 'start' ? await api.start(actionSlot,p) : await api[kind](actionSlot);
      if (!result?.ok) throw Error(result?.error || 'not_connected');
      const latest = await api.state(actionSlot); if (actionSlot === slot) { build = latest; paint(); }
    } catch(e) { uiMessage = message(e.message); window.toast(message(e.message),'error'); }
    finally { pending = false; paint(); }
  }
  for (const k of ['start','pause','resume','stop']) el(k).onclick = () => action(k);
  bridge.on('autobuild-state', s => { if (s.slot !== slot) return; build = s; uiMessage = ''; if (el('account').closest('.page').classList.contains('active')) paint(); });
  bridge.on('slots', refreshSessions);
  document.getElementById('s-lang')?.addEventListener('change', () => {
    setTimeout(() => { paint(); pickLabel(); selectorSig = ''; refreshSessions({list:sessions,active:slot}); }, 100);
  });
  window.addEventListener('page-change', async e => {
    closeMenu(); if (e.detail !== 'autobuild') return;
    refreshSessions(await bridge.bot.slots(), false); await load();
  });
})();
