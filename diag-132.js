'use strict';
// Read-only Minecraft status check: no account, login, or gameplay packets.
const mcp = require('minecraft-protocol');
const { ConnectionAttempt } = require('./src/main/bot/connection-transport');
const host = process.argv[2] || 'oyna.aesirmc.com';
const port = Number(process.argv[3]) || 25565;
const attempt = new ConnectionAttempt({ host, port }, null, { info: console.log }, { connectTimeoutMs: 7000 });
let finished = false;
function finish(err, res) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  attempt.abort();
  if (err) {
    console.error('STATUS FAILED:', JSON.stringify({ code: err.code || '', message: err.message, address: err.address || '', port: err.port || port }));
    if (err.code === 'ECONNREFUSED') console.error('TCP hedefi bağlantıyı reddetti; bu hata Minecraft sürümü değiştirilerek çözülmez. Aynı bilgisayarda resmi oyunla erişimi ve ağ/proxy durumunu karşılaştırın.');
    process.exitCode = 1;
  } else {
    console.log('STATUS OK:', JSON.stringify({ version: res.version, players: res.players, latency: res.latency }, null, 2));
  }
}
const deadline = setTimeout(() => finish(Object.assign(new Error('Status check timed out (8s)'), { code: 'ETIMEDOUT' })), 8000);
try { mcp.ping({ host, port, connect: attempt.connect, closeTimeout: 7000, noPongTimeout: 1000 }, finish); }
catch (err) { finish(err); }
