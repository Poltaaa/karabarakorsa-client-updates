const assert = require('assert')
const { EventEmitter } = require('events')
const fs = require('fs')
const path = require('path')
const SpawnerProtect = require('../src/main/bot/spawner-protect')

const logger = {
  L: (tr) => tr,
  info: () => {},
  warn: () => {}
}

class Vec {
  constructor (x, y, z) {
    this.x = x
    this.y = y
    this.z = z
  }

  offset (x, y, z) { return new Vec(this.x + x, this.y + y, this.z + z) }
  minus (other) { return new Vec(this.x - other.x, this.y - other.y, this.z - other.z) }
  distanceTo (other) {
    return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z)
  }
  clone () { return new Vec(this.x, this.y, this.z) }
  toString () { return `(${this.x}, ${this.y}, ${this.z})` }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function makeProtect () {
  const protect = new SpawnerProtect(logger)
  protect.bot = {
    game: { gameMode: 0 },
    player: { gamemode: 0, ping: 80 },
    entity: { onGround: true },
    heldItem: { name: 'diamond_pickaxe' },
    inventory: { items: () => [] }
  }
  protect.lastPickaxeOkName = 'diamond_pickaxe'
  return protect
}

// Normal elmas kazma sabit 3,5 sn'ye takilmamali.
{
  const protect = makeProtect()
  const estimated = protect.computeDigMs({}, true)
  assert.strictEqual(estimated, 950)
  const safe = protect.computeSafeDigMs({}, estimated)
  assert(safe >= 1900, `guvenli sure cok kisa: ${safe}`)
  assert(safe < 2600, `elmas kazma gereksiz yavas: ${safe}`)
  assert(safe > estimated)
}

// En iyi/Verimlilikli kazma 1,6 sn'den hizli FINISH gondermemeli.
{
  const protect = makeProtect()
  const safe = protect.computeSafeDigMs({}, 300)
  assert(safe >= 1600, `hizli kazma guvenlik tabani cok kisa: ${safe}`)
  assert(safe < 2200, `en iyi kazma gereksiz yavas: ${safe}`)
}

// Mineflayer gercek durumlari (su, havada olma, efekt vb.) hesaba katip daha
// uzun bir sure verirse kisa teorik hesap onu ezmemeli.
{
  const protect = makeProtect()
  protect.bot.digTime = () => 2400
  const safe = protect.computeSafeDigMs({}, 500)
  assert(safe >= 2750, `native sure korunmadi: ${safe}`)
}

// Native hesap kullanilamiyor ve bot havadaysa vanilla 5x ceza uygulanmali.
{
  const protect = makeProtect()
  protect.bot.entity.onGround = false
  protect.bot.digTime = () => Infinity
  const safe = protect.computeSafeDigMs({}, 950)
  assert(safe >= 5100, `havada kazma cezasi uygulanmadi: ${safe}`)
}

// Creative modu gecikmeli survival yoluna sokulmamali.
{
  const protect = makeProtect()
  protect.bot.player.gamemode = 1
  assert.strictEqual(protect.computeSafeDigMs({}, 7500), 150)
}

// Vanilla erisimi ayaktan merkeze degil, gozden blok kutusunun en yakin
// noktasina olculmeli.
{
  const protect = makeProtect()
  const pos = new Vec(10, 64, 10)
  const nearBot = { entity: { position: new Vec(8.5, 64, 10.5), eyeHeight: 1.62 } }
  const farBot = { entity: { position: new Vec(4, 64, 10.5), eyeHeight: 1.62 } }
  assert(protect.blockReachDistance(nearBot, pos) < 4.25)
  assert(protect.blockReachDistance(farBot, pos) > 4.25)
}

// Spawner Koruma acilinca kullanicinin kapali Bot Physics ayari degismemeli.
{
  const protect = makeProtect()
  const bot = { username: 'test', physicsEnabled: false }
  protect.start(bot, {
    spawnerProtect: { triggerRadius: 20, breakRadius: 20, trusted: [] },
    accounts: { list: [] }
  })
  assert.strictEqual(bot.physicsEnabled, false)
  protect.stop()
}

// Paket 99: ayri spawner yaricapi kaldirildi. Eski config degeri gelse bile
// motor sabit 150 blok kullanmali ve renderer'da eski slider kalmamali.
{
  const protect = makeProtect()
  const bot = { username: 'test', physicsEnabled: false }
  protect.start(bot, {
    spawnerProtect: { triggerRadius: 20, breakRadius: 3, trusted: [] },
    accounts: { list: [] }
  })
  assert.strictEqual(protect.cfg.breakRadius, 150)
  protect.stop()

  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8')
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8')
  assert(!/id="sp-break(?:-val|-fill)?"/.test(html))
  assert(!/\\$\\('sp-break'\\)/.test(renderer))
  assert(/mc-inventory-window/.test(html))
  assert(/mc-player-canvas/.test(html))
  assert(/class="slider sp-hard-slider"/.test(html))
  assert(!/sp-macro-card/.test(html))
  assert(!/data-i18n="spawnerDefense"/.test(html))
}

// Kirma boyunca periyodik swing uretilmemeli; eski 3,5 sn hedef arasi kalkmali.
{
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'bot', 'spawner-protect.js'), 'utf8')
  assert(!/setInterval\(\(\) => this\._swingSafe\(bot\)/.test(source))
  assert(/await sleep\(ok \? 100 : 350\)/.test(source))
  assert(!/await sleep\(ok \? 3500 : 350\)/.test(source))
}

// Koruma bos durumdayken OFF/ON yapmak movement veya sneak birakma paketi
// uretmemeli. Start zaten stop() cagirdigi icin bu gx01 ac-kapa regresyonudur.
{
  const protect = makeProtect()
  let controlCalls = 0
  protect.bot = {
    setControlState: () => { controlCalls++ }
  }
  protect.running = true
  protect.busy = false
  protect.stop()
  assert.strictEqual(controlCalls, 0)
}

// Sunucunun bot.players anahtari username degilse bile gorunen p.username
// guvenilir listeyle buyuk/kucuk harfe ve renk koduna duyarsiz eslesmeli.
{
  const protect = makeProtect()
  protect.apply({ triggerRadius: 20, trusted: ['POLTAAA'] })
  const bot = {
    username: 'karabarakorsa',
    entity: { position: new Vec(0, 64, 0) },
    players: {
      'uuid-veya-gecici-anahtar': {
        username: '§aPoltaaa',
        entity: { position: new Vec(2, 64, 0) }
      }
    }
  }
  assert.strictEqual(protect.scanPlayers(bot), null)

  bot.players.yabanci_key = {
    username: 'YabanciOyuncu',
    entity: { position: new Vec(3, 64, 0) }
  }
  assert.strictEqual(protect.scanPlayers(bot).username, 'YabanciOyuncu')
}

// Kismi runtime ayari trusted alanini tasimiyorsa whitelist silinmemeli.
// Proxy adina gorunmez word-joiner eklese de ayni oyuncu kabul edilmeli.
{
  const protect = makeProtect()
  protect.apply({ triggerRadius: 20, trusted: ['poltaaa'] })
  protect.apply({ triggerRadius: 25, breakRadius: 40 })
  const bot = {
    username: 'karabarakorsa',
    entity: { position: new Vec(0, 64, 0) },
    players: {
      proxy_key: {
        username: 'pol\u2060taaa',
        entity: { position: new Vec(2, 64, 0) }
      }
    }
  }
  assert.strictEqual(protect.scanPlayers(bot), null)
  assert(protect.trusted.has('poltaaa'))
}

// Yeni spawner yerleştirmeleri iki dakikada beş başarıdan sonra bekletilmeli;
// korumayı kapatıp açmak bu sunucu güvenlik bütçesini sıfırlamamalı.
{
  const protect = makeProtect()
  const now = Date.now()
  protect._successfulBreaks = [0, 1, 2, 3, 4].map((n) => now - 1000 - n)
  const limited = protect.placementBudget(now)
  assert.strictEqual(limited.slots, 0)
  assert(limited.waitMs > 110000)
  protect._successfulBreaks = [now - 121000]
  const open = protect.placementBudget(now)
  assert.strictEqual(open.slots, 5)
  assert.strictEqual(open.waitMs, 0)
}

// Yalnizca guvenilir kisi yakindaysa tick hicbir kirma dongusu baslatmamali.
{
  const protect = makeProtect()
  let breakCalls = 0
  protect.apply({ triggerRadius: 20, trusted: ['poltaaa'] })
  protect.bot = {
    username: 'karabarakorsa',
    entity: { position: new Vec(0, 64, 0), clone: () => new Vec(0, 64, 0) },
    players: {
      internal_123: {
        username: 'poltaaa',
        entity: { position: new Vec(2, 64, 0) }
      }
    }
  }
  protect.running = true
  protect.armed = true
  protect.busy = false
  protect.breakLoop = () => { breakCalls++ }
  protect.tick()
  assert.strictEqual(breakCalls, 0)
  assert.strictEqual(protect.armed, true)
}

// Yakında yabancı olsa bile bölgede gerçek spawner yoksa (ör. kalabalık
// lobi) kazma döngüsü ve kazma seçimi hiç başlamamalı.
{
  const protect = makeProtect()
  let breakCalls = 0
  const pos = new Vec(1, 64, 0)
  protect.bot = {
    username: 'karabarakorsa',
    entity: { position: new Vec(0, 64, 0), clone: () => new Vec(0, 64, 0) },
    players: {
      yabanci: { username: 'Yabanci', entity: { position: pos } }
    },
    blockAt: () => null
  }
  protect.running = true
  protect.armed = true
  protect.busy = false
  protect.findSpawners = () => []
  protect.breakLoop = () => { breakCalls++ }
  protect.tick()
  assert.strictEqual(breakCalls, 0)
  assert.strictEqual(protect.armed, true)
  assert(protect._noSpawnerUntil > Date.now())
}

// Aynı yabancı bölgede dururken bir koruma olayından sonra tekrar tekrar
// tetiklenmemeli; ancak alan 2 saniye boş kaldıktan sonra yeniden silahlanmalı.
{
  const protect = makeProtect()
  const intruder = { username: 'Yabanci', entity: { position: new Vec(2, 64, 0) } }
  protect.bot = {
    username: 'karabarakorsa',
    entity: { position: new Vec(0, 64, 0), clone: () => new Vec(0, 64, 0) },
    players: { yabanci: intruder },
    blockAt: () => ({ name: 'spawner', type: 42 })
  }
  protect.running = true
  protect.armed = true
  protect.busy = false
  protect.findSpawners = () => [new Vec(1, 64, 0)]
  let breakCalls = 0
  protect.breakLoop = () => {
    breakCalls++
    protect.waitingForClear = true
    protect.armed = false
  }
  protect.tick()
  protect.tick()
  assert.strictEqual(breakCalls, 1)
  assert.strictEqual(protect.armed, false)

  protect.bot.players = {}
  protect.tick()
  protect.clearSince = Date.now() - 2100
  protect.tick()
  assert.strictEqual(protect.waitingForClear, false)
  assert.strictEqual(protect.armed, true)
}

// Hesap config'i Spawner Koruma acikken Bot Physics'i zorla ON yapmamali.
{
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8')
  assert(!/spawnerProtect\.enabled\)\s*c\.toggles\.physics\s*=\s*true/.test(mainSource))
}

// Yerel yuruyus hedefe ulasmis gorunse bile sunucu bir kez geri cektiyse
// uzaktan kazmaya gecilmemeli.
async function testRubberBandReject () {
  const protect = makeProtect()
  protect.bot = { _client: new EventEmitter() }
  protect.running = true
  protect.stopMoving = () => {}
  protect.goNearInner = async () => {
    protect.rbCount = 1
    return true
  }
  assert.strictEqual(await protect.goNear(new Vec(1, 2, 3), 100), false)
}

// Ham kazma akisi tam olarak bir START ve sure sonunda bir FINISH gondermeli;
// basari yalnizca sunucunun blockUpdate onayindan gelmeli.
async function testRawDig () {
  const protect = makeProtect()
  const bot = new EventEmitter()
  const pos = new Vec(10, 64, 10)
  const block = { name: 'spawner', type: 42, position: pos }
  const packets = []
  const sequence = []
  const lookCalls = []
  bot.entity = { position: new Vec(10, 64, 8), eyeHeight: 1.62 }
  bot.lookAt = async (point, force) => {
    lookCalls.push({ point, force })
    sequence.push('look')
  }
  bot.swingArm = () => Promise.resolve()
  bot.blockAt = () => block
  bot._client = {
    write: (name, body) => {
      packets.push({ name, body })
      if (name === 'block_dig') sequence.push('dig:' + body.status)
      if (name === 'block_dig' && body.status === 2) {
        setImmediate(() => bot.emit(`blockUpdate:${pos}`, block, { name: 'air', type: 0, position: pos }))
      }
    }
  }
  protect.bot = bot

  const ok = await protect.rawDig(block, 20, true)
  assert.strictEqual(ok, true)
  assert.deepStrictEqual(
    packets.filter((p) => p.name === 'block_dig').map((p) => p.body.status),
    [0, 2]
  )
  // Bot hedefin kuzeyinde: gorunen yuz NORTH(2), SOUTH(3) degil.
  assert.deepStrictEqual(
    packets.filter((p) => p.name === 'block_dig').map((p) => p.body.face),
    [2, 2]
  )
  assert.strictEqual(lookCalls.length, 1)
  assert.strictEqual(lookCalls[0].force, true)
  assert.deepStrictEqual(sequence.slice(0, 2), ['look', 'dig:0'])
}

async function testLookFailureSkipsDig () {
  const protect = makeProtect()
  const bot = new EventEmitter()
  const pos = new Vec(10, 64, 10)
  const block = { name: 'spawner', type: 42, position: pos }
  let digPackets = 0
  bot.entity = { position: new Vec(10, 64, 8), eyeHeight: 1.62 }
  bot.lookAt = async () => { throw new Error('look failed') }
  bot.swingArm = () => Promise.resolve()
  bot.blockAt = () => block
  bot._client = { write: (name) => { if (name === 'block_dig') digPackets++ } }
  protect.bot = bot
  assert.strictEqual(await protect.rawDig(block, 20, true), false)
  assert.strictEqual(digPackets, 0)
}

// Koruma acikken yakina yeni spawner koyulmasi, oyuncu tetigi olmasa veya
// koyan kisi trusted olsa bile tek bir kirma dongusu baslatmali. Stop dinleyiciyi
// kaldirmali ki sonraki OFF/ON'da olay iki kez calismasin.
async function testPlacedSpawnerTrigger () {
  const protect = makeProtect()
  const bot = new EventEmitter()
  const positions = [1, 2, 3, 4, 5].map((x) => new Vec(x, 64, 0))
  const blocks = new Map(positions.map((pos) => [
    pos.toString(),
    { name: 'spawner', type: 42, position: pos }
  ]))
  const firstSpawner = blocks.get(positions[0].toString())
  bot.username = 'karabarakorsa'
  bot.entity = { position: new Vec(0, 64, 0) }
  bot.players = {
    trusted: { username: 'poltaaa', entity: { position: new Vec(1, 64, 1) } }
  }
  bot.blockAt = (pos) => blocks.get(pos.toString()) || { name: 'air', type: 0, position: pos }
  bot.setControlState = () => {}

  protect.start(bot, {
    spawnerProtect: { triggerRadius: 20, breakRadius: 20, trusted: ['poltaaa'] },
    accounts: { list: [] }
  })
  let breakCalls = 0
  let receivedTargets = null
  protect.breakLoop = (targets) => {
    breakCalls++
    receivedTargets = targets
  }

  // Chunk yuklenirken eski blok bilinmiyorsa mevcut spawner yerlesim
  // sanilmamali.
  bot.emit('blockUpdate', null, firstSpawner)
  await sleep(850)
  assert.strictEqual(breakCalls, 0)

  // Yan yana hizla konan bes spawner tek hedefli grupta teslim edilmeli;
  // aralarinda ayri 15 saniyelik oturum beklemesi olmamali.
  for (const pos of positions) {
    const spawner = blocks.get(pos.toString())
    bot.emit('blockUpdate', { name: 'air', type: 0, position: pos }, spawner)
  }
  await sleep(1700)
  assert.strictEqual(breakCalls, 1)
  assert(Array.isArray(receivedTargets))
  assert.deepStrictEqual(receivedTargets.map((p) => p.toString()), positions.map((p) => p.toString()))

  // Stack metadata guncellemesi spawner -> spawner olarak tekrar yayilabilir.
  bot.emit('blockUpdate', firstSpawner, firstSpawner)
  await sleep(50)
  assert.strictEqual(breakCalls, 1)
  protect.stop()
  assert.strictEqual(bot.listenerCount('blockUpdate'), 0)
}

// Hedefli yeni-yerlestirme dongusu, findSpawners 150 bloktaki eski bloklari
// dondurse bile yalnizca event koordinatini kirmali.
async function testTargetedBreakLoop () {
  const protect = makeProtect()
  const freshPos = new Vec(1, 64, 0)
  const oldPos = new Vec(2, 64, 0)
  const blocks = new Map([
    [freshPos.toString(), { name: 'spawner', type: 42, position: freshPos }],
    [oldPos.toString(), { name: 'spawner', type: 42, position: oldPos }]
  ])
  protect.bot = {
    entity: { position: new Vec(0, 64, 0), onGround: true },
    blockAt: (pos) => blocks.get(pos.toString()) || { name: 'air', type: 0, position: pos },
    setControlState: () => {},
    physicsEnabled: false
  }
  protect.running = true
  protect.cfg = { triggerRadius: 20, breakRadius: 150, exitAfterBreak: false }
  protect.ensurePickaxe = async () => true
  protect.findSpawners = () => [freshPos, oldPos]
  protect.clearControls = () => {}
  protect.restorePhysics = () => {}
  const broken = []
  protect.breakSpawner = async (block) => {
    broken.push(block.position.toString())
    blocks.delete(block.position.toString())
    return true
  }

  await protect.breakLoop([freshPos])
  assert.deepStrictEqual(broken, [freshPos.toString()])
  assert(blocks.has(oldPos.toString()))
}

async function acceptsPickaxe (item, registry = null) {
  const protect = makeProtect()
  protect.bot = {
    heldItem: item,
    registry,
    inventory: {
      heldItem: item,
      items: () => [item]
    }
  }
  return protect.ensurePickaxe(protect.bot)
}

// AesirMC/1.20.x component kaydinda Silk Touch sayisal registry ID 21 olabilir.
async function testAesirNumericSilk () {
  const item = {
    name: 'diamond_pickaxe',
    slot: 36,
    components: [{
      type: 'enchantments',
      data: { enchantments: [{ id: 21, level: 1 }] }
    }]
  }
  assert.strictEqual(await acceptsPickaxe(item), true)
}

// Ozel sunucular vanilla componenti gizleyip büyüyü yalnızca lore'da tutabilir.
async function testTurkishLoreSilk () {
  const item = {
    name: 'diamond_pickaxe',
    slot: 36,
    customLore: ['{"text":"İpeksi Dokunuş I"}']
  }
  assert.strictEqual(await acceptsPickaxe(item), true)
}

// Normalize getter boş olsa bile Prismarine toNotch ham componenti taranmalı.
async function testRawNotchSilk () {
  class RawPick {}
  RawPick.toNotch = () => ({
    components: [{
      type: 'minecraft:enchantments',
      data: { enchantments: [{ id: 'minecraft:silk_touch', level: 1 }] }
    }]
  })
  const item = Object.assign(new RawPick(), {
    name: 'diamond_pickaxe',
    slot: 36
  })
  assert.strictEqual(await acceptsPickaxe(item), true)
}

// İpeksi yoksa kullanıcının isteğiyle normal Verimlilikli kazmaya geri düşülür;
// bu kazma log/durum tarafında yanlışlıkla İpeksi diye işaretlenmez.
async function testEfficiencyFallback () {
  const item = {
    name: 'diamond_pickaxe',
    slot: 36,
    components: [{
      type: 'enchantments',
      data: { enchantments: [{ id: 8, level: 4 }] }
    }]
  }
  const protect = makeProtect()
  protect.bot = {
    heldItem: item,
    inventory: { heldItem: item, items: () => [item] }
  }
  assert.strictEqual(await protect.ensurePickaxe(protect.bot), true)
  assert.strictEqual(protect.lastPickaxeHasSilk, false)
  assert.strictEqual(protect.lastPickaxeOkName, 'diamond_pickaxe')
  assert.strictEqual(protect.computeDigMs({}, true), 300)
}

function enchantedPick (name, slot, id, level) {
  return {
    name, slot,
    components: id === null ? [] : [{
      type: 'enchantments',
      data: { enchantments: [{ id, level }] }
    }]
  }
}

// "En güçlü" seçim malzeme adına değil gerçek vanilla kazma hızına bakmalı.
async function testStrongestNormalPickaxe () {
  const diamondEff4 = enchantedPick('diamond_pickaxe', 10, 8, 4)
  const netherite = enchantedPick('netherite_pickaxe', 11, null, 0)
  const bot = {
    heldItem: netherite,
    inventory: {
      heldItem: netherite,
      items: () => [netherite, diamondEff4]
    },
    equip: async (item) => {
      bot.heldItem = item
      bot.inventory.heldItem = item
    }
  }
  const protect = makeProtect()
  protect.bot = bot
  assert.strictEqual(await protect.ensurePickaxe(bot), true)
  assert.strictEqual(protect.lastPickaxeOkItem, diamondEff4)
  assert.strictEqual(protect.lastPickaxeHasSilk, false)
}

// İpeksi bir kazma varsa daha hızlı normal kazmadan önce her zaman o seçilir.
async function testSilkPreferredOverNormal () {
  const fastNormal = enchantedPick('diamond_pickaxe', 10, 8, 5)
  const silkIron = enchantedPick('iron_pickaxe', 11, 'minecraft:silk_touch', 1)
  const bot = {
    heldItem: fastNormal,
    inventory: {
      heldItem: fastNormal,
      items: () => [fastNormal, silkIron]
    },
    equip: async (item) => {
      bot.heldItem = item
      bot.inventory.heldItem = item
    }
  }
  const protect = makeProtect()
  protect.bot = bot
  assert.strictEqual(await protect.ensurePickaxe(bot), true)
  assert.strictEqual(protect.lastPickaxeOkItem, silkIron)
  assert.strictEqual(protect.lastPickaxeHasSilk, true)
}

async function testNoPickaxeStillStops () {
  const protect = makeProtect()
  protect.bot = {
    heldItem: { name: 'stone_sword', slot: 36 },
    inventory: { items: () => [{ name: 'stone_sword', slot: 36 }] }
  }
  assert.strictEqual(await protect.ensurePickaxe(protect.bot), false)
}

// Iki onayli hedef arasinda eski 3,5 sn bekleme geri gelmemeli.
async function testConsecutiveBreakSpeed () {
  const protect = makeProtect()
  const positions = [new Vec(1, 64, 0), new Vec(2, 64, 0)]
  const blocks = new Map(positions.map((pos) => [
    pos.toString(), { name: 'spawner', type: 42, position: pos }
  ]))
  protect.bot = {
    entity: { position: new Vec(0, 64, 0), onGround: true },
    blockAt: (pos) => blocks.get(pos.toString()) || { name: 'air', type: 0, position: pos },
    setControlState: () => {},
    physicsEnabled: false
  }
  protect.running = true
  protect.cfg = { triggerRadius: 20, breakRadius: 150, exitAfterBreak: false }
  protect.ensurePickaxe = async () => true
  protect.findSpawners = () => []
  protect.clearControls = () => {}
  protect.restorePhysics = () => {}
  let calls = 0
  protect.breakSpawner = async (block) => {
    calls++
    blocks.delete(block.position.toString())
    return true
  }
  const started = Date.now()
  await protect.breakLoop(positions)
  assert.strictEqual(calls, 2)
  assert(Date.now() - started < 1000)
}

Promise.all([
  testRubberBandReject(),
  testRawDig(),
  testLookFailureSkipsDig(),
  testPlacedSpawnerTrigger(),
  testTargetedBreakLoop(),
  testConsecutiveBreakSpeed(),
  testAesirNumericSilk(),
  testTurkishLoreSilk(),
  testRawNotchSilk(),
  testEfficiencyFallback(),
  testStrongestNormalPickaxe(),
  testSilkPreferredOverNormal(),
  testNoPickaxeStillStops()
])
  .then(() => console.log('Spawner Protect testleri tamam: 29 senaryo.'))
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })