'use strict';
const { performance } = require('perf_hooks');

// Chunk/block events keep this index current. Never perform a synchronous
// 150-block findBlocks() scan in a periodic timer or after each mined block.
class SpawnerIndex {
  constructor(bot, opts = {}) {
    this.bot = bot;
    this.budgetMs = opts.budgetMs || 2;
    this.now = opts.now || (() => performance.now());
    this.schedule = opts.schedule || setImmediate;
    this.cancel = opts.cancel || clearImmediate;
    this.columns = new Map();
    this.jobs = new Map();
    this.waiters = [];
    this.timer = null;
    this.stopped = false;
    this.revision = 0;
    this.epoch = 0;
    this.initialized = false;
    this.stats = { slices: 0, maxSliceMs: 0, blocksRead: 0, sectionsSkipped: 0 };
    this.handlers = {
      chunkColumnLoad: (p) => this.queueColumn(Math.floor(p.x / 16), Math.floor(p.z / 16)),
      chunkColumnUnload: (p) => this.removeColumn(Math.floor(p.x / 16), Math.floor(p.z / 16)),
      blockUpdate: (_old, block) => this.updateBlock(block),
      respawn: () => this.reset(),
      end: () => this.stop()
    };
    for (const [event, handler] of Object.entries(this.handlers)) {
      if (bot && typeof bot.on === 'function') bot.on(event, handler);
    }
    this.seed();
  }

  get pending() { return this.jobs.size > 0; }
  get ready() { return this.initialized && !this.pending; }

  ranges() {
    const byName = this.bot && this.bot.registry && this.bot.registry.blocksByName;
    return ['spawner', 'mob_spawner'].map((name) => byName && byName[name]).filter(Boolean);
  }

  isState(state, ranges) {
    return ranges.some((r) => Number.isFinite(r.minStateId) &&
      state >= r.minStateId && state <= (r.maxStateId === undefined ? r.minStateId : r.maxStateId));
  }

  seed() {
    if (this.stopped || this.initialized) return;
    const world = this.bot && this.bot.world;
    if (!world || typeof world.getColumns !== 'function' || !this.ranges().length) return;
    this.initialized = true;
    for (const { chunkX, chunkZ } of world.getColumns()) this.queueColumn(Number(chunkX), Number(chunkZ));
  }

  queueColumn(x, z) {
    if (this.stopped) return;
    const world = this.bot && this.bot.world;
    const column = world && typeof world.getColumn === 'function' && world.getColumn(x, z);
    if (!column) return;
    if (!this.initialized) this.seed();
    const key = `${x},${z}`;
    const existing = this.jobs.get(key);
    if (existing && existing.column === column) {
      // Mineflayer can reload data into the SAME ChunkColumn instance while
      // a yielded scan has already passed some sections. Scan it once more.
      existing.rescan = true;
      this.revision++;
      return;
    }
    this.columns.delete(key);
    this.revision++;
    const job = { x, z, key, column, positions: new Map(), iterator: null };
    job.iterator = this.scanColumn(job);
    this.jobs.set(key, job);
    this.kick();
  }

  removeColumn(x, z) {
    const key = `${x},${z}`;
    this.columns.delete(key);
    this.jobs.delete(key);
    this.revision++;
    this.resolveWaiters();
  }

  updateBlock(block) {
    if (this.stopped || !block || !block.position) return;
    const p = block.position, key = `${Math.floor(p.x / 16)},${Math.floor(p.z / 16)}`;
    let positions = this.columns.get(key);
    const id = `${p.x},${p.y},${p.z}`;
    const isSpawner = block.name === 'spawner' || block.name === 'mob_spawner';
    const job = this.jobs.get(key);
    if (!isSpawner && !(positions && positions.has(id)) && !(job && job.positions.has(id))) return;
    if (!positions) { positions = new Map(); this.columns.set(key, positions); }
    if (isSpawner) {
      positions.set(id, typeof p.clone === 'function' ? p.clone() : p);
    } else {
      positions.delete(id);
    }
    // If this column is currently being scanned, update the same live map.
    if (job) {
      if (positions.has(id)) job.positions.set(id, positions.get(id));
      else job.positions.delete(id);
    }
    this.revision++;
  }

  *scanColumn(job) {
    const column = job.column;
    if (typeof column.getBlockStateId !== 'function' && typeof column.getBlockType !== 'function') {
      throw new Error('Chunk has no raw block accessor');
    }
    const ranges = this.ranges();
    if (!ranges.length) return;
    const minY = Number.isFinite(column.minY) ? column.minY : Number(this.bot.game && this.bot.game.minY) || 0;
    const height = column.worldHeight || (column.sections && column.sections.length * 16) ||
      Number(this.bot.game && this.bot.game.height) || 256;
    const origin = this.bot.entity && this.bot.entity.position;
    if (!origin || typeof origin.offset !== 'function') return;
    // Old 1.8 chunk accessors call pos.modulus(); reuse one real Vec3 instead
    // of allocating a position/block object for each of the 4096 voxels.
    const raw = origin.offset(0, 0, 0);
    this.columns.set(job.key, job.positions);
    for (let sy = 0; sy < Math.ceil(height / 16); sy++) {
      const section = column.sections && column.sections[sy];
      if (column.sections && !section) { this.stats.sectionsSkipped++; yield; continue; }
      const palette = section && section.palette;
      if (palette) {
        let matched = false, steps = 0;
        for (const state of palette) {
          if (this.isState(state, ranges)) { matched = true; break; }
          if (++steps % 64 === 0) yield;
        }
        if (!matched) { this.stats.sectionsSkipped++; yield; continue; }
      }
      for (let i = 0; i < 4096; i++) {
        raw.x = i & 15;
        raw.z = (i >> 4) & 15;
        raw.y = minY + sy * 16 + (i >> 8);
        let match = false;
        if (typeof column.getBlockStateId === 'function') {
          match = this.isState(column.getBlockStateId(raw), ranges);
        } else if (typeof column.getBlockType === 'function') {
          const type = column.getBlockType(raw);
          match = ranges.some((r) => r.id === type);
        }
        this.stats.blocksRead++;
        if (match) {
          const x = job.x * 16 + raw.x, z = job.z * 16 + raw.z;
          job.positions.set(`${x},${raw.y},${z}`, origin.offset(x - origin.x, raw.y - origin.y, z - origin.z));
        }
        // At most 128 cheap state reads before checking the time budget.
        if ((i & 127) === 127) yield;
      }
      yield;
    }
  }

  kick() {
    if (this.stopped || this.timer !== null || !this.pending) return;
    this.timer = this.schedule(() => {
      this.timer = null;
      this.slice();
    });
  }

  slice() {
    if (this.stopped) return;
    const begin = this.now();
    let steps = 0;
    while (this.pending && steps++ < 64) {
      const job = this.jobs.values().next().value;
      const world = this.bot && this.bot.world;
      // A reload/unload must never publish coordinates from an older column.
      if (!world || world.getColumn(job.x, job.z) !== job.column) {
        this.removeColumn(job.x, job.z);
        continue;
      }
      try {
        if (job.iterator.next().done) {
          this.jobs.delete(job.key);
          this.revision++;
          if (job.rescan) this.queueColumn(job.x, job.z);
        }
      } catch (err) {
        this.lastError = err && err.message ? err.message : String(err);
        this.jobs.delete(job.key);
        this.columns.delete(job.key);
        this.initialized = false; // Never claim "all clear" after an incomplete scan.
        this.revision++;
      }
      if (this.now() - begin >= this.budgetMs) break;
    }
    this.stats.slices++;
    this.stats.maxSliceMs = Math.max(this.stats.maxSliceMs, this.now() - begin);
    this.resolveWaiters();
    this.kick();
  }

  query(origin, player, radius, limit = 512) {
    this.seed();
    const squared = radius * radius, list = [];
    for (const positions of this.columns.values()) {
      for (const p of positions.values()) {
        const dx = p.x - origin.x, dy = p.y - origin.y, dz = p.z - origin.z;
        if (dx * dx + dy * dy + dz * dz <= squared) list.push(p);
      }
    }
    const distance = (p) => (p.x - player.x) ** 2 + (p.y - player.y) ** 2 + (p.z - player.z) ** 2;
    list.sort((a, b) => distance(a) - distance(b));
    return list.slice(0, limit);
  }

  whenIdle() {
    this.seed();
    if (this.stopped) return Promise.resolve(false);
    if (!this.pending) return Promise.resolve(this.ready);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  resolveWaiters() {
    if (this.pending && !this.stopped) return;
    for (const resolve of this.waiters.splice(0)) resolve(!this.stopped && this.ready);
  }

  reset() {
    if (this.stopped) return;
    this.jobs.clear();
    this.epoch++;
    this.columns.clear();
    this.initialized = false;
    this.revision++;
    this.seed();
    this.resolveWaiters();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    for (const [event, handler] of Object.entries(this.handlers)) {
      if (this.bot && typeof this.bot.removeListener === 'function') this.bot.removeListener(event, handler);
    }
    this.jobs.clear();
    this.columns.clear();
    this.resolveWaiters();
    this.bot = null;
  }
}
module.exports = SpawnerIndex;