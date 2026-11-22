'use strict';
// ---------------------------------------------------------------------------
// logger.js - Merkezi log sistemi (ring buffer + dosyaya export)
// ---------------------------------------------------------------------------
const fs = require('fs');
const { EventEmitter } = require('events');

const MAX = 1200; // bellek koruma: en fazla 1200 satir tutulur

class Logger extends EventEmitter {
  constructor() {
    super();
    this.buffer = [];
    this.seq = 0;      // her satira benzersiz numara: arayuz ayni satiri iki kez yazmasin
    this.lang = 'en';  // log satirlari da arayuz diline gore yazilir
  }

  setLang(l) { this.lang = (l === 'tr') ? 'tr' : 'en'; }
  // Iki dilli log satiri: L('Türkçe', 'English')
  L(tr, en) { return this.lang === 'tr' ? tr : en; }

  ts() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  // slot = hangi hesap oturumu (1..N). 0 = uygulama geneli.
  log(level, message, slot) {
    const entry = {
      id: ++this.seq,
      time: this.ts(),
      level: String(level).toUpperCase(),
      message: String(message),
      slot: Number(slot) || 0
    };
    this.buffer.push(entry);
    if (this.buffer.length > MAX) this.buffer.splice(0, this.buffer.length - MAX);
    this.emit('log', entry);
    return entry;
  }

  info(m, slot) { return this.log('INFO', m, slot); }
  warn(m, slot) { return this.log('WARNING', m, slot); }
  error(m, slot) { return this.log('ERROR', m, slot); }
  chat(m, slot) { return this.log('CHAT', m, slot); }
  connect(m, slot) { return this.log('CONNECT', m, slot); }
  disconnect(m, slot) { return this.log('DISCONNECT', m, slot); }
  reconnect(m, slot) { return this.log('RECONNECT', m, slot); }

  // Bir hesap oturumu icin kendi log kanali: her satira slot numarasi eklenir
  channel(slot) {
    const self = this;
    return {
      ts: () => self.ts(),
      L: (tr, en) => self.L(tr, en),
      log: (l, m) => self.log(l, m, slot),
      info: (m) => self.log('INFO', m, slot),
      warn: (m) => self.log('WARNING', m, slot),
      error: (m) => self.log('ERROR', m, slot),
      chat: (m) => self.log('CHAT', m, slot),
      connect: (m) => self.log('CONNECT', m, slot),
      disconnect: (m) => self.log('DISCONNECT', m, slot),
      reconnect: (m) => self.log('RECONNECT', m, slot)
    };
  }

  all() { return this.buffer; }

  // Bir oturum kapandiginda eski satirlardaki #numara etiketi kaldirilir
  dropSlot(slot) {
    const n = Number(slot) || 0;
    if (!n) return;
    for (let i = 0; i < this.buffer.length; i++) if (this.buffer[i].slot === n) this.buffer[i].slot = 0;
  }
  clear() { this.buffer = []; this.emit('clear'); }

  exportTo(filePath) {
    const text = this.buffer.map((e) => `[${e.time}] [${e.level}] ${e.message}`).join('\r\n');
    fs.writeFileSync(filePath, text, 'utf8');
    return filePath;
  }
}

module.exports = new Logger();
