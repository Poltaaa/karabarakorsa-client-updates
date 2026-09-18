'use strict';
// ---------------------------------------------------------------------------
// proxy.js - SOCKS4 / SOCKS5 / HTTP proxy uzerinden TCP baglanti saglayici
// mineflayer'in "connect" secenegine verilir.
// ---------------------------------------------------------------------------
const net = require('net');
const dns = require('dns');

// SRV kaydi cozumleme: play.sunucu.com -> gercek host:port
// (ozel connect fonksiyonu kullanildiginda minecraft-protocol bunu yapmaz)
function resolveTarget(host, port) {
  return new Promise((resolve) => {
    const isIp = net.isIP(host) !== 0;
    if (isIp || Number(port) !== 25565) return resolve({ host, port });
    dns.resolveSrv('_minecraft._tcp.' + host, (err, records) => {
      if (err || !records || !records.length) return resolve({ host, port });
      resolve({ host: records[0].name, port: records[0].port });
    });
  });
}

function buildConnect(proxy, logger) {
  if (!proxy || !proxy.host) return null;
  const type = String(proxy.type || 'socks5').toLowerCase();

  if (type === 'socks5' || type === 'socks4') {
    const { SocksClient } = require('socks');
    return (client) => {
      SocksClient.createConnection({
        proxy: {
          host: proxy.host,
          port: Number(proxy.port),
          type: type === 'socks4' ? 4 : 5,
          userId: proxy.username || undefined,
          password: proxy.password || undefined
        },
        command: 'connect',
        destination: { host: client.options.host, port: client.options.port }
      })
        .then((info) => {
          client.setSocket(info.socket);
          client.emit('connect');
          logger.info(`Proxy connected: ${type}://${proxy.host}:${proxy.port}`);
        })
        .catch((err) => {
          logger.error('Proxy error: ' + err.message);
          client.emit('error', err);
        });
    };
  }

  // HTTP CONNECT tunel
  return (client) => {
    const socket = net.connect(Number(proxy.port), proxy.host, () => {
      const auth = proxy.username
        ? 'Proxy-Authorization: Basic ' +
          Buffer.from(`${proxy.username}:${proxy.password || ''}`).toString('base64') + '\r\n'
        : '';
      socket.write(
        `CONNECT ${client.options.host}:${client.options.port} HTTP/1.1\r\n` +
        `Host: ${client.options.host}:${client.options.port}\r\n${auth}\r\n`
      );
    });
    socket.once('data', (chunk) => {
      if (/^HTTP\/1\.[01] 200/.test(chunk.toString())) {
        client.setSocket(socket);
        client.emit('connect');
        logger.info(`Proxy connected: http://${proxy.host}:${proxy.port}`);
      } else {
        const err = new Error('HTTP proxy tunnel failed');
        logger.error(err.message);
        client.emit('error', err);
      }
    });
    socket.on('error', (err) => {
      logger.error('Proxy error: ' + err.message);
      client.emit('error', err);
    });
  };
}

module.exports = { buildConnect, resolveTarget };
