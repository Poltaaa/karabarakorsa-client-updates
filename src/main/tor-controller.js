'use strict';
const { spawn } = require('child_process');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const os = require('os');
const path = require('path');

class TorController {
  constructor(logger) {
    this.logger = logger; this.proc = null; this.port = 9050; this.controlPort = 9051;
    this.dataDir = null; this.country = ''; this.strictNodes = false; this.lastIp = ''; this.stopping = null; this.lastProcessError = '';
  }
  isRunning() { return !!this.proc && !this.proc.killed; }
  status() { return { running: this.isRunning(), socksHost: '127.0.0.1', socksPort: this.port, country: this.country || 'any', ip: this.lastIp || '' }; }
  bundleRoot() {
    const candidates = [path.join(process.resourcesPath || '', 'tor'), path.join(__dirname, '..', '..', 'resources', 'tor'), path.join(process.cwd(), 'resources', 'tor')];
    return candidates.find((p) => p && fs.existsSync(path.join(p, 'tor.exe'))) || '';
  }
  findBinary() {
    const bundled = this.bundleRoot();
    const pf = process.env.ProgramFiles || '';
    const pfx86 = process.env['ProgramFiles(x86)'] || '';
    const local = process.env.LOCALAPPDATA || '';
    const candidates = process.platform === 'win32'
      ? [bundled ? path.join(bundled, 'tor.exe') : '', process.env.TOR_EXE, path.join(pf, 'Tor Browser', 'Browser', 'TorBrowser', 'Tor', 'tor.exe'), path.join(pfx86, 'Tor Browser', 'Browser', 'TorBrowser', 'Tor', 'tor.exe'), path.join(local, 'Tor Browser', 'Browser', 'TorBrowser', 'Tor', 'tor.exe'), 'tor.exe']
      : [bundled ? path.join(bundled, 'tor') : '', process.env.TOR_EXE, '/usr/bin/tor', '/usr/local/bin/tor', 'tor'];
    return candidates.find((p) => p && (p.includes(path.sep) ? fs.existsSync(p) : true)) || null;
  }
  async start(opts = {}) {
    if (this.stopping) { try { await this.stopping; } catch (_) {} this.stopping = null; }
    if (this.isRunning()) return this.status();
    const bin = this.findBinary();
    if (!bin) throw new Error('VPN motoru bulunamadı. İstemci paketini yeniden çıkarın veya Tor Browser kurun.');
    const base = await this.pickPorts(); this.port = base; this.controlPort = base + 1;
    this.dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'karabarakorsa-tor-'));
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.lastProcessError = '';
    const args = ['--SocksPort', '127.0.0.1:' + this.port, '--ControlPort', '127.0.0.1:' + this.controlPort, '--CookieAuthentication', '0', '--DataDirectory', this.dataDir, '--Log', 'notice stdout'];
    const bundle = this.bundleRoot();
    if (bundle) {
      const geoip = path.join(bundle, 'data', 'geoip'); const geoip6 = path.join(bundle, 'data', 'geoip6');
      if (fs.existsSync(geoip)) args.push('--GeoIPFile', geoip);
      if (fs.existsSync(geoip6)) args.push('--GeoIPv6File', geoip6);
    }
    const proc = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = proc;
    proc.stdout.on('data', (b) => { const text = String(b).trim(); if (text) { this.lastProcessError = /error|fatal|fail|unable|could not|cannot/i.test(text) ? text : this.lastProcessError; this.logger.info('[VPN] ' + text); } });
    proc.stderr.on('data', (b) => { const text = String(b).trim(); if (text) { if (/error|fatal|fail|unable|could not|cannot/i.test(text)) this.lastProcessError = text.split('\n').filter(Boolean).slice(-1)[0]; this.logger.warn('[VPN] ' + text); } });
    proc.on('exit', (code, signal) => { if (this.proc === proc) this.proc = null; if (code && !this.lastProcessError) this.lastProcessError = `VPN motoru kapandı (kod ${code}${signal ? ', ' + signal : ''}).`; });
    try {
      await this.waitForControl();
      if (opts.countries && opts.countries.length) await this.setCountry(opts.countries, opts.strictNodes);
      else if (opts.strictNodes) await this.setCountry([], opts.strictNodes);
      this.lastIp = await this.publicIp().catch(() => '');
      return this.status();
    } catch (e) {
      this.stop();
      if (e && e.code === 'ENOENT') throw new Error('VPN motoru bulunamadı. İstemci paketini yeniden çıkarın veya Tor Browser kurun.');
      if (this.lastProcessError) throw new Error('VPN motoru başlatılamadı: ' + this.lastProcessError);
      throw e;
    }
  }
  stop() {
    const p = this.proc; this.proc = null;
    if (p) {
      this.stopping = new Promise((resolve) => { const done = () => resolve(); p.once('exit', done); setTimeout(done, 2500); });
      try { p.kill(); } catch (_) {}
    }
    return this.status();
  }
  async pickPorts() {
    for (const base of [9050, 9060, 9070, 9080, 9090]) {
      const free = (port) => new Promise((resolve) => { const s = net.createServer(); s.once('error', () => { try { s.close(); } catch (_) {} resolve(false); }); s.listen(port, '127.0.0.1', () => s.close(() => resolve(true))); });
      if (await free(base) && await free(base + 1)) return base;
    }
    throw new Error('VPN için uygun yerel port bulunamadı.');
  }
  async waitForControl(timeoutMs = 12000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (!this.proc) break;
      try { await this.command('GETINFO version'); return true; } catch (_) {}
      await new Promise((r) => setTimeout(r, 250));
    }
    if (this.lastProcessError) throw new Error('VPN motoru başlatılamadı: ' + this.lastProcessError);
    throw new Error('VPN motoru başlatılamadı. Başka bir VPN/Tor süreci 9050 veya 9051 portunu kullanıyor olabilir.');
  }
  authLine() { return 'AUTHENTICATE \"\"\r\n'; }
  command(cmd) {
    return new Promise((resolve, reject) => {
      const s = net.createConnection(this.controlPort, '127.0.0.1'); let out = ''; s.setTimeout(4000);
      s.on('connect', () => s.write(this.authLine() + cmd + '\r\nQUIT\r\n'));
      s.on('data', (b) => { out += b; });
      s.on('end', () => /250 OK/.test(out) ? resolve(out) : reject(new Error(out.trim() || 'VPN kontrol hatası')));
      s.on('error', reject); s.on('timeout', () => { s.destroy(); reject(new Error('VPN kontrol zaman aşımı')); });
    });
  }
  async waitForCircuit(timeoutMs = 12000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      try { const r = await this.command('GETINFO status/circuit-established'); if (/circuit-established=1/.test(r)) return true; } catch (_) {}
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }
  publicIp() {
    return new Promise((resolve, reject) => {
      let raw = ''; let done = false;
      const finish = (err, value) => { if (done) return; done = true; try { secure.destroy(); } catch (_) {} err ? reject(err) : resolve(value); };
      let secure;
      try {
        const { SocksClient } = require('socks');
        SocksClient.createConnection({ proxy: { host: '127.0.0.1', port: this.port, type: 5 }, command: 'connect', destination: { host: 'api.ipify.org', port: 443 } }).then(({ socket }) => {
          secure = tls.connect({ socket, servername: 'api.ipify.org' }, () => secure.write('GET / HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n'));
          secure.setTimeout(8000); secure.on('data', (b) => { raw += b.toString(); });
          secure.on('end', () => { const ip = raw.split(/\r?\n\r?\n/).pop().trim(); /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) ? finish(null, ip) : finish(new Error('IP okunamadı')); });
          secure.on('error', (e) => finish(e)); secure.on('timeout', () => finish(new Error('IP sorgusu zaman aşımı')));
        }).catch((e) => finish(e));
      } catch (e) { finish(e); }
    });
  }
  async newIdentity() {
    if (!this.isRunning()) throw new Error("Önce VPN'i başlatın.");
    const before = this.lastIp || await this.publicIp().catch(() => '');
    await this.command('SIGNAL NEWNYM');
    if (!(await this.waitForCircuit())) throw new Error('VPN yeni bağlantı devresi oluşturamadı.');
    const until = Date.now() + 15000; let after = '';
    while (Date.now() < until) {
      after = await this.publicIp().catch(() => '');
      if (!before || !after || after !== before) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (this.country && !after) throw new Error("Seçilen ülkelerde uygun VPN çıkış IP'si bulunamadı.");
    if (before && after && before === after) throw new Error('VPN yeni IP alamadı; seçilen ülkelerde şu anda uygun çıkış IP’si bulunmuyor olabilir.');
    this.lastIp = after || before; return this.status();
  }
  async setCountry(countries, strictNodes) {
    const list = Array.isArray(countries) ? countries : String(countries || '').split(',');
    const cc = list.map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
    this.country = cc.join(','); this.strictNodes = !!strictNodes;
    if (this.isRunning()) {
      const exits = cc.length ? cc.map((x) => `{${x}}`).join(',') : '';
      await this.command(exits ? `SETCONF ExitNodes=${exits} StrictNodes=${this.strictNodes ? 1 : 0}` : 'RESETCONF ExitNodes StrictNodes');
      await this.command('SIGNAL NEWNYM');
      if (exits && !(await this.waitForCircuit())) throw new Error("Seçilen ülkelerde uygun VPN çıkış IP'si bulunamadı.");
      this.lastIp = await this.publicIp().catch(() => this.lastIp);
    }
    return this.status();
  }
  proxy() { return { type: 'socks5', host: '127.0.0.1', port: this.port, username: '', password: '' }; }
}
module.exports = TorController;
