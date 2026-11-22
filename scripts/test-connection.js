'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { createRequire } = require('module');
const { ConnectionAttempt, resolveTarget } = require('../src/main/bot/connection-transport');
const NetworkHealth = require('../src/main/bot/network-health');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const turn = () => new Promise((r) => setImmediate(r));
let passed = 0;
async function test(label, fn) { await fn(); passed++; }
function logger() {
  const lines = [];
  const l = { lines, L: (_tr, en) => en, ts: () => '00:00:00' };
  for (const type of ['info', 'warn', 'error', 'chat', 'connect', 'disconnect', 'reconnect']) l[type] = (m) => lines.push({ type, m });
  return l;
}
class Socket extends EventEmitter {
  constructor() { super(); this.destroyed = false; this.writes = []; this.extra = []; }
  destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('close'); } }
  end() { this.destroy(); }
  setKeepAlive(...args) { this.keepAlive = args; }
  write(data) { this.writes.push(data); }
  pause() {}
  resume() {}
  unshift(data) { this.extra.push(data); }
}
class Client extends EventEmitter {
  constructor() { super(); this.errors = []; this.ends = []; this.sent = []; this.state = 'play';
    this.on('error', (e) => this.errors.push(e)); this.on('end', (r) => this.ends.push(r)); }
  setSocket(socket) { this.socket = socket; socket.on('error', (e) => this.emit('error', e));
    socket.once('close', () => this.emit('end', 'socketClosed')); socket.on('connect', () => this.emit('connect')); }
  end() { if (this.socket) this.socket.end(); }
  write(name, params) { this.sent.push({ name, params }); return true; }
}
function fakeNet() { const sockets = [], calls = []; return { sockets, calls, connect: (target) => {
  calls.push(target); const s = new Socket(); sockets.push(s); return s;
} }; }
function config() { return { connection: { host: 'local.test', port: 25565, version: 'auto', loginDelay: 0, resourcePack: 'decline' },
  toggles: { offline: true }, settings: {}, antiAfk: { enabled: false }, autoSpam: { enabled: false },
  autoReconnect: { enabled: false }, macros: {}, spawnerProtect: { enabled: false } }; }
function managerFixture() {
  const filename = path.resolve(__dirname, '../src/main/bot/bot-manager.js');
  const realRequire = createRequire(filename);
  const bots = [], options = [], probeCalls = [];
  const mf = { createBot: (o) => {
    options.push(o); const bot = new EventEmitter(); bot._client = new Client(); bot.username = o.username;
    bot.end = () => bot._client.end(); bot.quit = bot.end;
    bot._client.on('error', (err) => bot.emit('error', err)); bots.push(bot); return bot;
  } };
  const mod = { exports: {} };
  const fakeMcp = { ping: (o, cb) => { probeCalls.push(o); setImmediate(() => cb(null, { version: { name: '1.20.1', protocol: 763 }, players: { online: 1, max: 10 }, latency: 5 })); } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: mod, exports: mod.exports, require: (name) => name === 'mineflayer' ? mf : name === 'minecraft-protocol' ? fakeMcp : realRequire(name),
    setTimeout, clearTimeout, setInterval, clearInterval, Buffer, console, process
  }, { filename });
  const log = logger(), manager = new mod.exports(log, '/unused-auth-cache');
  return { manager, bots, options, log, probeCalls };
}
async function main() {
  await test('SRV priority and target port', async () => {
    const t = await resolveTarget('local.test', 25565, { dns: { resolveSrv: (_name, cb) => cb(null, [
      { name: 'wrong.test', port: 25565, priority: 10, weight: 100 },
      { name: 'right.test.', port: 25570, priority: 1, weight: 1 }
    ]) }, random: () => 0.2 });
    assert.deepStrictEqual(t, { host: 'right.test', port: 25570, srv: true });
  });
  await test('IP and explicit port skip SRV', async () => {
    const d = { resolveSrv: () => { throw Error('must not query SRV'); } };
    assert.equal((await resolveTarget('127.0.0.1', 25565, { dns: d })).srv, false);
    assert.equal((await resolveTarget('local.test', 25570, { dns: d })).port, 25570);
  });
  await test('No SRV uses hostname, not hardcoded IP', async () => {
    const t = await resolveTarget('local.test', 25565, { dns: { resolveSrv: (_name, cb) => cb({ code: 'ENODATA' }) } });
    assert.equal(t.host, 'local.test'); assert.equal(t.port, 25565);
  });
  await test('Transient DNS failure is not silent fallback', async () => {
    const target = await resolveTarget('local.test', 25565, { dns: { resolveSrv: (_name, cb) => cb({ code: 'EAI_AGAIN' }) } });
    assert.equal(target.host, 'local.test'); assert.equal(target.port, 25565);
    assert.equal(target.srvFallback.code, 'EAI_AGAIN');
  });
  await test('DNS timeout ignores late callback', async () => {
    let callback;
    const p = resolveTarget('local.test', 25565, { dnsTimeoutMs: 15, dns: { resolveSrv: (_name, cb) => { callback = cb; } } });
    const target = await p; assert.equal(target.srvFallback.code, 'SRV_TIMEOUT');
    assert.equal(target.host, 'local.test'); callback(null, [{ name: 'late.test', port: 1 }]);
    assert.equal(target.host, 'local.test'); assert.equal(target.port, 25565);
  });
  await test('Silent SRV still dials game/status through configured hostname', async () => {
    const n=fakeNet(), log=logger(); let queries=0, cancel=0, late;
    const a=new ConnectionAttempt({host:'local.test',port:25565},null,log,{net:n,dnsTimeoutMs:15,dns:{
      resolveSrv:(_name,cb)=>{queries++;late=cb;},cancel:()=>cancel++}});
    const game=new Client(),status=new Client();a.connect(game);a.connect(status);await sleep(35);
    assert.equal(queries,1);assert.equal(cancel,1);assert.equal(n.calls.length,2);
    assert(n.calls.every(x=>x.host==='local.test'&&x.port===25565));assert.equal(game.errors.length,0);
    assert.equal(log.lines.filter(x=>x.type==='warn').length,1);assert(log.lines.some(x=>x.m.includes('SRV fallback / OS DNS')));
    late(null,[{name:'late.test',port:25000}]);await turn();assert.equal(n.calls.length,2);a.abort();assert(n.sockets.every(s=>s.destroyed));
  });
  await test('Cancel while SRV is pending does not trigger fallback dial', async () => {
    const n=fakeNet(),log=logger();let cancelled=0;
    const a=new ConnectionAttempt({host:'local.test',port:25565},null,log,{net:n,dnsTimeoutMs:15,dns:{resolveSrv:()=>{},cancel:()=>cancelled++}});
    a.connect(new Client());a.abort();await sleep(30);assert.equal(n.calls.length,0);assert.equal(cancelled,1);assert.equal(log.lines.length,0);
  });
  await test('SRV resolver refusal warns before normal hostname dial', async () => {
    const n=fakeNet(),log=logger(),a=new ConnectionAttempt({host:'local.test',port:25565},null,log,{net:n,dns:{resolveSrv:(_name,cb)=>cb({code:'EREFUSED',message:'SRV refused'})}});
    a.connect(new Client());await turn();assert.equal(n.calls[0].host,'local.test');assert(log.lines.some(x=>x.type==='warn'&&x.m.includes('EREFUSED')));a.abort();
  });
  await test('Authoritative SRV service-unavailable does not use fallback', async () => {
    await assert.rejects(resolveTarget('local.test',25565,{dns:{resolveSrv:(_name,cb)=>cb(null,[{name:'.',port:0}])}}),e=>e.code==='ECONNREFUSED');
  });
  await test('Cancel during DNS prevents late dial', async () => {
    let callback; const n = fakeNet(), c = new Client();
    const a = new ConnectionAttempt({ host: 'local.test', port: 25565 }, null, logger(), { net: n, dns: { resolveSrv: (_name, cb) => { callback = cb; } } });
    a.connect(c); a.abort(); callback(null, [{ name: 'late.test', port: 25570 }]); await turn();
    assert.equal(n.calls.length, 0); assert.equal(a.clients.size, 0); assert.equal(c.errors.length, 0); assert.equal(c.ends.length, 1);
  });
  await test('Game and auto-version share DNS but both sockets cancel', async () => {
    let queries = 0; const n = fakeNet(); const a = new ConnectionAttempt({ host: 'local.test', port: 25565 }, null, logger(), {
      net: n, dns: { resolveSrv: (_name, cb) => { queries++; cb(null, [{ name: 'srv.test.', port: 25570 }]); } }
    });
    const game = new Client(), status = new Client(); a.connect(game); a.connect(status); await turn();
    assert.equal(queries, 1); assert.equal(n.sockets.length, 2);
    assert(n.calls.every((x) => x.host === 'srv.test' && x.port === 25570));
    assert.equal(a.target.host, 'local.test', 'handshake hostname must not mutate');
    n.sockets.forEach((s) => s.emit('connect')); assert.deepStrictEqual(n.sockets[0].keepAlive, [true, 30000]);
    a.abort(); assert(n.sockets.every((s) => s.destroyed)); assert.equal(a.clients.size, 0);
  });
  await test('Closing status does not close game scope', async () => {
    const n = fakeNet(), a = new ConnectionAttempt({ host: '127.0.0.1', port: 25565 }, null, logger(), { net: n });
    const game = new Client(), status = new Client(); a.connect(game); a.connect(status); await turn();
    n.sockets.forEach((s) => s.emit('connect')); status.end();
    assert.equal(a.clients.size, 1); assert.equal(a.closed, false); assert.equal(game.socket.destroyed, false); a.abort();
  });
  await test('Pending TCP has bounded timeout', async () => {
    const n = fakeNet(), c = new Client(); const a = new ConnectionAttempt({ host: '127.0.0.1', port: 1 }, null, logger(), { net: n, connectTimeoutMs: 15 });
    a.connect(c); await sleep(35); assert.equal(c.errors.length, 1); assert.equal(c.errors[0].code, 'ETIMEDOUT'); assert(c.socket.destroyed); a.abort();
  });
  await test('SOCKS socket exists before handshake and cancels late result', async () => {
    const n = fakeNet(); let complete;
    const a = new ConnectionAttempt({ host: '127.0.0.1', port: 25565 }, { host: 'proxy.test', port: 1080, type: 'socks5' }, logger(), {
      net: n, socks: { SocksClient: { createConnection: (o) => { assert.equal(o.existing_socket, n.sockets[0]); return new Promise((r) => { complete = r; }); } } }
    });
    const c = new Client(); a.connect(c); await turn(); n.sockets[0].emit('connect'); a.abort();
    assert(n.sockets[0].destroyed); const late = new Socket(); complete({ socket: late }); await turn();
    assert(late.destroyed); assert.equal(c.socket, undefined); assert.equal(c.errors.length, 0);
  });
  await test('HTTP fragmented header and coalesced game bytes', async () => {
    const n = fakeNet(), c = new Client(); const a = new ConnectionAttempt({ host: '127.0.0.1', port: 25565 }, { host: 'proxy.test', port: 8080, type: 'http' }, logger(), { net: n });
    a.connect(c); await turn(); const s = n.sockets[0]; s.emit('connect');
    s.emit('data', Buffer.from('HTTP/1.1 200 Connection')); assert.equal(c.socket, undefined);
    s.emit('data', Buffer.from(' established\r\n\r\nGAME')); assert.equal(c.socket, s);
    assert.equal(s.extra[0].toString(), 'GAME'); assert.equal(c.errors.length, 0); a.abort();
  });
  await test('HTTP tunnel rejection is terminal', async () => {
    const n = fakeNet(), c = new Client(); const a = new ConnectionAttempt({ host: '127.0.0.1', port: 25565 }, { host: 'proxy.test', port: 8080, type: 'http' }, logger(), { net: n });
    a.connect(c); await turn(); n.sockets[0].emit('connect'); n.sockets[0].emit('data', Buffer.from('HTTP/1.1 407 Authentication Required\r\n\r\n'));
    assert.equal(c.errors[0].code, 'ECONNREFUSED'); assert(n.sockets[0].destroyed); assert.equal(a.clients.size, 0); a.abort();
  });
  await test('Critical replies are synchronous and lossless, even 5000 pongs', async () => {
    const f = managerFixture(), m = f.manager; await m.connect(config(), { username: 'local-test', type: 'offline' });
    const c = m.bot._client;
    for (let id = 0; id < 5000; id++) c.write('pong', { id });
    c.write('keep_alive', { keepAliveId: BigInt(123) }); c.write('teleport_confirm', { teleportId: 10 });
    assert.equal(c.sent.length, 5002); assert.equal(c.sent[4999].params.id, 4999); assert.equal(c.sent[5000].params.keepAliveId, BigInt(123));
    assert.equal(m._networkHealth.pongTx, 5000); m.disconnect();
  });
  await test('Pre-login refused connection clears state immediately', async () => {
    const f = managerFixture(), m = f.manager; await m.connect(config(), { username: 'local-test', type: 'offline' });
    const old = m.bot, transport = m._transport;
    old.emit('error', Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED', address: '127.0.0.1', port: 1 }));
    assert.equal(m.status, 'OFFLINE'); assert.equal(m.bot, null); assert(transport.closed); assert.equal(m.connectGuard, null); assert.equal(m.spawnTimeout, null);
    assert(m.lastError.includes('not a Minecraft version error')); m.disconnect();
  });
  await test('Old error/end/login cannot corrupt a new session', async () => {
    const f = managerFixture(), m = f.manager; await m.connect(config(), { username: 'first', type: 'offline' }); const old = m.bot;
    m.disconnect(); await m.connect(config(), { username: 'second', type: 'offline' }); const next = m.bot, before = f.log.lines.length;
    old._client.emit('error', Object.assign(Error('late refused'), { code: 'ECONNREFUSED' }));
    old.emit('end', 'late-close'); old.emit('login'); old.emit('message', 'late-chat');
    assert.equal(m.bot, next); assert.equal(m.status, 'CONNECTING'); assert.equal(m.lastError, ''); assert.equal(f.log.lines.length, before); m.disconnect();
  });
  await test('Old delayed connect cannot spawn after reconnect', async () => {
    const f = managerFixture(), m = f.manager, cfg = config(); cfg.connection.loginDelay = 0.04;
    const pending = m.connect(cfg, { username: 'old', type: 'offline' }); await sleep(5); m.disconnect();
    await m.connect(config(), { username: 'new', type: 'offline' }); const live = m.bot;
    assert.equal((await pending).ok, false); assert.equal(m.bot, live); assert.equal(f.bots.length, 1); m.disconnect();
  });
  await test('Double connect during login delay is rejected', async () => {
    const f = managerFixture(), cfg = config(); cfg.connection.loginDelay = 0.02;
    const pending = f.manager.connect(cfg, { username: 'first', type: 'offline' });
    const second = await f.manager.connect(config(), { username: 'second', type: 'offline' });
    assert.equal(second.error, 'already_connected'); await pending; assert.equal(f.bots.length, 1); f.manager.disconnect();
  });
  await test('Disconnect while VPN identity waits prevents late spawn', async () => {
    const f = managerFixture(), cfg = config(); let release;
    cfg.tor = { enabled: true, streamSeparation: true }; cfg.vpnNewIdentity = () => new Promise((r) => { release = r; });
    const pending = f.manager.connect(cfg, { username: 'vpn-test', type: 'offline' }); await sleep(5); f.manager.disconnect(); release();
    assert.equal((await pending).ok, false); assert.equal(f.bots.length, 0);
  });
  await test('Auto-version status timeout is bounded', async () => {
    const f = managerFixture(); await f.manager.connect(config(), { username: 'local-test', type: 'offline' });
    assert.equal(f.options[0].closeTimeout, 15000); assert.equal(f.options[0].noPongTimeout, 1500); assert.equal(typeof f.options[0].connect, 'function'); f.manager.disconnect();
  });
  await test('Server probe no longer collides with numeric ping property', async () => {
    const f = managerFixture(); assert.equal(f.manager.ping, 0);
    const r = await f.manager.probeServer('local.test', 25565); assert.equal(r.ok, true);
    assert.equal(typeof f.probeCalls[0].connect, 'function'); assert.equal(f.probeCalls[0].closeTimeout, 4500);
    const main = fs.readFileSync(path.resolve(__dirname, '../src/main/main.js'), 'utf8'); assert(main.includes('anyBot.probeServer('));
  });
  await test('Heartbeat diagnostics counts and detects loop lag', async () => {
    const c = new Client(), log = logger(); let now = 0; const h = new NetworkHealth(c, log, { now: () => now });
    c.emit('packet', {}, { name: 'ping' }); h.sent('pong'); c.emit('packet', {}, { name: 'keep_alive' }); h.sent('keep_alive');
    now = 65000; h.tick(); assert(log.lines[0].m.includes('pong=1/1')); assert(log.lines[0].m.includes('keepalive=1/1'));
    assert(log.lines[0].m.includes('loopDelayMax=64000ms')); h.stop(); assert.equal(c.listenerCount('packet'), 0);
  });
  await test('A fresh manual connect clears an older reconnect timer', async () => {
    const f = managerFixture(); let fired = false;
    f.manager.reconnectTimer = setTimeout(() => { fired = true; }, 15);
    await f.manager.connect(config(), { username: 'fresh', type: 'offline' });
    assert.equal(f.manager.reconnectTimer, null); await sleep(25); assert.equal(fired, false); f.manager.disconnect();
  });
  await test('Backend timeout in chat records health without false TCP disconnect', async () => {
    const f = managerFixture(); await f.manager.connect(config(), { username: 'backend', type: 'offline' });
    const bot = f.manager.bot; bot.emit('login');
    bot.emit('message', 'You were kicked from skyblock-ada-dyn-4: Connection timed out (AesirGuard)');
    assert.equal(f.manager.bot, bot); assert.equal(f.manager.status, 'ONLINE');
    assert(f.log.lines.some((x) => x.m.includes('Network health:')));
    assert(f.log.lines.some((x) => x.m.includes('sub-server reported Connection timed out'))); f.manager.disconnect();
  });
  await test('No queued heartbeat limiter remains', async () => {
    const s = fs.readFileSync(path.resolve(__dirname, '../src/main/bot/bot-manager.js'), 'utf8');
    assert(!s.includes('PongPacer')); assert(!s.includes('pongPacer.enqueue')); assert(s.includes('CRITICAL.test(n)'));const {CRITICAL}=require('../src/main/bot/packet-budget');for(const n of ['pong','keep_alive','teleport_confirm','configuration_acknowledged','finish_configuration','login_acknowledged'])assert(CRITICAL.test(n));
  });
  await test('Packet logging enabled after login includes outgoing placement', async () => {
    const f=managerFixture(),m=f.manager;await m.connect(config(),{username:'dynamic-log',type:'offline'});
    const b=m.bot,c=b._client;c.write('block_place',{direction:1});assert(!f.log.lines.some(x=>x.m==='-> block_place'));
    m.cfg.settings.packetLog=true;c.write('block_place',{direction:1});assert(f.log.lines.some(x=>x.m==='-> block_place'));
    m.cfg.settings.packetLog=false;const before=f.log.lines.filter(x=>x.m==='-> block_place').length;c.write('block_place',{direction:1});assert.equal(f.log.lines.filter(x=>x.m==='-> block_place').length,before);m.disconnect();
  });
  await test('Build aim sees only motion that passed limiter; copied angles cannot mutate', async () => {
    const f=managerFixture(),m=f.manager;await m.connect(config(),{username:'wire-view',type:'offline'});
    const b=m.bot,c=b._client;let observations=0;b.on('kb:view-sent',()=>observations++);
    for(let i=0;i<27;i++)c.write('look',{yaw:i,pitch:i});assert.equal(observations,27);assert.equal(b.__kbLastView.pitch,26);
    c.write('look',{yaw:90,pitch:90});assert.equal(observations,27);assert.equal(b.__kbLastView.pitch,26);
    m._posLog=[];const packet={yaw:15,pitch:35};c.write('position_look',packet);packet.pitch=0;assert.equal(b.__kbLastView.pitch,35);m.disconnect();
  });
  await test('Ban notification stops reconnect and smart retry without persisting raw text', async()=>{
    const f=managerFixture(),m=f.manager,cfg=config();cfg.autoReconnect={enabled:true,delay:1,unlimited:true};await m.connect(cfg,{username:'ban-test',type:'offline'});
    m.bot.emit('kicked','You are temporarily banned for 14 days');assert(m._moderationStop);assert.equal(m.maybeSmartRetry(),false);m.scheduleReconnect();assert(!m.reconnectTimer);m.disconnect();
  });
  console.log(`Bağlantı/heartbeat testleri tamam: ${passed} senaryo.`);
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
