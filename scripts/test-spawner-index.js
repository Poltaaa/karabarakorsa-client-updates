'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SpawnerIndex = require('../src/main/bot/spawner-index');
const SpawnerProtect = require('../src/main/bot/spawner-protect');
class Vec {
  constructor(x, y, z) { Object.assign(this, { x, y, z }); }
  offset(x, y, z) { return new Vec(this.x + x, this.y + y, this.z + z); }
  clone() { return this.offset(0, 0, 0); }
  distanceTo(p) { return Math.hypot(this.x - p.x, this.y - p.y, this.z - p.z); }
}
function column(minY = 64, palette = [0, 1, 52], places = []) {
  const data = new Map(places.map(([x, y, z, state = 52]) => [`${x},${y},${z}`, state]));
  return { minY, worldHeight: 16, sections: [{ palette }], data, reads: 0,
    getBlockStateId(p) { this.reads++; return data.get(`${p.x},${p.y},${p.z}`) || 0; } };
}
function fixture(cols = new Map()) {
  const bot = new EventEmitter();
  bot.registry = { blocksByName: { spawner: { id: 52, minStateId: 52, maxStateId: 53 } } };
  bot.username = 'local-test'; bot.entity = { position: new Vec(0, 64, 0) }; bot.game = { minY: 64, height: 16 };
  bot.players = {}; bot.physicsEnabled = false;
  bot.world = { getColumns: () => [...cols].map(([key, column]) => ({ chunkX: Number(key.split(',')[0]), chunkZ: Number(key.split(',')[1]), column })),
    getColumn: (x, z) => cols.get(`${x},${z}`) };
  bot.blockAt = (p) => {
    const c = cols.get(`${Math.floor(p.x / 16)},${Math.floor(p.z / 16)}`);
    if (!c) return null; const state = c.data.get(`${p.x & 15},${p.y},${p.z & 15}`) || 0;
    return { type: state === 52 || state === 53 ? 52 : 0, name: state === 52 || state === 53 ? 'spawner' : 'air', position: p };
  };
  return { bot, cols };
}
function controlled(bot) {
  const queue = []; let clock = 0;
  const index = new SpawnerIndex(bot, { now: () => { clock += 0.25; return clock; }, budgetMs: 2,
    schedule: (fn) => { const task = { fn, cancelled: false }; queue.push(task); return task; },
    cancel: (task) => { task.cancelled = true; } });
  const drain = () => { let guard = 0; while (queue.length) { assert(guard++ < 10000); const task = queue.shift(); if (!task.cancelled) task.fn(); } };
  return { index, queue, drain };
}
const logger = { L: (tr) => tr, info: () => {}, warn: () => {} };
let passed = 0;
async function test(label, fn) { await fn(); passed++; }
async function main() {
  await test('Startup queues work without synchronous voxel reads', async () => {
    const c = column(64, [0, 52], [[1, 64, 1]]), f = fixture(new Map([['0,0', c]])), t = controlled(f.bot);
    assert.equal(c.reads, 0); assert(t.index.pending); assert.equal(t.index.ready, false); t.drain();
    assert.equal(t.index.query(new Vec(0, 64, 0), new Vec(0, 64, 0), 150).length, 1); t.index.stop();
  });
  await test('Non-spawner palettes skip whole section with no block objects', async () => {
    const c = column(64, [0, 1, 2]), t = controlled(fixture(new Map([['0,0', c]])).bot); t.drain();
    assert.equal(c.reads, 0); assert.equal(t.index.stats.sectionsSkipped, 1); assert(t.index.ready); t.index.stop();
  });
  await test('No palette uses bounded raw state scan', async () => {
    const c = column(-64, undefined, [[1, -64, 1]]); c.sections[0].palette = null;
    const t = controlled(fixture(new Map([['0,0', c]])).bot); t.drain();
    assert.equal(c.reads, 4096); assert.equal(t.index.query(new Vec(0, -64, 0), new Vec(0, -64, 0), 150)[0].y, -64);
    assert(t.index.stats.slices > 1); assert(t.index.stats.maxSliceMs <= 2.5); t.index.stop();
  });
  await test('All spawner states in registry range match', async () => {
    const c = column(64, [52, 53], [[1,64,1,52], [2,64,2,53]]), t = controlled(fixture(new Map([['0,0', c]])).bot); t.drain();
    assert.equal(t.index.query(new Vec(0,64,0), new Vec(0,64,0), 150).length, 2); t.index.stop();
  });
  await test('150-block area and nearest-first ordering remain unchanged', async () => {
    const f = fixture(), t = controlled(f.bot); t.drain();
    for (const x of [150, 151, -150, 1]) f.bot.emit('blockUpdate', null, { name: 'spawner', position: new Vec(x,64,0) });
    const result = t.index.query(new Vec(0,64,0), new Vec(0,64,0), 150); assert.deepStrictEqual(result.map((p) => p.x), [1, 150, -150]); t.index.stop();
  });
  await test('Negative chunk coordinates produce correct absolute positions', async () => {
    const c = column(64, [52], [[15,64,15]]), t = controlled(fixture(new Map([['-1,-1', c]])).bot); t.drain();
    const p = t.index.query(new Vec(0,64,0), new Vec(0,64,0), 150)[0]; assert.equal(p.x, -1); assert.equal(p.z, -1); t.index.stop();
  });
  await test('Placement and removal update index immediately', async () => {
    const f = fixture(), t = controlled(f.bot); t.drain(); const p = new Vec(3,64,3);
    f.bot.emit('blockUpdate', null, { name: 'spawner', position: p }); assert.equal(t.index.query(p,p,150).length, 1);
    f.bot.emit('blockUpdate', null, { name: 'air', position: p }); assert.equal(t.index.query(p,p,150).length, 0); t.index.stop();
  });
  await test('Unrelated block updates do not invalidate the spawner cache', async () => {
    const f = fixture(), t = controlled(f.bot); const before = t.index.revision;
    for (let i=0; i<1000; i++) f.bot.emit('blockUpdate', null, { name: 'stone', position: new Vec(i,64,0) });
    assert.equal(t.index.revision, before); assert.equal(t.index.columns.size, 0); t.index.stop();
  });
  await test('Chunk load wakes idle index; chunk unload removes coordinates', async () => {
    const f = fixture(), t = controlled(f.bot); t.drain(); f.cols.set('1,0', column(64,[52],[[0,64,0]]));
    f.bot.emit('chunkColumnLoad', new Vec(16,0,0)); assert(t.index.pending); t.drain();
    assert.equal(t.index.query(new Vec(0,64,0),new Vec(0,64,0),150).length,1);
    f.cols.delete('1,0'); f.bot.emit('chunkColumnUnload', new Vec(16,0,0)); assert.equal(t.index.query(new Vec(0,64,0),new Vec(0,64,0),150).length,0); t.index.stop();
  });
  await test('Chunk replacement during scan cannot publish stale coordinates', async () => {
    const f = fixture(new Map([['0,0', column(64,[52],[[1,64,1]])]])), t = controlled(f.bot);
    f.cols.set('0,0', column(64,[52],[[2,64,2]])); f.bot.emit('chunkColumnLoad',new Vec(0,0,0)); t.drain();
    assert.deepStrictEqual(t.index.query(new Vec(0,64,0),new Vec(0,64,0),150).map((p)=>p.x),[2]); t.index.stop();
  });
  await test('In-place chunk reload during yielded scan gets a clean rescan', async () => {
    const c=column(64,[52],[]),f=fixture(new Map([['0,0',c]])),t=controlled(f.bot);
    // Run one slice; x=1,y=64,z=1 has already been visited.
    t.queue.shift().fn(); c.data.set('1,64,1',52); f.bot.emit('chunkColumnLoad',new Vec(0,0,0)); t.drain();
    assert(t.index.query(new Vec(0,64,0),new Vec(0,64,0),150).some(p=>p.x===1&&p.z===1)); t.index.stop();
  });
  await test('Idle queries never rescan unchanged world', async () => {
    const c = column(64,[0,1]), t = controlled(fixture(new Map([['0,0',c]])).bot); t.drain(); const before=t.index.stats.slices;
    for(let i=0;i<1000;i++) t.index.query(new Vec(0,64,0),new Vec(0,64,0),150);
    assert.equal(t.index.stats.slices,before); assert.equal(c.reads,0); assert.equal(t.queue.length,0); t.index.stop();
  });
  await test('Stop cancels slices and resolves pending wait safely', async () => {
    const f=fixture(new Map([['0,0',column()]])),t=controlled(f.bot); const idle=t.index.whenIdle(); t.index.stop(); t.drain();
    assert.equal(await idle,false); for(const event of ['blockUpdate','chunkColumnLoad','chunkColumnUnload','respawn','end']) assert.equal(f.bot.listenerCount(event),0);
  });
  await test('World reset invalidates generation and clears removed chunks', async () => {
    const f=fixture(new Map([['0,0',column(64,[52],[[1,64,1]])]])),t=controlled(f.bot); t.drain(); const epoch=t.index.epoch;
    f.cols.clear(); f.bot.emit('respawn'); t.drain(); assert(t.index.epoch>epoch); assert.equal(t.index.query(new Vec(0,64,0),new Vec(0,64,0),150).length,0); t.index.stop();
  });
  await test('Spawner protect periodic checks never call blocking findBlocks', async () => {
    const c=column(64,[0,1]),f=fixture(new Map([['0,0',c]])); let calls=0;
    f.bot.findBlocks=()=>{calls++;throw Error('blocking search forbidden');}; f.bot.players={stranger:{username:'stranger',entity:{position:new Vec(1,64,0)}}};
    const p=new SpawnerProtect(logger); p.start(f.bot,{spawnerProtect:{enabled:true,trusted:[]}}); await p._spawnerIndex.whenIdle();
    const slices=p._spawnerIndex.stats.slices;
    for(let i=0;i<100;i++){p._noSpawnerUntil=0;p.tick();}
    assert.equal(calls,0); assert.equal(c.reads,0); assert.equal(p._spawnerIndex.stats.slices,slices); assert(p.armed); p.stop();
  });
  await test('Incomplete index never sets the negative-cache timer', async () => {
    const f=fixture(new Map([['0,0',column()]])); f.bot.players={stranger:{username:'stranger',entity:{position:new Vec(1,64,0)}}};
    const p=new SpawnerProtect(logger); p.start(f.bot,{spawnerProtect:{enabled:true,trusted:[]}}); p.tick();
    assert.equal(p._noSpawnerUntil,0); p.stop();
  });
  await test('New loaded spawner bypasses an old five-second empty cache', async () => {
    const f=fixture(new Map([['0,0',column(64,[0,1])]])); f.bot.players={stranger:{username:'stranger',entity:{position:new Vec(1,64,0)}}};
    const p=new SpawnerProtect(logger); p.start(f.bot,{spawnerProtect:{enabled:true,trusted:[]}}); await p._spawnerIndex.whenIdle(); p.tick();
    assert(p._noSpawnerUntil>Date.now()); let calls=0;p.breakLoop=()=>{calls++;};
    f.cols.set('1,0',column(64,[52],[[0,64,0]])); f.bot.emit('chunkColumnLoad',new Vec(16,0,0)); await p._spawnerIndex.whenIdle(); p.tick();
    assert.equal(calls,1);p.stop();
  });
  await test('Exit-after-break waits for complete index and sees remaining blocks', async () => {
    const fresh=new Vec(1,64,0),old=new Vec(2,64,0),f=fixture();let broken=false,exit=0,complete;
    f.bot.blockAt=(pos)=>({type:pos===fresh&&broken?0:52,name:pos===fresh&&broken?'air':'spawner',position:pos});
    const p=new SpawnerProtect(logger);p.bot=f.bot;p.running=true;p.cfg={breakRadius:150,exitAfterBreak:true};p.onExit=()=>exit++;
    p.ensurePickaxe=async()=>true;p.breakSpawner=async()=>{broken=true;return true;};p.findSpawners=()=>[old];
    p._spawnerIndex={epoch:0,whenIdle:()=>new Promise(r=>{complete=r;}),stop:()=>{}};
    const task=p.breakLoop([fresh]);await new Promise(r=>setTimeout(r,140));assert(broken);assert.equal(exit,0);assert(complete);
    complete(true);await task;assert.equal(exit,0,'another indexed spawner remains');p.stop();
  });
  await test('World change during pending completion must not cause exit', async () => {
    const fresh=new Vec(1,64,0),f=fixture();let broken=false,exit=0,complete;
    f.bot.blockAt=()=>({type:broken?0:52,name:broken?'air':'spawner',position:fresh});
    const p=new SpawnerProtect(logger);p.bot=f.bot;p.running=true;p.cfg={breakRadius:150,exitAfterBreak:true};p.onExit=()=>exit++;
    p.ensurePickaxe=async()=>true;p.breakSpawner=async()=>{broken=true;return true;};p.findSpawners=()=>[];
    p._spawnerIndex={epoch:0,whenIdle:()=>new Promise(r=>{complete=r;}),stop:()=>{}};
    const task=p.breakLoop([fresh]);await new Promise(r=>setTimeout(r,140));assert(complete);p._spawnerIndex.epoch++;complete(true);await task;assert.equal(exit,0);p.stop();
  });
  await test('Cancelled pending scan cannot disarm restarted protection', async () => {
    const f=fixture();const p=new SpawnerProtect(logger);p.bot=f.bot;p.running=true;let release;
    p._spawnerIndex={epoch:0,whenIdle:()=>new Promise(r=>{release=r;}),stop:()=>release(false)};
    const old=p.breakLoop();assert(p.busy);p.start(f.bot,{spawnerProtect:{enabled:true,trusted:[]}});await old;
    assert(p.running);assert(p.armed);assert.equal(p.waitingForClear,false);assert.equal(p.busy,false);p.stop();
  });
  await test('State IPC signature ignores uptime but detects real changes', async () => {
    const src=fs.readFileSync(path.resolve(__dirname,'../src/main/main.js'),'utf8');
    const fn=src.match(/function stateUiSignature\(st\) \{[\s\S]*?\n\}/)[0]; const ctx={}; vm.runInNewContext(fn,ctx);
    assert.equal(ctx.stateUiSignature({status:'ONLINE',uptime:1,ping:5}),ctx.stateUiSignature({status:'ONLINE',uptime:1000,ping:5}));
    assert.notEqual(ctx.stateUiSignature({slot:1,ping:5}),ctx.stateUiSignature({slot:2,ping:5}));
    assert.notEqual(ctx.stateUiSignature({slot:1,ping:5}),ctx.stateUiSignature({slot:1,ping:6}));
  });
  console.log(`Parçalı tarama/kararlı durum testleri tamam: ${passed} senaryo.`);
}
main().catch((err)=>{console.error(err);process.exitCode=1;});
