'use strict';
// One cancellable scope owns BOTH the game socket and auto-version status socket.
// Keep the user's hostname in the handshake; SRV only changes the TCP destination.
const dns = require('dns');
const net = require('net');

function errorWithCode(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function resolveTarget(host, port, opts = {}) {
  host = String(host || '').trim();
  port = Number(port) || 25565;
  const signal = opts.signal;
  const fallback = { host, port, srv: false };
  if (signal && signal.aborted) return Promise.reject(errorWithCode('Connection cancelled', 'ABORT_ERR'));
  if (net.isIP(host) || port !== 25565 || host === 'localhost') return Promise.resolve(fallback);
  return new Promise((resolve, reject) => {
    let done = false;
    let timer;
    // Use a private resolver so cancelling this lookup cannot cancel other
    // accounts' DNS work. OS hostname lookup still happens in net.connect().
    const resolver = opts.dns || new dns.Resolver({
      timeout: Math.min(2000, opts.dnsTimeoutMs || 4000), tries: 1
    });
    const finish = (err, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', abort);
      if (typeof resolver.cancel === 'function') {
        try { resolver.cancel(); } catch (_) {}
      }
      err ? reject(err) : resolve(value);
    };
    const abort = () => finish(errorWithCode('Connection cancelled', 'ABORT_ERR'));
    if (signal) signal.addEventListener('abort', abort, { once: true });
    const srvFallback = (err) => finish(null, {
      ...fallback, srvFallback: { code: String(err && err.code || 'SRV_LOOKUP_FAILED'),
        message: String(err && err.message || 'SRV lookup failed') }
    });
    // SRV is optional, not the hostname A/AAAA lookup. Some Windows/router DNS
    // resolvers never answer SRV even when normal Minecraft works. Do not end
    // the whole login at this point: visibly try the configured host/port.
    timer = setTimeout(() => srvFallback(errorWithCode('SRV lookup did not respond within 4s', 'SRV_TIMEOUT')),
      opts.dnsTimeoutMs || 4000);
    try {
      resolver.resolveSrv('_minecraft._tcp.' + host, (err, records) => {
        if (done) return;
        if (err) {
          if (['ENODATA', 'ENOTFOUND', 'ENONAME'].includes(err.code)) return finish(null, fallback);
          return srvFallback(err);
        }
        const usable = (records || []).filter((r) => r.name && Number(r.port) > 0 && r.name !== '.');
        if (!usable.length) {
          if (records && records.some((r) => r.name === '.')) {
            return finish(errorWithCode('Minecraft service is unavailable (SRV target ".")', 'ECONNREFUSED'));
          }
          return finish(null, fallback);
        }
        const priority = Math.min(...usable.map((r) => Number(r.priority) || 0));
        const group = usable.filter((r) => (Number(r.priority) || 0) === priority);
        const total = group.reduce((n, r) => n + (Number(r.weight) || 0), 0);
        let chosen = group[Math.floor((opts.random || Math.random)() * group.length)];
        if (total > 0) {
          let weight = (opts.random || Math.random)() * total;
          for (const r of group) {
            weight -= Number(r.weight) || 0;
            if (weight < 0) { chosen = r; break; }
          }
        }
        finish(null, { host: chosen.name.replace(/\.$/, ''), port: Number(chosen.port), srv: true });
      });
    } catch (err) { finish(err); }
  });
}

class ConnectionAttempt {
  constructor(target, proxy, logger, opts = {}) {
    this.target = target;
    this.proxy = proxy;
    this.logger = logger;
    this.opts = opts;
    this.closed = false;
    this.clients = new Set();
    this.controller = new AbortController();
    this.destinationPromise = null;
    this.connect = this.connect.bind(this);
  }

  destination() {
    if (!this.destinationPromise) {
      this.destinationPromise = resolveTarget(this.target.host, this.target.port, {
        ...this.opts, signal: this.controller.signal
      }).then((destination) => {
        if (!this.closed && this.logger) {
          if (destination.srvFallback) {
            const code = destination.srvFallback.code;
            const tr = `SRV sorgusu yanıtlanamadı (${code}); bağlantı iptal edilmiyor. Girilen adres ${this.target.host}:${this.target.port}, sistemin normal DNS çözümlemesiyle denenecek. Sunucunun özel SRV portu varsa doğru portu ayrıca doğrulayın.`;
            const en = `SRV lookup unavailable (${code}); continuing with configured ${this.target.host}:${this.target.port} via normal system hostname lookup. If the server requires a custom SRV port, verify that port separately.`;
            const message = typeof this.logger.L === 'function' ? this.logger.L(tr, en) : en;
            if (typeof this.logger.warn === 'function') this.logger.warn(message);
            else this.logger.info(message);
          }
          this.logger.info(
            `Network target: ${this.target.host}:${this.target.port} -> ${destination.host}:${destination.port}` +
            (destination.srv ? ' (SRV)' : destination.srvFallback ? ' (SRV fallback / OS DNS)' : ' (direct DNS)'));
        }
        return destination;
      });
    }
    return this.destinationPromise;
  }

  connect(client) {
    if (this.closed) return;
    const rec = { client, socket: null, attached: false, done: false, timer: null };
    this.clients.add(rec);
    const live = () => !this.closed && !rec.done;
    const finish = () => {
      if (rec.done) return;
      rec.done = true;
      clearTimeout(rec.timer);
      this.clients.delete(rec);
    };
    client.once('end', finish);
    const fail = (err) => {
      if (!live()) return;
      finish();
      if (rec.socket) rec.socket.destroy();
      client.emit('error', err);
      // Pre-socket failures otherwise never produce minecraft-protocol "end".
      if (!rec.attached) client.emit('end', 'connectionFailed');
    };
    rec.timer = setTimeout(() => {
      const err = errorWithCode('TCP/proxy setup timed out before connection was established', 'ETIMEDOUT');
      err.kbStage = 'tcp/proxy-setup';
      err.hostname = this.target.host;
      err.port = this.target.port;
      fail(err);
    },
      this.opts.connectTimeoutMs || 15000);
    const attach = (socket, alreadyConnected) => {
      if (!live()) { socket.destroy(); return; }
      rec.socket = socket;
      rec.attached = true;
      client.setSocket(socket);
      if (socket.setKeepAlive) socket.setKeepAlive(true, 30000);
      const connected = () => {
        if (!live()) return;
        clearTimeout(rec.timer);
        if (this.opts.onConnect) this.opts.onConnect(client);
      };
      if (alreadyConnected) { connected(); client.emit('connect'); }
      else socket.once('connect', connected);
    };
    this.destination().then(async (destination) => {
      if (!live()) return;
      const network = this.opts.net || net;
      const proxy = this.proxy;
      if (!proxy || !proxy.host) {
        attach(network.connect({ host: destination.host, port: destination.port }), false);
        return;
      }
      const type = String(proxy.type || 'socks5').toLowerCase();
      // Track the proxy TCP socket BEFORE its asynchronous tunnel handshake.
      const socket = network.connect({ host: proxy.host, port: Number(proxy.port) });
      rec.socket = socket;
      const onError = (err) => fail(err);
      socket.on('error', onError);
      const onClose = () => { if (!rec.attached && live()) fail(errorWithCode('Proxy closed before tunnel was ready', 'ECONNRESET')); };
      socket.once('close', onClose);
      socket.once('connect', () => {
        if (!live()) { socket.destroy(); return; }
        if (type === 'socks5' || type === 'socks4') {
          const { SocksClient } = this.opts.socks || require('socks');
          SocksClient.createConnection({
            proxy: { host: proxy.host, port: Number(proxy.port), type: type === 'socks4' ? 4 : 5,
              userId: proxy.username || undefined, password: proxy.password || undefined },
            command: 'connect', destination: { host: destination.host, port: destination.port },
            existing_socket: socket, timeout: this.opts.connectTimeoutMs || 15000
          }).then((info) => {
            socket.removeListener('error', onError);
            socket.removeListener('close', onClose);
            attach(info.socket, true);
          }).catch(fail);
          return;
        }
        let header = Buffer.alloc(0);
        const onData = (chunk) => {
          if (!live()) return;
          header = Buffer.concat([header, chunk]);
          const boundary = header.indexOf('\r\n\r\n');
          if (boundary < 0) {
            if (header.length > 16384) fail(errorWithCode('HTTP proxy response header too large', 'EPROTO'));
            return;
          }
          socket.removeListener('data', onData);
          if (!/^HTTP\/1\.[01] 200(?:\s|$)/.test(header.subarray(0, boundary).toString())) {
            fail(errorWithCode('HTTP proxy tunnel refused', 'ECONNREFUSED'));
            return;
          }
          socket.pause();
          const extra = header.subarray(boundary + 4);
          if (extra.length) socket.unshift(extra);
          socket.removeListener('error', onError);
          socket.removeListener('close', onClose);
          attach(socket, true);
          socket.resume();
        };
        socket.on('data', onData);
        const auth = proxy.username ? 'Proxy-Authorization: Basic ' +
          Buffer.from(`${proxy.username}:${proxy.password || ''}`).toString('base64') + '\r\n' : '';
        socket.write(`CONNECT ${destination.host}:${destination.port} HTTP/1.1\r\n` +
          `Host: ${destination.host}:${destination.port}\r\n${auth}\r\n`);
      });
    }).catch(fail);
  }

  abort(reason = 'connectionCancelled') {
    if (this.closed) return;
    this.closed = true;
    this.controller.abort();
    const records = [...this.clients];
    this.clients.clear();
    for (const rec of records) {
      rec.done = true;
      clearTimeout(rec.timer);
      try { rec.client.end(reason); } catch (_) {}
      if (rec.client.closeTimer) clearTimeout(rec.client.closeTimer);
      if (rec.socket) rec.socket.destroy();
      // Cancel auto-version's pending status promise even before setSocket().
      if (!rec.attached) rec.client.emit('end', reason);
    }
  }
}

module.exports = { ConnectionAttempt, resolveTarget };