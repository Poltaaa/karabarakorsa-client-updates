'use strict';
// ---------------------------------------------------------------------------
// auto-spam.js - Sirali veya rastgele mesaj gonderme motoru
// ---------------------------------------------------------------------------
class AutoSpam {
  constructor(logger, onState) {
    this.logger = logger;
    this.onState = onState || (() => {});
    this.bot = null;
    this.cfg = null;
    this.timer = null;
    this.index = 0;
    this.running = false;
  }

  start(bot, cfg) {
    this.stop(true);
    const list = (cfg.messages || []).filter((m) => String(m).trim().length > 0);
    if (!bot || !list.length) {
      this.logger.warn(this.logger.L('Otomatik mesaj başlatılamadı: bot yok veya mesaj listesi boş', 'Auto spam could not start: no bot or the message list is empty'));
      return false;
    }
    this.bot = bot;
    this.cfg = { ...cfg, messages: list };
    this.index = 0;
    this.running = true;
    this.logger.info('Auto Spam started');
    this.onState(true);
    this.schedule();
    return true;
  }

  // Calisirken mesaj listesi / aralik degisirse hemen gecerli olur
  apply(cfg) {
    if (!this.running) return false;
    const list = (cfg.messages || []).filter((m) => String(m).trim().length > 0);
    if (!list.length) { this.stop(); return false; }
    this.cfg = { ...cfg, messages: list };
    if (this.index >= list.length) this.index = 0;
    if (this.timer) clearTimeout(this.timer);
    this.schedule();
    return true;
  }

  stop(silent) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const wasRunning = this.running;
    this.running = false;
    if (wasRunning && !silent) {
      this.logger.info('Auto Spam stopped');
    }
    this.onState(false);
  }

  nextDelay() {
    if (this.cfg.mode === 'range') {
      const min = Math.max(1, Number(this.cfg.minDelay) || 10);
      const max = Math.max(min, Number(this.cfg.maxDelay) || 20);
      return (min + Math.random() * (max - min)) * 1000;
    }
    return Math.max(1, Number(this.cfg.interval) || 5) * 1000;
  }

  schedule() {
    if (!this.running) return;
    this.timer = setTimeout(() => this.tick(), this.nextDelay());
  }

  tick() {
    if (!this.running || !this.bot) return;
    const list = this.cfg.messages;
    let msg;
    if (this.cfg.random) {
      msg = list[Math.floor(Math.random() * list.length)];
    } else {
      msg = list[this.index % list.length];
      this.index++;
    }
    try {
      this.bot.chat(msg);
      this.logger.chat(`[SPAM] ${msg}`);
    } catch (e) {
      this.logger.error('Auto Spam send error: ' + e.message);
    }
    this.schedule();
  }
}

module.exports = AutoSpam;
