'use strict';
// ---------------------------------------------------------------------------
// respack.js - Sunucu kaynak paketi (resource pack) yanitlarini yonetir.
//
// Bazi sunucular yapilandirma (configuration) asamasinda once kaynak paketini
// gonderir ve DOGRU cevabi almadan oyuna almaz. Kutuphanenin verdigi cevap
// eksik/yanlis olursa sunucu takilir ve sonunda baglantiyi
// "An internal error occurred in your connection." diyerek keser.
//
// Bu modul kutuphanenin cevabini tamamen devralir ve vanilla istemcinin
// yaptigi sirayi taklit eder:  ACCEPTED -> (indirme) -> DOWNLOADED -> LOADED
//
// Modlar:
//   'auto'    : kabul et (vanilla gibi, paketi gercekten indirmeyi de dener)
//   'decline' : reddet
//   'ignore'  : hic cevap verme
//   ('smart' modunu bot-manager yonetir; sirayla auto/decline/ignore dener)
// ---------------------------------------------------------------------------
const https = require('https');
const http = require('http');

const RESULT = { LOADED: 0, DECLINED: 1, FAILED: 2, ACCEPTED: 3, DOWNLOADED: 4 };

class ResourcePack {
  constructor(logger) {
    this.logger = logger;
    this.mode = 'auto';
    this.requested = false;     // sunucu paket istedi mi (teshis icin)
    this.timers = [];
    this.client = null;
    this.selfSending = false;
  }

  attach(bot, mode) {
    this.mode = mode || 'auto';
    this.requested = false;
    this.clearTimers();
    const client = bot._client;
    if (!client) return;
    this.client = client;

    client.on('packet', (data, meta) => {
      const name = meta && meta.name ? String(meta.name) : '';
      if (!/^(resource_pack_send|resource_pack_push|add_resource_pack)$/.test(name)) return;
      this.onRequest(data, name);
    });

    // Kutuphanenin kendi cevaplari yutulur; cevabi biz veriyoruz.
    if (client.__respackPatched) return;
    const orig = client.write.bind(client);
    const self = this;
    client.write = function (name, params) {
      if (String(name) === 'resource_pack_receive' && !self.selfSending) return;
      return orig(name, params);
    };
    client.__respackPatched = true;
  }

  onRequest(data, packetName) {
    this.requested = true;
    const usesUuid = packetName !== 'resource_pack_send';
    const uuid = data && (data.uuid !== undefined ? data.uuid : (data.id !== undefined ? data.id : null));
    const hash = data && data.hash;
    this.requestUsesUuid = usesUuid;
    const url = (data && data.url) || '';
    const forced = !!(data && (data.forced || data.required));
    this.logger.info(this.logger.L(`Sunucu kaynak paketi istedi${forced ? ' (zorunlu)' : ''}: ${url || '(adres yok)'}`, `The server requested a resource pack${forced ? ' (required)' : ''}: ${url || '(no url)'}`));

    if (this.mode === 'ignore') {
      this.logger.warn(this.logger.L('Kaynak paketi cevabı gönderilmiyor (ayar: hiç cevap verme)', 'Not answering the resource pack request (setting: never reply)'));
      return;
    }
    if (this.mode === 'decline') {
      this.send(uuid, hash, RESULT.DECLINED);
      this.logger.info(this.logger.L('Kaynak paketi reddedildi', 'Resource pack declined'));
      if (forced) this.logger.warn(this.logger.L('Sunucu paketi ZORUNLU tutuyor. Atılırsanız BAĞLANTI > Kaynak paketi = "Otomatik kabul et" seçin.', 'The server REQUIRES the pack. If you get kicked, set CONNECT > Resource pack = "Accept automatically".'));
      return;
    }

    // auto: vanilla istemci sirasi
    this.send(uuid, hash, RESULT.ACCEPTED);
    this.logger.info(this.logger.L('Kaynak paketi kabul edildi, indiriliyor...', 'Resource pack accepted, downloading...'));
    const started = Date.now();
    this.download(url, (ok, bytes) => {
      const wait = Math.max(0, 900 - (Date.now() - started));
      this.timers.push(setTimeout(() => {
        this.send(uuid, hash, RESULT.DOWNLOADED);
        this.logger.info(ok
          ? this.logger.L(`Kaynak paketi indirildi (${Math.round(bytes / 1024)} KB)`, `Resource pack downloaded (${Math.round(bytes / 1024)} KB)`)
          : this.logger.L('Kaynak paketi indirilemedi, yine de yüklendi olarak bildiriliyor', 'Could not download the resource pack, reporting it as loaded anyway'));
        this.timers.push(setTimeout(() => {
          this.send(uuid, hash, RESULT.LOADED);
          this.logger.info(this.logger.L('Kaynak paketi yüklendi olarak bildirildi', 'Resource pack reported as loaded'));
        }, 700));
      }, wait));
    });
  }

  // Paketi gercekten indirir (bazi sunucular indirmeyi sunucu tarafinda gorur)
  download(url, cb) {
    if (!url || !/^https?:\/\//i.test(url)) return cb(false, 0);
    let done = false;
    const finish = (ok, bytes) => { if (!done) { done = true; cb(ok, bytes); } };
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { timeout: 12000, headers: { 'User-Agent': 'Minecraft Java/1.21' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return this.download(res.headers.location, cb);
        }
        if (res.statusCode !== 200) { res.resume(); return finish(false, 0); }
        let bytes = 0;
        res.on('data', (c) => {
          bytes += c.length;
          if (bytes > 80 * 1024 * 1024) { req.destroy(); finish(true, bytes); }   // 80 MB siniri
        });
        res.on('end', () => finish(true, bytes));
        res.on('error', () => finish(false, bytes));
      });
      req.on('timeout', () => { req.destroy(); finish(false, 0); });
      req.on('error', () => finish(false, 0));
    } catch (_) { finish(false, 0); }
  }

  send(uuid, hash, result) {
    const params = { result };
    if (this.requestUsesUuid) {
      if (uuid === null || uuid === undefined || uuid === '') {
        this.logger.warn(this.logger.L('Kaynak paketi cevabi gonderilmedi: UUID eksik.', 'Resource pack reply skipped: missing UUID.'));
        return false;
      }
      params.uuid = uuid;
    } else {
      params.hash = String(hash === null || hash === undefined ? '' : hash);
    }
    try {
      this.selfSending = true;
      this.client.write('resource_pack_receive', params);
      return true;
    } catch (e) {
      this.logger.warn(this.logger.L('Kaynak paketi cevabı gönderilemedi: ', 'Could not send the resource pack reply: ') + e.message);
      return false;
    } finally {
      this.selfSending = false;
    }
  }

  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
}

module.exports = ResourcePack;
