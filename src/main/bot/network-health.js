'use strict';
// Aggregate only: never log chat contents, tokens, or heartbeat IDs.
class NetworkHealth {
  constructor(client, logger, opts = {}) {
    this.client = client;
    this.logger = logger;
    this.now = opts.now || Date.now;
    this.rx = 0;
    this.tx = 0;
    this.keepRx = 0;
    this.keepTx = 0;
    this.pingRx = 0;
    this.pongTx = 0;
    this.lastRx = this.now();
    this.lastTick = this.lastRx;
    this.maxDelay = 0;
    this.lastReport = this.lastRx;
    this.stopped = false;
    this.onPacket = (_data, meta) => this.received(meta && meta.name);
    client.on('packet', this.onPacket);
    this.timer = setInterval(() => this.tick(), 1000);
    if (this.timer.unref) this.timer.unref();
  }
  received(name) {
    if (this.stopped) return;
    this.rx++;
    this.lastRx = this.now();
    if (name === 'keep_alive') this.keepRx++;
    if (name === 'ping') this.pingRx++;
  }
  sent(name) {
    if (this.stopped) return;
    this.tx++;
    if (name === 'keep_alive') this.keepTx++;
    if (name === 'pong') this.pongTx++;
  }
  tick() {
    const now = this.now();
    const delay = Math.max(0, now - this.lastTick - 1000);
    this.maxDelay = Math.max(this.maxDelay, delay);
    this.lastTick = now;
    if (now - this.lastReport >= 60000) {
      this.report();
      this.lastReport = now;
      this.maxDelay = 0;
    }
  }
  report() {
    if (this.stopped) return;
    this.logger.info(`Network health: state=${this.client.state || '?'} rx=${this.rx} tx=${this.tx}` +
      ` keepalive=${this.keepTx}/${this.keepRx} pong=${this.pongTx}/${this.pingRx}` +
      ` lastRxAgo=${Math.max(0, this.now() - this.lastRx)}ms loopDelayMax=${this.maxDelay}ms`);
    this.logger.diagnostic?.('network',{state:String(this.client.state||''),rx:this.rx,tx:this.tx,keepRx:this.keepRx,keepTx:this.keepTx,pingRx:this.pingRx,pongTx:this.pongTx,lastRxAgo:Math.max(0,this.now()-this.lastRx),loopDelayMax:this.maxDelay});
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.timer);
    this.client.removeListener('packet', this.onPacket);
  }
}
module.exports = NetworkHealth;