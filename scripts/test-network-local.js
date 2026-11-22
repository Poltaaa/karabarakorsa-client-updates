'use strict';
// Real sockets + pinned protocol/Mineflayer, loopback only. No external accounts.
const assert = require('assert');
const net = require('net');
const { once } = require('events');
const mcp = require('minecraft-protocol');
const BotManager = require('../src/main/bot/bot-manager');
const { ConnectionAttempt } = require('../src/main/bot/connection-transport');
const testVersion = process.env.LOCAL_MC_VERSION || '1.20.1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 5000) { const deadline = Date.now() + timeout; while (!fn() && Date.now() < deadline) await sleep(20); assert(fn(), 'local test deadline exceeded'); }
function cfg(port, version = 'auto') { return { connection: { host: '127.0.0.1', port, version, loginDelay: 0, resourcePack: 'decline' }, toggles: { offline: true }, settings: {}, antiAfk: { enabled: false }, autoSpam: { enabled: false }, autoReconnect: { enabled: false }, macros: {}, spawnerProtect: { enabled: false } }; }
function logger() { const lines = []; const l = { lines, L: (_tr, en) => en, ts: () => '00:00:00' }; for (const t of ['info','warn','error','connect','disconnect','reconnect','chat']) l[t] = (m) => lines.push({ t, m }); return l; }
async function main() {
  let manager, server, blackhole, attempt;
  const idleSockets = new Set(), proxySockets = new Set(), proxies = [];
  try {
    // Reserve a dynamic loopback port; no privileged/static public ports.
    const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
    const port = reservation.address().port; await new Promise((r) => reservation.close(r));
    server = mcp.createServer({ host: '127.0.0.1', port, version: testVersion, 'online-mode': false, keepAlive: false, hideErrors: true });
    const handshakes = [], replies = [];
    server.on('connection', (c) => { c.on('error', () => {}); c.on('set_protocol', (p) => handshakes.push(p)); });
    let player;
    server.on('playerJoin', (c) => {
      player = c;
      c.on('pong', (p) => replies.push(p.id));
      c.on('keep_alive', (p) => replies.push('keep:' + String(p.keepAliveId)));
      c.write('login', { ...require('minecraft-data')(testVersion).loginPacket, entityId: 1, death: null });
    });
    await once(server, 'listening');
    const log = logger(); manager = new BotManager(log, '/unused-local-auth-cache');
    await manager.connect(cfg(port), { username: 'LocalTest', type: 'offline' });
    await until(() => manager.loggedIn);
    assert.equal(manager.bot.version, testVersion);
    assert(handshakes.some((p) => p.nextState === 1)); assert(handshakes.some((p) => p.nextState === 2));
    assert.equal(manager._transport.clients.size, 1, 'status socket must be released after auto detect');
    for (let i = 0; i < 3000; i++) player.write('ping', { id: i });
    player.write('keep_alive', { keepAliveId: BigInt('9007199254740993') });
    await until(() => replies.length === 3001);
    assert.deepStrictEqual(replies.slice(0, 3000), Array.from({ length: 3000 }, (_, i) => i));
    assert.equal(replies[3000], 'keep:9007199254740993');
    for (let i = 0; i < 3; i++) {
      const worldState = require('minecraft-data')(testVersion).loginPacket.worldState;
      const oldRespawn = { dimension: 'minecraft:overworld', worldName: 'minecraft:overworld', hashedSeed: [0, 0], gamemode: 0,
        previousGamemode: 0, isDebug: false, isFlat: true, copyMetadata: false, death: null, portalCooldown: 0 };
      player.write('respawn', worldState ? { worldState, copyMetadata: 0 } : oldRespawn);
      player.write('ping', { id: 4000 + i });
    }
    await until(() => replies.length === 3004);
    assert.deepStrictEqual(replies.slice(-3), [4000, 4001, 4002]);
    assert.equal(manager.status, 'ONLINE');
    const old = manager.bot, scope = manager._transport; manager.disconnect();
    await until(() => old._client.socket.destroyed);
    assert(scope.closed); assert.equal(manager._transport, null); assert.equal(manager._networkHealth, null);
    console.log('Local integration (' + testVersion + '): auto detect + 3000 ordered pongs + 64-bit keepalive + 3 world transitions passed.');
    // Real SRV destination routing, with original hostname left in BOTH handshakes.
    attempt = new ConnectionAttempt({ host: 'mc.local.test', port: 25565 }, null, logger(), {
      dns: { resolveSrv: (_name, cb) => cb(null, [{ name: '127.0.0.1', port, priority: 0, weight: 1 }]) }
    });
    const start = handshakes.length;
    const routed = mcp.createClient({ host: 'mc.local.test', port: 25565, version: false, auth: 'offline', username: 'SrvTest', connect: attempt.connect, hideErrors: true, closeTimeout: 5000, noPongTimeout: 500 });
    routed.on('error', () => {});
    await until(() => handshakes.slice(start).some((p) => p.nextState === 2));
    assert(handshakes.slice(start).every((p) => p.serverHost === 'mc.local.test'));
    attempt.abort(); console.log('Local integration: SRV routes TCP without replacing the handshake hostname passed.');
    // Two real sockets against a black-hole status server: no late errors after cancel.
    blackhole = net.createServer((s) => { idleSockets.add(s); s.on('error', () => {}); s.on('data', () => {}); s.once('close', () => idleSockets.delete(s)); });
    blackhole.listen(0, '127.0.0.1'); await once(blackhole, 'listening');
    const before = log.lines.length;
    await manager.connect(cfg(blackhole.address().port), { username: 'CancelTest', type: 'offline' });
    await until(() => idleSockets.size === 2);
    const pending = manager._transport; manager.disconnect(); const after = log.lines.length;
    await until(() => idleSockets.size === 0); await sleep(100);
    assert(pending.closed); assert.equal(manager.status, 'OFFLINE'); assert.equal(log.lines.length, after); assert(after > before);
    console.log('Local integration: both pending auto-version sockets cancelled without late session logs passed.');
    const closed = net.createServer(); closed.listen(0, '127.0.0.1'); await once(closed, 'listening');
    const refusedPort = closed.address().port; await new Promise((r) => closed.close(r));
    const begin = Date.now(); await manager.connect(cfg(refusedPort), { username: 'RefusedTest', type: 'offline' });
    await until(() => manager.status === 'OFFLINE'); assert(Date.now() - begin < 2000); assert.equal(manager.bot, null);
    assert(manager.lastError.includes('not a Minecraft version error'));
    console.log('Local integration: real ECONNREFUSED ends CONNECTING immediately passed.');
    const pingResult = await manager.probeServer('127.0.0.1', port); assert.equal(pingResult.ok, true);
    console.log('Local integration: real server probe passed.');
    // Exercise actual socks package, not just a mocked handshake promise.
    for (const type of ['socks4', 'socks5', 'http']) {
      const proxy = net.createServer((socket) => {
        proxySockets.add(socket); socket.on('error', () => {});
        socket.once('close', () => proxySockets.delete(socket));
        let pending = Buffer.alloc(0), stage = type === 'socks5' ? 'greeting' : 'request';
        const tunnel = (reply) => {
          socket.pause(); socket.removeListener('data', receive);
          const upstream = net.connect(port, '127.0.0.1'); proxySockets.add(upstream);
          upstream.on('error', () => socket.destroy()); upstream.once('close', () => proxySockets.delete(upstream));
          socket.once('close', () => upstream.destroy()); upstream.once('close', () => socket.destroy());
          upstream.once('connect', () => {
            socket.write(reply); if (pending.length) upstream.write(pending);
            socket.pipe(upstream); upstream.pipe(socket); socket.resume();
          });
        };
        const receive = (chunk) => {
          pending = Buffer.concat([pending, chunk]);
          if (type === 'socks5' && stage === 'greeting') {
            if (pending.length < 2 || pending.length < 2 + pending[1]) return;
            pending = pending.subarray(2 + pending[1]); socket.write(Buffer.from([5, 0])); stage = 'request';
          }
          if (stage !== 'request') return;
          if (type === 'http') {
            const end = pending.indexOf('\r\n\r\n'); if (end < 0) return;
            assert(pending.subarray(0, end).toString().includes(`CONNECT 127.0.0.1:${port} HTTP/1.1`));
            pending = pending.subarray(end + 4); stage = 'tunnel'; tunnel('HTTP/1.1 200 Connection established\r\n\r\n');
          } else if (type === 'socks4') {
            if (pending.length < 9) return; const end = pending.indexOf(0, 8); if (end < 0) return;
            assert.equal(pending.readUInt16BE(2), port); pending = pending.subarray(end + 1); stage = 'tunnel';
            tunnel(Buffer.from([0, 90, 0, 0, 127, 0, 0, 1]));
          } else {
            if (pending.length < 5) return;
            const size = pending[3] === 1 ? 10 : pending[3] === 3 ? 7 + pending[4] : 22;
            if (pending.length < size) return; assert.equal(pending.readUInt16BE(size - 2), port);
            pending = pending.subarray(size); stage = 'tunnel'; tunnel(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
          }
        };
        socket.on('data', receive);
      });
      proxies.push(proxy); proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
      attempt = new ConnectionAttempt({ host: '127.0.0.1', port }, { host: '127.0.0.1', port: proxy.address().port, type }, logger());
      const result = await mcp.ping({ host: '127.0.0.1', port, connect: attempt.connect, closeTimeout: 5000, noPongTimeout: 500 });
      assert.equal(result.version.protocol, require('minecraft-data')(testVersion).version.version);
      attempt.abort(); console.log(`Local integration: real ${type} proxy tunnel passed.`);
    }
    console.log('Local integration total: 8 scenarios.');
  } finally {
    if (manager) manager.disconnect();
    if (attempt) attempt.abort();
    if (server) { for (const c of Object.values(server.clients)) { c.end(); if (c.closeTimer) clearTimeout(c.closeTimer); c.socket.destroy(); } server.close(); }
    for (const s of idleSockets) s.destroy();
    for (const s of proxySockets) s.destroy();
    for (const p of proxies) p.close();
    if (blackhole) blackhole.close();
  }
}
main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
