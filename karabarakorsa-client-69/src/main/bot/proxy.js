'use strict';
// Proxy bağlantısı: hedef host/port minecraft-protocol istemci nesnesinden değil,
// bağlantı ayarlarından alınır. Yeni minecraft-protocol sürümlerinde client.options
// her zaman mevcut olmadığı için önceki yaklaşım host hatasına neden oluyordu.
const net = require('net');
const dns = require('dns');

function resolveTarget(host, port) {
  return new Promise((resolve) => {
    const isIp = net.isIP(host) !== 0;
    if (isIp || Number(port) !== 25565) return resolve({ host, port: Number(port) });
    dns.resolveSrv('_minecraft._tcp.' + host, (err, records) => {
      if (err || !records || !records.length) return resolve({ host, port: Number(port) });
      resolve({ host: records[0].name.replace(/\.$/, ''), port: records[0].port });
    });
  });
}

function buildConnect(proxy, logger, target) {
  if (!proxy || !proxy.host) return null;
  const type = String(proxy.type || 'socks5').toLowerCase();
  const configuredTarget = { host: String(target && target.host || ''), port: Number(target && target.port) || 25565 };
  if (!configuredTarget.host) return null;

  if (type === 'socks5' || type === 'socks4') {
    const { SocksClient } = require('socks');
    return (client) => {
      resolveTarget(configuredTarget.host, configuredTarget.port).then((destination) => SocksClient.createConnection({
        proxy: {
          host: proxy.host,
          port: Number(proxy.port),
          type: type === 'socks4' ? 4 : 5,
          userId: proxy.username || undefined,
          password: proxy.password || undefined
        },
        command: 'connect',
        destination
      })).then((info) => {
        client.setSocket(info.socket);
        client.emit('connect');
        logger.info(`Proxy connected: ${type}://${proxy.host}:${proxy.port} -> ${configuredTarget.host}:${configuredTarget.port}`);
      }).catch((err) => {
        logger.error('Proxy error: ' + err.message);
        client.emit('error', err);
      });
    };
  }

  return (client) => {
    resolveTarget(configuredTarget.host, configuredTarget.port).then((destination) => {
      const socket = net.connect(Number(proxy.port), proxy.host, () => {
        const auth = proxy.username
          ? 'Proxy-Authorization: Basic ' + Buffer.from(`${proxy.username}:${proxy.password || ''}`).toString('base64') + '\r\n'
          : '';
        socket.write(
          `CONNECT ${destination.host}:${destination.port} HTTP/1.1\r\n` +
          `Host: ${destination.host}:${destination.port}\r\n${auth}\r\n`
        );
      });
      socket.once('data', (chunk) => {
        if (/^HTTP\/1\.[01] 200/.test(chunk.toString())) {
          client.setSocket(socket); client.emit('connect');
          logger.info(`Proxy connected: http://${proxy.host}:${proxy.port}`);
        } else {
          const err = new Error('HTTP proxy tunnel failed'); logger.error(err.message); client.emit('error', err);
        }
      });
      socket.on('error', (err) => { logger.error('Proxy error: ' + err.message); client.emit('error', err); });
    }).catch((err) => { logger.error('Proxy target error: ' + err.message); client.emit('error', err); });
  };
}
module.exports = { buildConnect, resolveTarget };
