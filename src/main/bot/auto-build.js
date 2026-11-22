'use strict';
// Manual, air-only cuboid builder + soul-sand nether-wart planting. Constant-memory BigInt cursor; all movement
// goes through Mineflayer physics/pathfinder, all placement through vanilla API.
const { EventEmitter } = require('events');
const { travelPolicy, headingError } = require('./build-travel');
const { GoalProgress } = require('./movement-watch');
const { BuildRows } = require('./build-rows');
const { CropRows } = require('./build-crop-rows');
const { movementAttributes,movementInfo } = require('./movement-attributes');
const { BuildSafety, key } = require('./build-safety');
const BUILD = require('../build-info').package;
const CATALOGS = new WeakMap();
const AIR = new Set(['air', 'cave_air', 'void_air']);
const HAZARD = /^(lava|flowing_lava|fire|soul_fire|cactus|magma_block|powder_snow|sweet_berry_bush|wither_rose|campfire|soul_campfire)$/;
const MULTI = /(^|_)(door|bed)$|^(tall_grass|large_fern|sunflower|lilac|rose_bush|peony|tall_seagrass|double_plant|pitcher_plant|small_dripleaf)$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PLACE_INTERVAL = 275; // Below the unchanged 4/s local placement guard.
function fail(code) { const e = new Error(code); e.code = code; return e; }
function region(a, b, limits = { minY: -64, maxY: 319 }) {
  if (!a || !b) throw fail('coordinates');
  for (const p of [a, b]) for (const k of ['x', 'y', 'z']) {
    if (!Number.isSafeInteger(p[k])) throw fail('coordinates');
    if (k === 'y' ? p[k] < limits.minY || p[k] > limits.maxY : Math.abs(p[k]) > 29999983) throw fail('world_bounds');
  }
  const min = {}, max = {};
  for (const k of ['x', 'y', 'z']) { min[k] = Math.min(a[k], b[k]); max[k] = Math.max(a[k], b[k]); }
  const nx = BigInt(max.x - min.x + 1), nz = BigInt(max.z - min.z + 1);
  return { min, max, nx, nz, layer: nx * nz, total: nx * nz * BigInt(max.y - min.y + 1) };
}
function cell(r, cursor) {
  if (cursor < 0n || cursor >= r.total) return null;
  const y = r.min.y + Number(cursor / r.layer), row = cursor % r.layer / r.nx;
  const off = cursor % r.nx;
  return { x: r.min.x + Number(row % 2n ? r.nx - 1n - off : off), y, z: r.min.z + Number(row) };
}
function catalog(registry) {
  if (CATALOGS.has(registry)) return CATALOGS.get(registry);
  const result = registry.blocksArray.map(b => {
    const item = registry.itemsByName[b.name] || (registry.items?.[b.id]?.name === b.name ? registry.items[b.id] : null);
    return { name: b.name, displayName: b.displayName || b.name, itemName: item?.name || '', itemId: item?.id ?? null,
      solid: b.boundingBox==='block', placeable: !!item && !AIR.has(b.name) && !MULTI.test(b.name) };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
  CATALOGS.set(registry, result); return result;
}
// Pathfinder 2.4.5 post-processes partial paths in-place. Those Move objects
// also belong to the live A* frontier; fractional floors (soul sand/slabs)
// corrupt subsequent 2ms slices unless the returned path is a snapshot.
// Keep this pinned-version compatibility shim in OUR source, not node_modules.
function snapshotPaths() {
  const AStar = require('mineflayer-pathfinder/lib/astar');
  if (AStar.prototype.__kbPathSnapshots) return;
  const original = AStar.prototype.makeResult;
  AStar.prototype.makeResult = function (...args) {
    const result = original.apply(this, args);
    result.path = result.path.map(n => Object.assign(Object.create(Object.getPrototypeOf(n)), n, {
      toBreak: n.toBreak.map(p => p.clone()), toPlace: n.toPlace.map(p => ({ ...p }))
    }));
    return result;
  };
  AStar.prototype.__kbPathSnapshots = true;
}
// prismarine-physics 1.11.1 looks up modern velocity floors using
// pos.floored().offset(0,-.5,0). On 7/8-height soul sand or honey this points
// one block TOO LOW. Correct that lookup, keeping its native multiplier,
// attributes, collision, gravity and predicted path physics unchanged.
function surfacePhysics(bot) {
  if (!bot.physics?.simulatePlayer) return () => {};
  const original = bot.physics.simulatePlayer;
  const missingModernSlowdown = ['1.21', '26.1'].includes(bot.registry.version?.majorVersion);
  const wrapped = function (state, world) {
    state.attributes=movementAttributes(state.attributes,this);
    const fixedWorld = { getBlock: q => {
      const p = state.pos;
      if (p.y - Math.floor(p.y) > .001 && q.x === Math.floor(p.x) && q.z === Math.floor(p.z) && q.y === Math.floor(p.y) - .5) {
        const below = world.getBlock(p.offset(0, -.5, 0));
        if (below && ['soul_sand', 'honey_block'].includes(below.name)) return below;
      }
      return world.getBlock(q);
    } };
    const result = original.call(this, state, fixedWorld);
    // This pinned physics release's velocity-floor feature table ends at
    // 1.20. Apply its own native constants on 1.21 AND 26.1, not a speed hack.
    if (missingModernSlowdown) {
      const below = world.getBlock(state.pos.offset(0, -.5, 0));
      const multiplier = below?.name === 'soul_sand' ? this.soulsandSpeed : below?.name === 'honey_block' ? this.honeyblockSpeed : 1;
      state.vel.x *= multiplier; state.vel.z *= multiplier;
    }
    return result;
  };
  bot.physics.simulatePlayer = wrapped;
  return () => { if (bot.physics.simulatePlayer === wrapped) bot.physics.simulatePlayer = original; };
}
function movements(bot, Movements, build = null) {
  const m = new Movements(bot);
  m.canDig = false; m.allow1by1towers = false; m.allowParkour = false;
  m.allowSprinting = false; m.allowFreeMotion = false; m.canOpenDoors = false;
  m.maxDropDown = 2; // Pathfinder counts the landing floor: two units = one foot-level drop.
  m.infiniteLiquidDropdownDistance = false; m.scafoldingBlocks = [];
  m.liquidCost = 6; m.exclusionAreasPlace.push(() => 100); m.exclusionAreasBreak.push(() => 100);
  for (const b of bot.registry.blocksArray) if (HAZARD.test(b.name)) m.blocksToAvoid.add(b.id);
  m.exclusionAreasStep.push(b => {
    if(!b?.position)return 100; // Pathfinder’s unloaded-block sentinel has no position.
    const floor = bot.blockAt(b.position.offset(0, -1, 0));
    // Native physics already slows these surfaces. The old +3 penalty was
    // applied twice per step, causing excessive detours / bounded-search failures.
    if(/^(soul_sand|honey_block)$/.test(floor?.name || ''))return .35;
    return /slime_block|ice/.test(floor?.name || '') ? 3 : 0;
  });
  const landing = m.getLandingBlock;
  m.getLandingBlock = function (node, dir) {
    const result = landing.call(this, node, dir); if (result) return result;
    // Upstream excludes the world's bottom floor from its while loop.
    const bottom = this.getBlock(node, dir.x, bot.game.minY - node.y, dir.z);
    if (bottom.physical && !HAZARD.test(bottom.name) && node.y - bottom.position.y <= this.maxDropDown)
      return this.getBlock(bottom.position, 0, 1, 0);
    return null;
  };
  const neighbors = m.getNeighbors;
  m.getNeighbors = function (node) {
    return neighbors.call(this, node).filter(n => {
      const floor = bot.blockAt(n.offset(0, -1, 0));
      if(!floor || HAZARD.test(floor?.name || '') || n.toBreak.length || n.toPlace.length || node.y-n.y>1)return false;
      if(build){
        const top=floor?.shapes?.length?Math.max(...floor.shapes.map(s=>s[4])):1,pos=n.offset(.5,top-1,.5);
        if(!build.bodyClear(pos,bot))return false;
        const policy=build.routePolicy;
        if(policy&&!(policy.detour?build.rows.transitAllowed(policy.p,pos):build.rows.routeAllowed(policy.p,pos,policy.origin,policy.seed)))return false;
      }
      return true;
    });
  };
  return m;
}
class AutoBuild extends EventEmitter {
  constructor(logger, adapter = null) {
    super(); this.autoPass=false;this.autoPassStatus=''; this.logger = logger; this.adapter = adapter; this.status = 'idle'; this.reason = '';
    this.cursor = 0n; this.placed = 0n; this.skipped = 0n; this.epoch = 0; this.worker = null; this.bot = null; this.phase = 'idle'; this.detail = ''; this.diagTimer = null;
  }
  get planting() { return this.block?.name === 'nether_wart'; }
  get reserved() { return !!this.bot && ['running', 'paused'].includes(this.status); }
  limits(bot = this.bot) {
    const minY = Number.isInteger(bot?.game?.minY) ? bot.game.minY : (bot?.supportFeature?.('dimensionIsAnInt') ? 0 : -64);
    return { minY, maxY: minY + (Number.isInteger(bot?.game?.height) ? bot.game.height : minY === 0 ? 256 : 384) - 1 };
  }
  inventory() { return this.bot?.inventory?.items().filter(i => i.name === this.block?.itemName).reduce((n, i) => n + i.count, 0) || 0; }
  requireHeldMaterial() {
    // Re-check authoritative inventory after every asynchronous gate. Losing
    // a stack is not a geometry failure and must not trigger another walk.
    if(this.inventory()<=0)throw fail('materials');
    const held=this.bot.heldItem;
    if(held?.name!==this.block.itemName||!(held.count>0))throw fail('inventory_changed');
  }
  state() {
    const target = this.target || null;
    return { autoPass:!!this.autoPass,autoPassWaiting:!!this.autoPassTask,autoPassStatus:this.autoPassStatus||'',solidPattern:!!this.solidPattern, manualRemaining:this.manualRemaining||0, manualTarget:this.manualTarget||null, status: this.status, reason: this.reason, phase: this.brakeDrain?'stop_brake':this.phase, detail: this.detail, build: BUILD, rescueOwn: this.rescueOwn, fastWalk: this.fastWalk, repairedOpen: this.safety?.repairs.size || 0, rescueBroken: this.safety?.broken || 0, total: String(this.area?.total || 0n), processed: String(this.cursor),
      placed: String(this.placed), skipped: String(this.skipped), currentTarget: target, layer: target?.y ?? this.layerY ?? this.area?.max.y ?? null,
      block: this.block?.name || '', inventory: this.inventory(), settling: !!this.brakeDrain || (!!this.worker && this.status !== 'running'),
      percent: this.area ? Number(this.cursor * 10000n / this.area.total) / 100 : 0, limits: this.limits() };
  }
  notify(force = false) {
    if (!force && Date.now() - (this.lastEmit || 0) < 250) return;
    this.lastEmit = Date.now(); this.emit('state', this.state());
  }
  diagnostic(event, extra = '') {
    const b = this.bot, pos = b?.entity?.position, target = this.target || null;
    const xyz = p => p ? [p.x, p.y, p.z].map(n => Number(n).toFixed(3)).join(',') : '-';
    const angle=b?headingError(b):null;
    const speedKey=[b?.physics?.movementSpeedAttribute,'generic.movement_speed','minecraft:generic.movement_speed','movement_speed'].find(k=>k&&b?.entity?.attributes?.[k]);
    const speedBase=speedKey?b.entity.attributes[speedKey].value:null,move=movementInfo(b);
    const speedEffective=move.known?move.value:null;
    const view = b?.__kbLastView,velocity=b?.entity?.velocity,floor=pos?b.blockAt(pos.offset(0,-.01,0)):null;
    this.logger?.info?.(`[Auto Build/${BUILD}] ${event} phase=${this.phase} target=${xyz(target)} pos=${xyz(pos)} mc=${b?.version||'-'} ground=${b?.entity?.onGround} sprint=${!!b?.controlState?.sprint} sneak=${!!b?.controlState?.sneak} forward=${!!b?.controlState?.forward} jump=${!!b?.controlState?.jump} sentForward=${b?.__kbLastInputs?.forward??'-'} turnErrorDeg=${angle===null?'-':(angle*180/Math.PI).toFixed(1)} vy=${Number(velocity?.y||0).toFixed(3)} vxz=${Math.hypot(velocity?.x||0,velocity?.z||0).toFixed(3)} floor=${floor?.name||'-'} speedBase=${speedBase??'-'} speedEffective=${speedEffective??'-'} speedKey=${speedKey||'-'} held=${b?.heldItem?.name || '-'} placed=${this.placed} view=${view ? view.yaw.toFixed(1)+','+view.pitch.toFixed(1) : '-'}${extra ? ' '+extra : ''}`);
    this.logger?.diagnostic?.('autobuild',{build:BUILD,mcVersion:b?.version,event,...(event==='confirmed'?this.lastPlacementTiming||{}:{}),phase:this.phase,reason:this.reason,block:this.block?.name,floor:floor?.name,speedBase,speedEffective,speedKey,placed:String(this.placed),targetX:target?.x,targetY:target?.y,targetZ:target?.z,x:pos?.x,y:pos?.y,z:pos?.z,ground:!!b?.entity?.onGround,sprint:!!b?.controlState?.sprint,sneak:!!b?.controlState?.sneak,forward:!!b?.controlState?.forward,jump:!!b?.controlState?.jump,sentForward:b?.__kbLastInputs?.forward,headingError:angle===null?undefined:angle*180/Math.PI,vxz:Math.hypot(velocity?.x||0,velocity?.z||0),vy:velocity?.y||0});
  }
  setPhase(phase, detail = '') {
    this.phase = phase; this.detail = detail; this.notify();
    if (Date.now() - (this.lastPhaseLog || 0) >= 2000) { this.lastPhaseLog = Date.now(); this.diagnostic('phase'); }
  }
  clearDiagnostics() { if (this.diagTimer) clearInterval(this.diagTimer); this.diagTimer = null; }
  preview(bot, spec) {
    try {
      const a = region(spec.corner1, spec.corner2, this.limits(bot));
      const b = catalog(bot.registry).find(b => b.name === spec.block);
      if (!b?.placeable) throw fail('block_not_placeable');
      return { ok: true, planting: b.name === 'nether_wart', total: String(a.total), min: a.min, max: a.max, limits: this.limits(bot),
        inventory: bot.inventory.items().filter(i => i.name === b.itemName).reduce((n, i) => n + i.count, 0) };
    } catch (e) { return { ok: false, error: e.code || e.message }; }
  }
  start(bot, spec) {
    if(this.brakeDrain)return {ok:false,error:'settling'};
    if (this.reserved || this.worker) return { ok: false, error: 'busy' };
    const p = this.preview(bot, spec); if (!p.ok) return p;
    if (bot.currentWindow) return { ok: false, error: 'window_open' };
    if(Date.now()<(this.movementHoldUntil||0))return {ok:false,error:'movement_cooldown'};
    if(Date.now()<(this.trafficHoldUntil||0))return {ok:false,error:'packet_cooldown'};
    try {
      this.nav = this.adapter || require('./build-pathfinder').compatiblePathfinder();
      this.Vec3 = this.adapter?.Vec3 || require('vec3').Vec3;
      if (!this.adapter) {
        snapshotPaths();
        this.interactables = new Set(require('mineflayer-pathfinder/lib/interactable.json'));
        if (!bot.pathfinder) bot.loadPlugin(this.nav.pathfinder);
        if (!bot.pathfinder.__kbNaturalStops) throw fail('pathfinder_compatibility');
        bot.pathfinder.tickTimeout = 2; bot.pathfinder.thinkTimeout = 4000; bot.pathfinder.searchRadius = 48;
        bot.pathfinder.setMovements(movements(bot, this.nav.Movements, this));
      }
      this.bot = bot; this.area = region(spec.corner1, spec.corner2, this.limits(bot));
      this.block = catalog(bot.registry).find(b => b.name === spec.block);
      this.cursor = this.placed = this.skipped = 0n; this.reason = '';
      this.solidPattern=this.block.solid===true&&!this.planting&&spec.solidPattern===true;this.patternReady=false;this.manualRemaining=0;this.manualTarget=null;
      this.autoPass=spec.autoPass===true;this.autoPassStatus='';this.lastPlaceAt=-Infinity;this.lastRowCell=null;
      this.lastPlacementTiming=null;
      this.fastWalk=!this.planting&&!this.solidPattern&&spec.fastWalk === true;this.savedSneak=!!bot.controlState?.sneak;
      this.rescueOwn = spec.rescueOwn !== false; this.safety = new BuildSafety(this);
      this.layerY = this.area.min.y; this.finishedVolume=0n;this.layerBasePlaced=0n;this.scan=0n;this.frontier=[];this.frontierKeys=new Set();this.passProgress=0;this.passMissing=null;this.target=null;
      this.entry=bot.entity.position.clone();
      const r=this.area,pos=this.entry;
      const exits=[{axis:'x',low:true,d:pos.x<r.min.x?-1:Math.abs(pos.x-r.min.x)},{axis:'x',low:false,d:pos.x>r.max.x+1?-1:Math.abs(pos.x-r.max.x-1)},{axis:'z',low:true,d:pos.z<r.min.z?-1:Math.abs(pos.z-r.min.z)},{axis:'z',low:false,d:pos.z>r.max.z+1?-1:Math.abs(pos.z-r.max.z-1)}];
      this.exitSide=exits.sort((a,b)=>a.d-b.d)[0];
      this.rows=new (this.planting?CropRows:BuildRows)(this.area,this.entry,this.exitSide);
      this.seedPlan=null;this.seedAttempted=false;this.routePolicy=null;this.routeTarget=null;
      if(this.solidPattern)require('./build-solid-pattern').restorePattern(this);else this.patternCheckpoint=null;
      this.worldRevision=0;
      this.ownChanged=(_old,b)=>{this.worldRevision++;this.safety?.changed(b);};bot.on('blockUpdate',this.ownChanged);
      this.restoreSurfacePhysics = surfacePhysics(bot);
      this.savedPhysics = bot.physicsEnabled; bot.physicsEnabled = true; bot.__autoBuildInteracting = true;
      this.worldChanged = () => this.stop('world_changed');
      this.windowOpened = () => this.pause('window_open');
      this.sentCount = 0;
      this.placementSent = p => { this.lastPlaceAt=Date.now();if (this.status !== 'running') return; if (++this.sentCount <= 3 || this.sentCount % 20 === 0) this.diagnostic('sent block_place', 'face='+p.direction); };
      bot.on('kb:build-place-sent', this.placementSent);
      bot.on('respawn', this.worldChanged); bot.on('end', this.worldChanged); bot.on('windowOpen', this.windowOpened);
      this.launch(); return { ok: true };
    } catch (e) { this.release(); return { ok: false, error: e.code || e.message }; }
  }
  launch() {
    this.status = 'running'; this.reason = ''; this.phase = 'prepare'; const token = ++this.epoch;
    this.clearDiagnostics(); this.diagnostic('start', 'block='+this.block.name+' inventory='+this.inventory());
    this.diagTimer = setInterval(() => { if (this.valid(token)) { this.notify(); this.diagnostic('watch'); } }, 5000);
    this.notify(true);
    this.worker = this.run(token).catch(e => {
      if (this.valid(token)) {
        this.logger?.warn?.('Auto Build: ' + (e.code || 'placement_failed') + ' · ' + e.message);
        this.diagnostic('failure', 'code='+(e.code || 'placement_failed'));
        this.pause(e.code || 'placement_failed');
      }
    }).finally(() => { this.worker = null; this.notify(true); });
  }
  error(code) { return fail(code); }
  makeMovements(bot=this.bot) { return movements(bot,this.nav.Movements,this); }
  valid(token) { return token === this.epoch && this.status === 'running' && !!this.bot; }
  check(token) { if (!this.valid(token)) throw fail('cancelled'); if (this.bot.currentWindow) throw fail('window_open'); }
  halt() { try { this.bot?.pathfinder?.setGoal(null); this.bot?.clearControlStates(); this.bot?.stopDigging?.(); } catch (_) {} }
  setAutoPass(enabled){return require('./build-auto-pass').set(this,enabled);}
  pause(reason = 'manual') {
    if (!this.reserved) return { ok: false, error: 'not_running' };
    require('./build-auto-pass').cancel(this,'cancelled');
    ++this.epoch; this.status = 'paused'; this.reason = reason; this.clearDiagnostics(); this.diagnostic('paused', 'reason='+reason); this.halt(); this.notify(true);require('./build-auto-pass').queue(this); return { ok: true };
  }
  resume() {
    if (this.status !== 'paused' || !this.bot) return { ok: false, error: 'not_paused' };
    if (Date.now() < (this.trafficHoldUntil || 0)) return { ok: false, error: 'packet_cooldown' };
    if (Date.now() < (this.movementHoldUntil || 0)) return { ok: false, error: 'movement_cooldown' };
    if (this.worker) return { ok: false, error: 'settling' };
    if (this.bot.currentWindow) return { ok: false, error: 'window_open' };
    require('./build-auto-pass').cancel(this);
    this.scan=0n;this.passProgress=0;this.passMissing=null;this.frontier=[];this.frontierKeys.clear();
    this.launch(); return { ok: true };
  }
  release({drain=false}={}) {
    require('./build-auto-pass').cancel(this,'cancelled');
    this.routePolicy=null;this.routeTarget=null;this.seedPlan=null;
    this.clearDiagnostics(); this.halt();this.safety?.detach();
    if (this.bot) {
      if (this.ownChanged) this.bot.removeListener('blockUpdate',this.ownChanged);
      if (this.placementSent) this.bot.removeListener('kb:build-place-sent', this.placementSent);
      if (this.worldChanged) { this.bot.removeListener('respawn', this.worldChanged); this.bot.removeListener('end', this.worldChanged); }
      if (this.windowOpened) this.bot.removeListener('windowOpen', this.windowOpened);
      const bot=this.bot,restoreSurface=this.restoreSurfacePhysics||(()=>{});
      if(drain&&this.solidPattern&&this.savedPhysics===false&&bot.physicsEnabled&&bot._client?.state==='play'&&!require('./build-stop-physics').resting(bot)){
        const state={bot};this.brakeDrain=state;this.restoreSurfacePhysics=null;
        state.promise=require('./build-stop-physics').drainNativeStop(bot,{restoreSurface,savedPhysics:this.savedPhysics,savedSneak:this.savedSneak,warn:m=>this.logger?.warn?.(m)}).then(()=>{if(this.brakeDrain===state)this.brakeDrain=null;this.notify(true);});
      }else{
        bot.__autoBuildInteracting = false;bot.physicsEnabled=this.savedPhysics;
        if(this.savedSneak)bot.setControlState('sneak',true);
      }
    }
    this.restoreSurfacePhysics?.(); this.restoreSurfacePhysics = null;
    this.bot = null;
  }
  stop(reason = 'manual') {
    if(reason==='manual')require('./build-solid-pattern').rememberPattern(this);
    else this.patternCheckpoint=null;
    ++this.epoch; this.status = 'stopped'; this.reason = reason; this.phase = 'stopped'; this.release({drain:reason==='manual'}); this.notify(true); return { ok: true };
  }
  vec(p) { return new this.Vec3(p.x, p.y, p.z); }
  air(p) { const b = this.bot.blockAt(this.vec(p)); return !!b && AIR.has(b.name); }
  clearance(p) {
    const b = this.bot.blockAt(this.vec(p));
    return !!b && (AIR.has(b.name) || (b.name === 'nether_wart' && b.boundingBox === 'empty'));
  }
  plantingSupport(p) {
    const below = this.bot.blockAt(this.vec(p).offset(0, -1, 0));
    if (!below) throw fail('chunk_unloaded');
    if (below.name !== 'soul_sand') throw fail('wart_soil');
    return below;
  }
  solid(p) { const b = this.bot.blockAt(this.vec(p)); return !!b && b.boundingBox === 'block' && !HAZARD.test(b.name); }
  collision(p, pos = this.bot.entity.position) {
    // Wart has NO player collision shape. Vanilla permits planting at your
    // feet; treating it as a 1m cube leaves the last crop cell unfillable.
    if (this.planting) return false;
    return pos.x + .31 > p.x && pos.x - .31 < p.x + 1 && pos.z + .31 > p.z && pos.z - .31 < p.z + 1 && pos.y + 1.8 > p.y && pos.y < p.y + 1;
  }
  bodyClear(pos,bot=this.bot) {
    // Exact standing body versus actual shapes: 7/8 soul-sand feet must not
    // make an overhead Y+2 block look like a harmless non-intersecting roof.
    for(let x=Math.floor(pos.x-.3);x<=Math.floor(pos.x+.3);x++)
      for(let y=Math.floor(pos.y+.001);y<=Math.floor(pos.y+1.8-.001);y++)
        for(let z=Math.floor(pos.z-.3);z<=Math.floor(pos.z+.3);z++){
          const b=bot.blockAt(new this.Vec3(x,y,z));if(!b)return false;
          if(HAZARD.test(b.name))return false;
          for(const s of b.shapes||[])if(pos.x+.3>x+s[0]+.001&&pos.x-.3<x+s[3]-.001&&pos.y+1.8>y+s[1]+.001&&pos.y<y+s[4]-.001&&pos.z+.3>z+s[2]+.001&&pos.z-.3<z+s[5]-.001)return false;
        }
    return true;
  }
  safeFooting(pos,bot=this.bot){
    // All corners of the real footprint need loaded, non-hazardous support
    // at the current foot height. Unknown chunks are never assumed to be air.
    for(const dx of [-.299,.299])for(const dz of [-.299,.299]){
      const q=pos.offset(dx,-.02,dz),b=bot.blockAt(q);
      if(!b||b.boundingBox!=='block'||HAZARD.test(b.name))return false;
      const x=q.x-b.position.x,z=q.z-b.position.z;
      if(!(b.shapes||[]).some(t=>x>=t[0]&&x<=t[3]&&z>=t[2]&&z<=t[5]&&Math.abs(b.position.y+t[4]-pos.y)<.03))return false;
    }
    return true;
  }
  standAllowed(p,pos,outsideOnly=false,rowMode=true){
    return (!outsideOnly||this.safety.outside(pos))&&(!this.rows||this.planting||rowMode||outsideOnly||pos.y<=p.y+.001)&&this.bodyClear(pos)&&(!rowMode||!this.rows||this.rows.allowed(p,pos,this.seedPlan));
  }
  references(p) {
    if (this.planting) {
      const ref = this.plantingSupport(p);
      // Click only UP on soul sand, never an adjacent block / side face.
      // Soul sand's collision face is at 7/8 height, not a full cube's y=1.
      const shapes = ref.shapes?.length ? ref.shapes : [[0, 0, 0, 1, .875, 1]];
      const delta = new this.Vec3(.5, Math.max(...shapes.map(s => s[4])), .5);
      if(this.rows){
        const info=this.rows.describe(p);
        if(info.band*3+info.len>=Number(this.rows.length))
          delta[this.rows.depth]-=this.rows.sign*.38;
      }
      return [{ ref, face: new this.Vec3(0, 1, 0), delta, aim: ref.position.plus(delta) }];
    }
    const out = [];
    for (const d of [[0,-1,0],[-1,0,0],[1,0,0],[0,0,-1],[0,0,1],[0,1,0]]) {
      const ref = this.bot.blockAt(this.vec(p).offset(...d));
      if (ref?.boundingBox === 'block' && !HAZARD.test(ref.name)) {
        const face = new this.Vec3(-d[0], -d[1], -d[2]), axis = d.findIndex(n => n !== 0), positive = d[axis] < 0;
        // Aim/cursor must lie on the real shape, including soul sand, slabs
        // and honey; a full-cube cursor can point above a partial support.
        const shapes = ref.shapes?.length ? ref.shapes : [[0,0,0,1,1,1]];
        const edge = positive ? Math.max(...shapes.map(q => q[axis+3])) : Math.min(...shapes.map(q => q[axis]));
        const shape = shapes.filter(q => q[positive ? axis+3 : axis] === edge).sort((a,b) => {
          const area = q => q.reduce((n,_,i) => i < 3 && i !== axis ? n * (q[i+3]-q[i]) : n, 1);
          return area(b)-area(a);
        })[0];
        const coords = [0,1,2].map(i => i === axis ? edge : (shape[i]+shape[i+3])/2);
        if(this.rows&&!this.seedPlan){
          // On a straight strip, use a real point on this face near the
          // player's cross-axis. Clicking every face's centre from a
          // fractional/off-centre stance added a turn before AND after each
          // lateral shift. Keep a margin from shape edges and still require
          // the normal raycast, cursor, reach and sent-angle checks.
          const k=this.rows.cross,i=k==='x'?0:2,margin=.06;
          if(i!==axis&&shape[i+3]-shape[i]>2*margin){
            coords[i]=Math.max(shape[i]+margin,Math.min(shape[i+3]-margin,this.bot.entity.position[k]-ref.position[k]));
          }
        }
        const delta = new this.Vec3(...coords);
        out.push({ref,face,delta,aim:ref.position.plus(delta)});
      }
    }
    if(this.solidPattern&&this.rows){
      const axis=this.rows.depth,behind=p[axis]-this.rows.sign;
      out.sort((a,b)=>Number(b.ref.position[axis]===behind&&b.ref.position[this.rows.cross]===p[this.rows.cross])-Number(a.ref.position[axis]===behind&&a.ref.position[this.rows.cross]===p[this.rows.cross]));
    }
    return out;
  }
  sight(eye, ref) {
    const delta=ref.aim.minus(eye),len=delta.norm();if(len>4.25||len<.001)return false;
    if(ref.face&&(eye.x-ref.aim.x)*ref.face.x+(eye.y-ref.aim.y)*ref.face.y+(eye.z-ref.aim.z)*ref.face.z<=.001)return false;
    if(this.bot.world?.raycast) {
      const hit=this.bot.world.raycast(eye,delta.scaled(1/len),len+.02);
      return !!hit&&hit.position.equals(ref.ref.position)&&hit.intersect.minus(ref.aim).norm()<.03;
    }
    // Exact slab intersections for adapters/tests without a world raycaster.
    // Thin blockers and the near side of the reference must not be skipped.
    const axes=['x','y','z'];
    const intersects=(p,shape)=>{
      let lo=0,hi=1;
      for(let i=0;i<3;i++) {
        const k=axes[i],min=p[k]+shape[i]+1e-7,max=p[k]+shape[i+3]-1e-7,d=delta[k];
        if(Math.abs(d)<1e-10){if(eye[k]<=min||eye[k]>=max)return false;continue;}
        const t1=(min-eye[k])/d,t2=(max-eye[k])/d;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(hi<lo)return false;
      }
      return lo<.99999&&hi>.00001;
    };
    for(let x=Math.floor(Math.min(eye.x,ref.aim.x));x<=Math.floor(Math.max(eye.x,ref.aim.x));x++)
      for(let y=Math.floor(Math.min(eye.y,ref.aim.y));y<=Math.floor(Math.max(eye.y,ref.aim.y));y++)
        for(let z=Math.floor(Math.min(eye.z,ref.aim.z));z<=Math.floor(Math.max(eye.z,ref.aim.z));z++) {
          const p={x,y,z},b=this.bot.blockAt(this.vec(p));
          if(!b){if(intersects(p,[0,0,0,1,1,1]))return false;continue;}
          if((b.shapes||[]).some(shape=>intersects(p,shape)))return false;
        }
    return true;
  }
  usable(p, refs, pos = this.bot.entity.position, eyeHeight = 1.62) {
    if (this.collision(p, pos)) return null;
    return refs.find(r => this.sight(pos.offset(0, eyeHeight, 0), r)) || null;
  }
  async navigate(goal, token, ready = null) {
    if (this.adapter) { await this.adapter.navigate(this.bot, goal, () => this.check(token)); this.check(token); return; }
    const bot = this.bot,move=movementInfo(bot);if(move.known&&move.value<=0)throw fail('movement_disabled');
    this.routePolicy=this.routeTarget&&this.rows?{p:this.routeTarget,origin:bot.entity.position.clone(),seed:this.seedPlan,detour:!!this.routeDetour}:null;
    const releaseTravel=travelPolicy(this,goal,token); const start = Date.now(); let lastProgress = start, last = bot.entity.position.clone();
    const progress=new GoalProgress(goal,bot.entity.position);
    await new Promise((resolve, reject) => {
      let timer, done = false;
      const finish = e => { if (done) return; done = true; clearInterval(timer); bot.removeListener('goal_reached', reached); bot.removeListener('path_update', updated); bot.removeListener('physicsTick', tick); e ? reject(e) : resolve(); };
      const atGoal = () => {
        if (ready) return ready();
        const pos = bot.entity.position, node = pos.floored();
        return goal.isEnd(node) || (pos.y - node.y > .001 && bot.entity.onGround && bot.blockAt(node)?.boundingBox === 'block' && goal.isEnd(node.offset(0, 1, 0)));
      };
      const reached = g => { if (g === goal&&(!ready||ready())) finish(); };
      const tick = () => { if(!this.valid(token))return;const move=movementInfo(bot);if(move.known&&move.value<=0)return finish(fail('movement_disabled'));if(ready?.())finish(); };
      const updated = r => { if (r.status === 'noPath' || r.status === 'timeout') finish(fail('no_path')); };
      bot.on('goal_reached', reached); bot.on('path_update', updated); bot.on('physicsTick', tick);
      timer = setInterval(() => {
        if (!this.valid(token)) return finish(fail('cancelled'));
        if (atGoal()) return finish();
        if(progress.stalled(bot.entity.position)){
          this.movementHoldUntil=Date.now()+3000;this.pause('walk_stalled');return finish(fail('cancelled'));
        }
        if (bot.entity.position.distanceTo(last) >= .08) { last = bot.entity.position.clone(); lastProgress = Date.now(); }
        if (Date.now() - lastProgress > 30000 || Date.now() - start > 120000) finish(fail('no_progress'));
      }, 250);
      bot.pathfinder.setGoal(goal);
      if (atGoal()) finish();
    }).finally(() => { this.routePolicy=null;releaseTravel();try { bot.pathfinder.setGoal(null); } catch (_) {} });
    this.check(token);
  }
  async approach(p, token, excluded = new Set(), outsideOnly = false,rowMode=true) {
    if(this.solidPattern&&rowMode)return this.patternWalk(p,token);
    this.routeTarget=rowMode?p:null;this.routeDetour=false;
    try{
      try{return await this.approachRoute(p,token,excluded,outsideOnly,rowMode);}
      catch(e){
        this.check(token);
        // A strip boundary is an ordering preference, not a solid wall.
        // Retry once through real loaded gaps, retaining the same placement
        // stance and no-roof/no-dig/no-scaffold collision rules.
        if(e.code!=='no_path'||!rowMode||this.planting||!this.rows?.transitAllowed)throw e;
        this.halt();this.routeDetour=true;
        this.diagnostic('loaded gap detour');
        return await this.approachRoute(p,token,excluded,outsideOnly,rowMode);
      }
    }finally{this.routeTarget=null;this.routePolicy=null;this.routeDetour=false;}
  }
  async approachRoute(p, token, excluded, outsideOnly,rowMode) {
    this.setPhase('walk');
    const bot = this.bot, G = this.nav.goals;
    // Long journeys use bounded local waypoints; no millions-of-node search.
    for (;;) {
      this.check(token); const pos = bot.entity.position, dist = Math.hypot(pos.x - p.x, pos.z - p.z);
      if (dist < 12) break;
      const destination=rowMode&&this.rows?this.rows.stance(p,this.seedPlan):p;
      const d=Math.hypot(destination.x-pos.x,destination.z-pos.z),step=Math.min(16,Math.max(0,d-2));
      const x=Math.floor(pos.x+(destination.x-pos.x)/Math.max(.001,d)*step),z=Math.floor(pos.z+(destination.z-pos.z)/Math.max(.001,d)*step);
      // First retreat to the open side of this band, rather than cutting
      // diagonally through an already filled strip on a long approach.
      await this.navigate(new G.GoalNearXZ(x,z,1), token);
      await sleep(0);
    }
    const refs = this.references(p); if (!refs.length) throw fail('no_support');
    if(rowMode&&!outsideOnly&&!this.seedPlan&&this.rows&&this.lastRowCell){
      const r=this.rows,strafe=require('./build-strafe');
      if(strafe.adjacentRow(this,p)){
        if(!this.adapter){
          // Both solid-face clicks and crops leave small off-centre yaw
          // errors. Align to this strip, rather than doing a 90-degree
          // forward walk and another turn back for every adjacent column.
          // Large turns still use the normal router; never change native yaw
          // directly or turn the camera while lateral inputs are pressed.
          const b=this.bot,angles=r.depth==='x'?[-Math.PI/2,Math.PI/2]:[0,Math.PI];
          const diff=y=>Math.abs(Math.atan2(Math.sin(y-b.entity.yaw),Math.cos(y-b.entity.yaw)));
          angles.sort((a,c)=>diff(a)-diff(c));
          if(diff(angles[0])<.6){
            this.halt();const yaw=angles[0],origin=b.entity.position;
            await this.aim(origin.offset(-Math.sin(yaw)*2,1.62+Math.tan(b.entity.pitch)*2,-Math.cos(yaw)*2),token);
          }
        }
        const moved=await strafe.rowStrafe(this,p,token,refs);this.check(token);
        if(moved)return;this.setPhase('walk');
      }
    }
    if ((this.planting || bot.entity.onGround !== false) && !excluded.has(key(bot.entity.position.floored())) && this.standAllowed(p,bot.entity.position,outsideOnly,rowMode) && this.usable(p, refs)) return;
    const candidates = []; let sliceStart = Date.now();
    const points = [];
    for (let dy = -4; dy <= 2; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) points.push({x:p.x+dx,y:p.y+dy,z:p.z+dz});
    for (const q of points) {
      if (Date.now() - sliceStart >= 2) { await sleep(0); this.check(token); sliceStart = Date.now(); }
      const support = bot.blockAt(this.vec(q).offset(0, -1, 0));
      const top = support?.shapes?.length ? Math.max(...support.shapes.map(s => s[4])) : 1;
      const pos = this.vec(q).offset(.5, top - 1, .5);
      if(!this.standAllowed(p,pos,outsideOnly,rowMode))continue;
      if (this.collision(p, pos) || excluded.has(key(pos.floored())) || (outsideOnly && !this.safety.outside(pos))) continue;
      if (!this.clearance(q) || !this.clearance({ ...q, y: q.y + 1 }) || !this.solid({ ...q, y: q.y - 1 })) continue;
      if (this.usable(p, refs, pos)) candidates.push(new G.GoalBlock(q.x, q.y, q.z));
    }
    if (!candidates.length) throw fail('unsafe_stance');
    candidates.sort((a,b)=>Math.abs(a.y-bot.entity.position.y)-Math.abs(b.y-bot.entity.position.y));
    await this.navigate(new G.GoalCompositeAny(candidates), token, () => (this.planting || bot.entity.onGround !== false) && !excluded.has(key(bot.entity.position.floored())) && this.standAllowed(p,bot.entity.position,outsideOnly,rowMode) && !!this.usable(p, this.references(p)));
    if (!this.usable(p, this.references(p))) throw fail('out_of_reach');
  }
  patternStands(p,q){
    const stands=[];
    for(let y=p.y;y>=p.y-4;y--){
      const floor=this.bot.blockAt(new this.Vec3(Math.floor(q.x),y-1,Math.floor(q.z)));
      const top=floor?.shapes?.length?Math.max(...floor.shapes.map(s=>s[4])):0;
      const pos=new this.Vec3(q.x,y-1+top,q.z);
      if(pos.y>p.y+.001||!this.bodyClear(pos)||!this.safeFooting(pos)||this.collision(p,pos))continue;
      stands.push({pos,y});
    }
    return stands;
  }
  async patternWalk(p,token,q=this.rows.stance(p)){
    this.check(token);this.setPhase('walk');
    const bot=this.bot,refs=this.references(p);
    // Handoff stands in the deliberately unfilled final cell, not beside it.
    const finalCell=this.solidPattern&&p.y===this.area.max.y&&this.rows.index(p)===this.area.layer-1n;
    const isHandoff=finalCell&&this.air(p);
    const settled=()=>bot.entity.onGround!==false&&Math.abs(bot.entity.position.x-q.x)<=.12&&Math.abs(bot.entity.position.z-q.z)<=.12&&this.bodyClear(bot.entity.position)&&this.safeFooting(bot.entity.position)&&(isHandoff||!this.collision(p))&&(isHandoff||!!this.usable(p,refs));
    if(settled())return;
    this.routeTarget=p;this.routeDetour=false;
    try{
      let stands=this.patternStands(p,q);
      if(isHandoff){
        // Future block collision is intentionally NOT required for the one
        // cell which the user expressly requested to leave unplaced.
        stands=[];for(let y=p.y;y>=p.y-4;y--){const floor=bot.blockAt(new this.Vec3(Math.floor(q.x),y-1,Math.floor(q.z))),top=floor?.shapes?.length?Math.max(...floor.shapes.map(s=>s[4])):0,pos=new this.Vec3(q.x,y-1+top,q.z);if(pos.y<=p.y+.001&&this.bodyClear(pos)&&this.safeFooting(pos))stands.push({pos,y});}
      }
      if(!stands.length)throw fail('unsafe_stance');
      stands.sort((x,y)=>Math.abs(x.pos.y-bot.entity.position.y)-Math.abs(y.pos.y-bot.entity.position.y));
      const fine=()=>require('./build-precise-stance').preciseStance(this,p,q,token,isHandoff);
      // Normal adjacent columns use one bounded native controller through
      // standstill, rather than a pathfinder grid-goal + fine-walk handoff.
      if(await require('./build-precise-stance').columnStep(this,p,q,token)){
        if(!settled())throw fail('unsafe_stance');return;
      }
      if(Math.floor(bot.entity.position.x)===Math.floor(q.x)&&Math.floor(bot.entity.position.z)===Math.floor(q.z)&&Math.hypot(bot.entity.position.x-q.x,bot.entity.position.z-q.z)<.9){
        await this.settle(token);if(!settled())await fine();if(!settled())throw fail('unsafe_stance');return;
      }
      const goals=stands.map(s=>new this.nav.goals.GoalBlock(Math.floor(q.x),s.y,Math.floor(q.z)));
      const {PlayerState}=require('prismarine-physics');
      const brakingReady=()=>{
        if(settled()&&Math.hypot(bot.entity.velocity?.x||0,bot.entity.velocity?.z||0)<.003)return true;
        // Grid-goal completion may stop just outside the precise window.
        // End routing at a safe resting pose, then use native fine walking.
        if(Math.hypot(bot.entity.position.x-q.x,bot.entity.position.z-q.z)<.4&&Math.hypot(bot.entity.velocity?.x||0,bot.entity.velocity?.z||0)<.003&&this.bodyClear(bot.entity.position)&&this.safeFooting(bot.entity.position))return true;
        if(bot.jumpQueued||bot.entity.onGround===false||Math.hypot(bot.entity.position.x-q.x,bot.entity.position.z-q.z)>.9)return false;
        const state=new PlayerState(bot,{forward:false,back:false,left:false,right:false,jump:false,sprint:false,sneak:false});
        for(let i=0;i<12;i++){
          bot.physics.simulatePlayer(state,{getBlock:v=>bot.blockAt(v,false)});
          if(!this.bodyClear(state.pos)||!this.safeFooting(state.pos)||!this.rows.transitAllowed(p,state.pos)||(!isHandoff&&this.collision(p,state.pos)))return false;
        }
        return Math.abs(state.pos.x-q.x)<=.10&&Math.abs(state.pos.z-q.z)<=.10;
      };
      await this.navigate(new this.nav.goals.GoalCompositeAny(goals),token,brakingReady);this.check(token);
      await this.settle(token);this.check(token);
      if(!settled())await fine();
      if(!settled())throw fail('unsafe_stance');
    }finally{this.routeTarget=null;this.routePolicy=null;}
  }
  async patternEscape(token,additions){
    // The requested workflow deliberately ends in an unfilled manual cell,
    // not outside the cuboid. Prove the current post-placement stance with
    // real body, all four loaded feet and natural braking, then independently
    // prove reachability of the next fixed stance in continuation(). No long
    // full-garden exit search and no automatic rescue/resealing in this mode.
    const p=this.target,q=this.rows.stance(p);
    return this.safety.plan(token,additions,[],{
      isEnd:pos=>this.rows.allowed(p,pos),
      heuristic:pos=>Math.abs(pos.x-q.x)+Math.abs(pos.z-q.z)+Math.max(0,pos.y-p.y),
      route:pos=>this.rows.transitAllowed(p,pos)
    });
  }
  async boundedEquip(item, token) {
    this.check(token);
    if(this.bot.heldItem===item&&item?.count>0)return;
    let timer;
    const operation = Promise.resolve(this.bot.equip(item, 'hand'));
    const watchdog = new Promise((_, reject) => { timer = setTimeout(() => reject(fail('equip_timeout')), 6000); });
    try { await Promise.race([operation, watchdog]); this.check(token); }
    catch (e) { if (e.code === 'equip_timeout') { this.pause('equip_timeout'); await operation.catch(() => {}); } throw e; }
    finally { clearTimeout(timer); }
  }
  async placementSpacing(token){
    for(;;){
      this.check(token);const left=PLACE_INTERVAL-(Date.now()-this.lastPlaceAt);
      if(left<=0)return;
      await sleep(Math.min(left,50));
    }
  }
  async settle(token) {
    this.setPhase('settle'); this.halt();
    // Stop input, then let native friction settle remaining motion. Do NOT
    // zero velocity or teleport the player to a synthetic stance.
    const end = Date.now() + 1500;
    const info=this.planting&&this.rows&&this.target?this.rows.describe(this.target):null;
    const nearVertical=info&&info.band*3+info.len>=Number(this.rows.length);
    const maxDrift=nearVertical||this.solidPattern ? .003 : .025;
    do {
      this.check(token);
      const v = this.bot.entity.velocity;
      if ((!v || Math.hypot(v.x, v.z) < maxDrift && Math.abs(v.y || 0) < .08) && this.bot.entity.onGround !== false) return;
      await sleep(50);
    } while (Date.now() < end);
    throw fail('moving_at_target');
  }
  async aim(point, token, eyeHeight = 1.62) {
    this.setPhase('aim');
    const bot = this.bot, native = typeof bot.waitForTicks === 'function';
    let timer, lookDone = false, lastView = bot.__kbLastView, original, tapped;
    const angleDifference = (a, b) => Math.abs((((a-b)%360+540)%360)-180);
    const aligned = () => !native || (lastView && angleDifference(lastView.yaw, (Math.PI-bot.entity.yaw)*180/Math.PI) < .5 && Math.abs(lastView.pitch + bot.entity.pitch*180/Math.PI) < .5);
    const viewSent = p => { lastView = {yaw:p.yaw,pitch:p.pitch}; };
    // Production BotManager emits this AFTER its write limiter. Standalone
    // Mineflayer users get a temporary observer; adapters retain their mock.
    if (native && bot.__kbMotionTracing) bot.on('kb:view-sent', viewSent);
    else if (native) {
      original = bot._client.write;
      tapped = function (name, p) { const r = original.apply(this, arguments); if ((name==='look'||name==='position_look') && Number.isFinite(p?.yaw) && Number.isFinite(p?.pitch)) viewSent(p); return r; };
      bot._client.write = tapped;
    }
    const wait = new Promise((resolve, reject) => {
      const start = Date.now();
      timer = setInterval(() => {
        if (!this.valid(token)) reject(fail('cancelled'));
        else if (lookDone && aligned()) resolve();
        else if (Date.now()-start > 5000) reject(fail('look_not_sent'));
      }, 25);
    });
    try {
      // Native lookAt's Promise checks yaw only. It may resolve while pitch
      // is still interpolating; never place until BOTH angles were sent.
      const delta = point.minus(bot.entity.position.offset(0, eyeHeight, 0));
      const operation = typeof bot.look === 'function'
        ? bot.look(Math.atan2(-delta.x, -delta.z), Math.atan2(delta.y, Math.hypot(delta.x, delta.z)), false)
        : bot.lookAt(point, false);
      const look = Promise.resolve(operation).then(() => { lookDone = true; });
      await Promise.race([look.then(() => aligned() ? undefined : wait), wait]); this.check(token);
    } finally {
      clearInterval(timer); bot.removeListener('kb:view-sent', viewSent);
      if (tapped && bot._client.write === tapped) bot._client.write = original;
    }
  }
  visibleDigFace(b) {
    const eye=this.bot.entity.position.offset(0,1.62,0),out=[];
    for(const shape of b.shapes||[])for(const face of [[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]) {
      const axis=face.findIndex(n=>n),d=[0,1,2].map(i=>i===axis?shape[i+(face[i]>0?3:0)]:(shape[i]+shape[i+3])/2),delta=new this.Vec3(...d);
      out.push({ref:b,face:new this.Vec3(...face),delta,aim:b.position.plus(delta)});
    }
    return out.find(r=>this.sight(eye,r));
  }
  updateProgress() {
    if(!this.area)return;
    const live=this.placed-this.layerBasePlaced;
    this.cursor=this.finishedVolume+live;if(this.cursor<0n)this.cursor=0n;
    if(this.cursor>this.area.total)this.cursor=this.area.total;
    this.notify();
  }
  enqueue(p) {
    const r=this.area;if(p.y!==this.layerY||p.x<r.min.x||p.x>r.max.x||p.z<r.min.z||p.z>r.max.z)return;
    const k=key(p);if(this.frontierKeys.has(k)||this.frontier.length>=128)return;
    this.frontierKeys.add(k);this.frontier.push(p);
  }
  neighbors(p) { for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])this.enqueue({...p,x:p.x+dx,z:p.z+dz}); }
  nextCell() {
    if(this.rows)return this.rows.cell(this.scan++,this.layerY);
    if(this.frontier.length) {
      const score=p=>Math.hypot(p.x-this.entry.x,p.z-this.entry.z);
      // Preserve the distal fill preference, but visit nearby candidates in a
      // two-block distal band instead of repeatedly crossing the whole layer.
      const far=Math.max(...this.frontier.map(score)),pos=this.bot.entity.position;
      let best=-1,distance=Infinity;
      for(let i=0;i<this.frontier.length;i++){
        const q=this.frontier[i];if(score(q)<far-2)continue;
        const d=Math.hypot(q.x+.5-pos.x,q.z+.5-pos.z);
        if(d<distance){best=i;distance=d;}
      }
      const p=this.frontier.splice(best,1)[0];this.frontierKeys.delete(key(p));return p;
    }
    if(this.scan>=this.area.layer)return null;
    const p=cell(this.area,BigInt(this.layerY-this.area.min.y)*this.area.layer+this.scan++);
    if(!this.planting) {
      const r=this.area;if(this.exitSide.axis==='x'&&this.exitSide.low)p.x=r.min.x+r.max.x-p.x;
      if(this.exitSide.axis==='z'&&this.exitSide.low)p.z=r.min.z+r.max.z-p.z;
    }
    return p;
  }
  async placeOne(p,token,options={}) {
    options={...options,outsideOnly:!!options.outsideOnly||!!this.safety.repairs.size};
    const bot=this.bot,excluded=new Set();let last,recovered=false,rowMode=!options.repair;
    const began=Date.now(),times={};
    const measured=async(name,work)=>{const start=Date.now();try{return await work();}finally{times[name]=(times[name]||0)+Date.now()-start;}};
    for(let attempt=0;attempt<3;attempt++) {
      this.check(token);this.target=p;
      try {
        if(!this.air(p))return false;
        if(this.planting)this.plantingSupport(p);
        if(!this.inventory())throw fail('materials');
        await measured('move',async()=>{
          try {await this.approach(p,token,excluded,!!options.outsideOnly,rowMode);}
          catch(e){
            this.check(token);
            // An unchanged, server-confirmed own floor is a valid reference.
            // Retry this SAME target from physical loaded stances, not another
            // cell or a premature exit. Final escape/continuation still apply.
            const below={...p,y:p.y-1};
            if(this.solidPattern||!rowMode||this.planting||options.outsideOnly||this.safety.repairs.size||!['no_path','unsafe_stance','out_of_reach'].includes(e.code)||!this.safety.own(below))throw e;
            rowMode=false;this.halt();this.diagnostic('own-floor stance');
            await this.approach(p,token,excluded,false,false);
          }
        });this.check(token);await measured('settle',()=>this.settle(token));
        if(!this.air(p))return false;
        if(!this.standAllowed(p,bot.entity.position,!!options.outsideOnly,rowMode))throw fail('unsafe_stance');
        let ref=this.usable(p,this.references(p));if(!ref)throw fail('out_of_reach');
        if(/^(sand|red_sand|gravel|.*concrete_powder)$/.test(this.block.name)&&!this.solid({...p,y:p.y-1}))throw fail('falling_block');
        // The authoritative predictive check is below, AFTER equip, pacing
        // and aiming. A duplicate pre-equip A* added variable CPU delays but
        // could not authorize a placement anyway.
        // Keep a usable block already in hand. Choosing the first main-inventory
        // stack on every placement caused needless native window-click swaps.
        // Refill only before a placement is sent. Every refresh reruns the
        // full look/world/escape proof; never retry a server refusal.
        for(let refresh=0;;refresh++){
          try {
            ref=this.usable(p,this.references(p));if(!ref)throw fail('out_of_reach');
            const held=bot.heldItem;
            const item=held?.name===this.block.itemName&&held.count>0?held:bot.inventory.items().find(i=>i.name===this.block.itemName&&i.count>0);if(!item)throw fail('materials');
            this.setPhase('equip');await measured('equip',()=>this.boundedEquip(item,token));this.check(token);
            this.requireHeldMaterial();
            // Wait before the final look/world/escape checks. Do not reuse a
            // pre-wait safety decision or weaken acknowledgement requirements.
            await measured('gate',()=>this.placementSpacing(token));
            this.requireHeldMaterial();
            const crouch=!this.planting&&!!this.interactables?.has(ref.ref.name),eyeHeight=crouch?1.27:1.62;
            bot.setControlState('sneak',crouch);await measured('aim',()=>this.aim(ref.aim,token,eyeHeight));this.check(token);
            if(this.planting)this.plantingSupport(p);
            if(!this.air(p))return false;
            this.requireHeldMaterial();
            if(!this.standAllowed(p,bot.entity.position,!!options.outsideOnly,rowMode)||!this.usable(p,[ref],bot.entity.position,eyeHeight))throw fail('world_changed_at_target');
            // Final escape recheck after asynchronous movement/equip/look.
            this.setPhase(this.solidPattern?'pattern_check':'escape_check');
            const revision=this.worldRevision;
            const escape=!this.planting?await measured('check',()=>this.solidPattern?this.patternEscape(token,[p]):this.safety.plan(token,[p])):null;
            if(!this.planting&&!escape)throw fail('trap_risk');
            const continuation=this.rows&&!this.planting&&!options.repair?await measured('check',()=>this.safety.continuation(token,p,escape)):null;
            if(this.rows&&!this.planting&&!options.repair&&!continuation)throw fail('row_route_blocked');
            this.check(token);
            // A sliced planner may yield while another player/server changes the
            // world. Do not commit a stale escape/continuation proof.
            if(!this.planting&&(this.solidPattern?(!escape?.validate?.()||(continuation?.validate&&!continuation.validate())):revision!==this.worldRevision))throw fail('world_changed_at_target');
            if(!this.air(p))return false;
            this.requireHeldMaterial();
            if(!this.standAllowed(p,bot.entity.position,!!options.outsideOnly,rowMode)||!this.usable(p,[ref],bot.entity.position,eyeHeight))throw fail('world_changed_at_target');
            if(options.outsideOnly&&!this.safety.outside(bot.entity.position))throw fail('exit_not_reached');
            break;
          } catch(e) {
            if(e.code!=='inventory_changed'||refresh>=2)throw e;
            this.check(token);this.halt();this.setPhase('restock');
            await sleep(150);this.check(token);
            // The next iteration selects a real remaining stack and uses
            // native equip. No fake slot updates or automatic job Resume.
          }
        }
        try {
          this.setPhase(options.repair?'rescue_close':'place');
          this.lastPlaceAt=Date.now(); // Conservative fallback for standalone clients.
          await measured('ack',async()=>{
            try{return await bot._placeBlockWithOptions(ref.ref,ref.face,{forceLook:'ignore',swingArm:'right',...(ref.delta?{delta:ref.delta}:{})});}
            catch(e){if(!e.code)e.code=/^Server refused to place /.test(e.message||'')?'server_refused':'placement_failed';throw e;}
          });
          this.check(token);
          if(bot.blockAt(this.vec(p))?.name!==this.block.name)throw fail('server_refused');
          this.safety.remember(p);if(this.rows&&!options.repair&&!this.seedPlan)this.lastRowCell={...p};this.placed++;this.passProgress++;this.updateProgress();this.setPhase('confirmed');
          this.lastPlacementTiming={cycleMs:Date.now()-began,...Object.fromEntries(Object.entries(times).map(([k,v])=>[k+'Ms',v]))};
          if(this.placed<=3n||this.placed%20n===0n)this.diagnostic('confirmed',Object.entries(this.lastPlacementTiming).map(([k,v])=>k+'='+v).join(' '));
          if(!options.repair&&!this.planting&&!this.rows)this.neighbors(p);
          return true; // Native ACK and the next send gate, not a fixed post-ACK sleep.
        } finally {if(this.bot===bot)bot.setControlState('sneak',false);}
      } catch(e) {
        this.check(token);last=e;
        if(this.solidPattern&&!options.repair)throw e; // No seed/reposition/escape target changes in the fixed pattern.
        const fatal=['materials','inventory_changed','server_refused','placement_failed','window_open','equip_timeout','escape_unverified','rescue_unavailable','rescue_changed','rescue_denied','rescue_not_visible','exit_not_reached'];
        if(fatal.includes(e.code))throw e;
        const geometry=['no_path','no_progress','out_of_reach','unsafe_stance','moving_at_target','look_not_sent','world_changed_at_target','trap_risk','row_route_blocked','angle_retry'];
        // Missing support/soil must wait for another seed, not three pointless walks.
        if(!geometry.includes(e.code)&&e.code!=='server_refused'&&e.code!==undefined)throw e;
        if(bot.blockAt(this.vec(p))?.name===this.block.name)return false; // Never claim another player's fill / an unconfirmed late change.
        if(!recovered&&!this.planting&&!options.repair&&['no_path','no_progress','unsafe_stance','trap_risk','row_route_blocked'].includes(e.code)){
          // First use an existing exit even if no blocks have been placed by
          // us yet. Never dig pre-existing/other players' blocks to make one.
          recovered=true;const exit=await this.safety.plan(token);
          if(exit){await this.safety.exit(exit,token);options.outsideOnly=true;}
          else if(this.safety.owned.size){await this.safety.recover(token);options.outsideOnly=true;}
        }
        excluded.add(key(bot.entity.position.floored()));this.halt();this.setPhase('reposition');this.diagnostic('auto retry','try='+(attempt+1)+' code='+(e.code||'placement_failed'));await sleep(100);
      }
    }
    if(!last?.code)last=fail('placement_failed');throw last;
  }
  async run(token) {
    await sleep(150);this.check(token);
    if(this.solidPattern)return require('./build-solid-pattern').runSolidPattern(this,token);
    const deferred=new Set(['no_support','wart_soil','falling_block','chunk_unloaded','unsafe_stance','out_of_reach','no_path','no_progress','trap_risk','row_route_blocked','angle_retry','world_changed_at_target','moving_at_target','look_not_sent']);
    if(this.safety.repairs.size&&!this.safety.outside(this.bot.entity.position))await this.safety.recover(token);
    while(this.layerY<=this.area.max.y) {
      let slice=Date.now(),missing=0n;
      for(;;) {
        this.check(token);const p=this.nextCell();if(!p)break;this.target=p;
        if(this.safety.repairs.has(key(p)))continue;
        if(Date.now()-slice>=2){this.setPhase('scan');await sleep(0);this.check(token);slice=Date.now();}
        const b=this.bot.blockAt(this.vec(p));
        if(b&&!AIR.has(b.name)){continue;}
        try {
          // Find support first, before a long walk towards an unsupported cell.
          if(b&& !this.references(p).length){
            if(this.rows&&!this.planting&&!this.seedAttempted&&this.placed===this.layerBasePlaced){
              await this.seedLayer(token);this.scan=0n;continue;
            }
            throw fail('no_support');
          }
          if(!b) {await this.approach(p,token);this.check(token);}
          await this.placeOne(p,token);
        }catch(e){this.check(token);if((this.rows&&!this.planting)||!deferred.has(e.code))throw e;missing++;this.passMissing=this.passMissing||e.code;this.setPhase('defer',e.code);}
      }
      this.check(token);
      // A no-progress verification pass reads world occupancy again; previously
      // deferred cells are never silently marked done and upper Y stays locked.
      if(this.passProgress) {this.scan=0n;this.passProgress=0;this.passMissing=null;continue;}
      if(missing)throw fail(this.safety.repairs.size?'repair_pending':this.passMissing||'unreachable_cells');
      if([...this.safety.repairs.values()].some(r=>r.p.y<=this.layerY)){
        await this.safety.close(token,this.layerY);this.scan=0n;this.passProgress=0;continue;
      }
      // Exit before declaring completion, and repair every opened passage.
      if(this.layerY===this.area.max.y&&!this.planting&&this.safety.inside(this.bot.entity.position)) {
        await this.safety.recover(token);this.scan=0n;this.passProgress=0;continue;
      }
      const net=this.placed-this.layerBasePlaced;this.skipped+=this.area.layer-net;
      this.finishedVolume+=this.area.layer;this.cursor=this.finishedVolume;this.layerY++;this.layerBasePlaced=this.placed;
      this.scan=0n;this.passProgress=0;this.passMissing=null;this.frontier=[];this.frontierKeys.clear();this.notify(true);
      this.seedAttempted=false;this.rows&&(this.rows.anchor=null);
    }
    this.check(token);if(this.safety.repairs.size)throw fail('repair_pending');
    this.status='complete';this.reason='';this.phase='complete';this.target=null;this.layerY=this.area.max.y;this.diagnostic('complete');this.release();this.notify(true);
  }
  async seedLayer(token) {
    this.seedAttempted=true;const r=this.area,pos=this.bot.entity.position,rows=this.rows,candidates=[];
    let slice=Date.now();
    for(let x=Math.max(r.min.x,Math.floor(pos.x)-8);x<=Math.min(r.max.x,Math.floor(pos.x)+8);x++)
      for(let z=Math.max(r.min.z,Math.floor(pos.z)-8);z<=Math.min(r.max.z,Math.floor(pos.z)+8);z++){
        if(Date.now()-slice>=2){await sleep(0);this.check(token);slice=Date.now();}
        const p={x,y:this.layerY,z};if(this.air(p)&&this.references(p).length)candidates.push(p);
      }
    candidates.sort((a,b)=>Math.hypot(a.x-pos.x,a.z-pos.z)-Math.hypot(b.x-pos.x,b.z-pos.z));
    const first=candidates[0];if(!first)throw fail('no_support');
    const c=first[rows.cross],side=c<r.max[rows.cross]?1:-1;
    this.seedPlan={column:c,side};rows.anchor=c;rows.crossSign=side;
    this.diagnostic('straight seed line');
    try{
      for(let n=first[rows.depth];rows.sign<0?n<=rows.far:n>=rows.far;n-=rows.sign){
        this.check(token);const p={...first,[rows.depth]:n};this.target=p;
        const b=this.bot.blockAt(this.vec(p));if(!b)throw fail('chunk_unloaded');
        if(AIR.has(b.name)){if(!this.references(p).length)throw fail('no_support');await this.placeOne(p,token);}
      }
    }finally{this.seedPlan=null;this.routeTarget=null;this.routePolicy=null;this.halt();}
  }
}
module.exports = { AutoBuild, region, cell, catalog, movements, surfacePhysics };
