'use strict';
// ---------------------------------------------------------------------------
// anti-afk.js - Rastgele hareket / zipla / donme ile AFK kick engelleme
// ---------------------------------------------------------------------------
const DIRECTIONS = ['forward', 'back', 'left', 'right'];

class AntiAfk {
  constructor(logger) {
    this.logger = logger;
    this.bot = null;
    this.cfg = null;
    this.timer = null;
    this.running = false;
  }

  start(bot, cfg) {
    this.stop();
    this.bot = bot;
    this.cfg = cfg;
    this.running = true;
    this.logger.info('Anti AFK enabled');
    this.schedule();
  }

  // Motor calisirken secenekler degisirse ac/kapa gerekmeden hemen uygulanir
  apply(cfg) {
    if (cfg) this.cfg = cfg;
    if (!this.running) return false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.clearControls();
    this.logger.info(this.logger.L('Anti AFK ayarları güncellendi (yeniden başlatmaya gerek yok)', 'Anti AFK options updated live (no restart needed)'));
    this.schedule();
    return true;
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.clearControls();
  }

  clearControls() {
    if (!this.bot || !this.bot.entity) return;
    try {
      for (const d of DIRECTIONS) this.bot.setControlState(d, false);
      this.bot.setControlState('jump', false);
      this.bot.setControlState('sneak', false);
    } catch (_) {}
  }

  schedule() {
    if (!this.running) return;
    const min = Math.max(1, Number(this.cfg.minInterval) || 30);
    const max = Math.max(min, Number(this.cfg.maxInterval) || 60);
    const wait = (min + Math.random() * (max - min)) * 1000;
    this.timer = setTimeout(() => this.tick(), wait);
  }

  async tick() {
    if (!this.running || !this.bot || !this.bot.entity) return this.schedule();
    const actions = [];
    if (this.cfg.walk || this.cfg.randomMovement) actions.push('walk');
    if (this.cfg.jump) actions.push('jump');
    if (this.cfg.sneak) actions.push('sneak');
    if (this.cfg.rotate || this.cfg.lookAround) actions.push('look');
    if (!actions.length) return this.schedule();

    const action = actions[Math.floor(Math.random() * actions.length)];
    try {
      if (action === 'walk') {
        const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
        this.bot.setControlState(dir, true);
        setTimeout(() => { try { this.bot.setControlState(dir, false); } catch (_) {} }, 400 + Math.random() * 900);
        this.logger.info(`Anti AFK: move ${dir}`);
      } else if (action === 'jump') {
        this.bot.setControlState('jump', true);
        setTimeout(() => { try { this.bot.setControlState('jump', false); } catch (_) {} }, 250);
        this.logger.info('Anti AFK: jump');
      } else if (action === 'sneak') {
        this.bot.setControlState('sneak', true);
        setTimeout(() => { try { this.bot.setControlState('sneak', false); } catch (_) {} }, 600);
        this.logger.info('Anti AFK: sneak');
      } else if (action === 'look') {
        const yaw = (Math.random() * 2 - 1) * Math.PI;
        const pitch = (Math.random() - 0.5) * 0.8;
        await this.bot.look(yaw, pitch, true);
        this.logger.info('Anti AFK: look around');
      }
    } catch (e) {
      this.logger.warn('Anti AFK error: ' + e.message);
    }
    this.schedule();
  }
}

module.exports = AntiAfk;
