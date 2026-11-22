'use strict';
// ---------------------------------------------------------------------------
// join-messages.js - Sunucuya girince sirayla calisan komut zinciri
//
// Araya "sanal adim" eklenebilir: Auto Farm makrosu da bu zincirin bir
// adimi gibi calisabilir. Boylece sunucu restart atip bot yeniden girdiginde
// once /login, sonra /is go ... ve sirasi gelince makro baslar.
// ---------------------------------------------------------------------------
const MASK = /(\/(?:login|l|register|reg)\s+)\S+/i;

class JoinMessages {
  constructor(logger) {
    this.logger = logger;
    this.timers = [];
    this.cancelled = false;
    this.plan = [];
  }

  cancel() {
    this.cancelled = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  // Zinciri kurar. extra = { at, delay, label, run }  (at: 1..n+1, 0 = en son)
  plannedList(commands, extra) {
    const list = (commands || [])
      .filter((c) => c && c.enabled && String(c.command || '').trim())
      .slice(0, 10)
      .map((c) => ({
        kind: 'chat',
        command: String(c.command).trim(),
        delay: Math.max(0, Number(c.delay) || 0)
      }));
    if (extra && typeof extra.run === 'function') {
      let at = Number(extra.at);
      if (!Number.isFinite(at) || at <= 0 || at > list.length + 1) at = list.length + 1;
      list.splice(at - 1, 0, {
        kind: 'run',
        label: extra.label || 'macro',
        run: extra.run,
        delay: Math.max(0, Number(extra.delay) || 0)
      });
    }
    return list;
  }

  run(bot, commands, opts) {
    this.cancel();
    this.cancelled = false;
    const o = opts || {};
    const list = this.plannedList(commands, o.extra);
    this.plan = list.map((s, i) => ({
      no: i + 1,
      delay: s.delay,
      text: s.kind === 'run' ? s.label : String(s.command).replace(MASK, '$1********')
    }));
    if (!list.length) return { count: 0, total: 0 };

    let acc = 0;
    list.forEach((s, i) => {
      acc += s.delay * 1000;
      const t = setTimeout(() => {
        if (this.cancelled || !bot) return;
        try {
          if (s.kind === 'run') {
            this.logger.info(this.logger.L(
              `Giriş sırası ${i + 1}/${list.length}: ${s.label}`,
              `Join step ${i + 1}/${list.length}: ${s.label}`));
            s.run();
          } else {
            bot.chat(s.command);
            this.logger.info(this.logger.L(
              `Giriş komutu ${i + 1}/${list.length}: ${s.command.replace(MASK, '$1********')}`,
              `Join command ${i + 1}/${list.length}: ${s.command.replace(MASK, '$1********')}`));
          }
        } catch (e) {
          this.logger.error('Join step error: ' + (e && e.message ? e.message : e));
        }
      }, acc);
      this.timers.push(t);
    });
    return { count: list.length, total: acc };
  }
}

module.exports = JoinMessages;
