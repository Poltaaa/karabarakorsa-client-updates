const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const manager = read('src/main/bot/bot-manager.js')
const main = read('src/main/main.js')
const preload = read('src/main/preload.js')
const renderer = read('src/renderer/renderer.js')
const html = read('src/renderer/index.html')

// 1: Player inventory'nin crafting/output dahil tum 0-45 slotlari donuyor.
assert(/zone:\s*'craftOut',\s*start:\s*0,\s*end:\s*0/.test(manager))
assert(/zone:\s*'craft',\s*start:\s*1,\s*end:\s*4/.test(manager))
assert(/zone:\s*'offhand',\s*start:\s*45,\s*end:\s*45/.test(manager))

// 2: Cursor yigini renderer'a aktariliyor.
assert(/cursor:\s*selected\s*\?/.test(manager))
assert(/selectedItem/.test(manager))

// 3: Sol/sag tik ve Shift hizli tasima protokol modlari acik.
assert(/mode === 0 && \(button === 0 \|\| button === 1\)/.test(manager))
assert(/mode === 1 && button === 0/.test(manager))

// 4: 1-9/F, creative orta tik, Q ve cift tik modlari destekleniyor.
assert(/mode === 2/.test(manager) && /button === 40/.test(manager))
assert(/mode === 3 && button === 2/.test(manager))
assert(/mode === 4/.test(manager))
assert(/mode === 6/.test(manager))

// 5: Surukle-birak tum yigin ve Alt ile yari yigin tasiyor.
assert(/type === 'move'/.test(manager))
assert(/p\.half \? 1 : 0/.test(manager))
assert(/ondragstart/.test(renderer) && /ondrop/.test(renderer))

// 6: Modal kapanirken cursor esyasi yere atilmadan geri konuyor.
assert(/type === 'return'/.test(manager))
assert(/cursor_full/.test(manager))
assert(/inventoryOp\(closingSlot,\s*\{\s*type:\s*'return'\s*\}\)/.test(renderer))

// 7: Crafting grid ve sonuc karesi gercek inventory slotlarina bagli.
assert(/id="inv-craft"/.test(html))
assert(/id="inv-craft-out"/.test(html))
assert(/craftOut:\s*\$\('inv-craft-out'\)/.test(renderer))

// 8: Sag tik, Shift tik, cift tik ve orta tik renderer olaylari bagli.
assert(/oncontextmenu/.test(renderer))
assert(/shift \? 1 : 0/.test(renderer))
assert(/ondblclick/.test(renderer))
assert(/onauxclick/.test(renderer))

// 9: IPC tam envanter operasyonunu guvenli preload koprusuyle tasiyor.
assert(/bot:inventory-op/.test(main))
assert(/inventoryOp:/.test(preload))

// 10: Spawner Koruma ayrintili hero yerine sade makro kartlarini kullaniyor.
assert(/sp-simple-grid/.test(html))
assert(!/class="sp-protect-shell"/.test(html))
assert(!/id="sp-protect-state"/.test(html))

// 11: Envanterin altinda yardim/durum satiri yok; modal islem sirasinda
// yukari-asagi oynamiyor.
assert(!/class="inv-hint"/.test(html))
assert(!/id="inv-status"/.test(html))
assert(!/invClickTimer/.test(renderer))
assert(!/invRefreshTimer/.test(renderer))
assert(!/setTimeout\(\(\) => \{[\s\S]{0,120}runInventoryOp[\s\S]{0,120}190\)/.test(renderer))

// 12: Bos crafting outputu hem arayuzde hem arka ucta sunucuya yollanmiyor.
assert(/s\.zone === 'craftOut' && s\.empty/.test(renderer))
assert(/slot === 0 && \(!out \|\| out\.type === 0 \|\| out\.count <= 0\)/.test(manager))

// 13: Kayip transaction cevabi paneli 15-20 sn kilitlemiyor.
assert(/inventory_timeout/.test(manager))
assert(/Promise\.race/.test(manager))
assert(/2200/.test(manager))

// 14: X/Escape kapanışı transaction beklemeden önce modalı anında gizliyor.
const closeStart = renderer.indexOf('async function closeInventory()')
const closeEnd = renderer.indexOf('async function refreshInventory', closeStart)
const closeBody = renderer.slice(closeStart, closeEnd)
assert(closeStart >= 0 && closeEnd > closeStart)
assert(closeBody.indexOf('hideInventoryModal();') < closeBody.indexOf('await invOpChain'))

// 15: Sunucu menüsü açılırsa yerel envanter onun üstünde kalmıyor.
assert(/bridge\.on\('screen-open'[\s\S]{0,700}hideInventoryModal\(\)/.test(renderer))
assert(/if\s*\(r\.windowOpen\)\s*\{\s*hideInventoryModal\(\)/.test(renderer))

// 16: Geç gelen envanter cevabı kapanmış cursor görüntüsünü geri getirmiyor.
assert(/if\s*\(!invOpen\)\s*return r;/.test(renderer))

// Kaynaktaki gercek inventoryOperation metodunu dis bagimlilik olmadan cikarip
// sahte Mineflayer inventory'siyle paket siralarini calistir.
function extractAsyncMethod (source, name) {
  const marker = `async ${name}(op) {`
  const start = source.indexOf(marker)
  assert(start >= 0, `${name} bulunamadi`)
  const brace = source.indexOf('{', start)
  let depth = 0
  let end = -1
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) { end = i; break }
  }
  assert(end > brace, `${name} sonu bulunamadi`)
  const body = source.slice(brace + 1, end)
  return new Function('sleep', `return async function(op) {${body}}`)(async () => {})
}

const inventoryOperation = extractAsyncMethod(manager, 'inventoryOperation')
const item = (count = 8) => ({ type: 1, metadata: 0, count, name: 'stone', displayName: 'Stone', maxStackSize: 64 })
function fakeContext () {
  const calls = []
  const slots = Array(46).fill(null)
  const inventory = {
    slots,
    selectedItem: null
  }
  const bot = {
    inventory,
    currentWindow: null,
    clickWindow: async (slot, button, mode) => {
      calls.push([slot, button, mode])
      if (mode !== 0) return
      const inSlot = slots[slot]
      const held = inventory.selectedItem
      if (!held && inSlot) {
        if (button === 1) {
          const take = Math.ceil(inSlot.count / 2)
          inventory.selectedItem = { ...inSlot, count: take }
          inSlot.count -= take
          if (inSlot.count <= 0) slots[slot] = null
        } else {
          inventory.selectedItem = inSlot
          slots[slot] = null
        }
      } else if (held && !inSlot) {
        if (button === 1) {
          slots[slot] = { ...held, count: 1 }
          held.count--
          if (held.count <= 0) inventory.selectedItem = null
        } else {
          slots[slot] = held
          inventory.selectedItem = null
        }
      }
    }
  }
  return {
    calls, slots, bot,
    ctx: { bot, inventoryList: () => ({ ok: true }) }
  }
}

;(async () => {
  // 17: Sol tik yiginin tamamini cursor'a alir.
  {
    const f = fakeContext()
    f.slots[9] = item(8)
    const r = await inventoryOperation.call(f.ctx, { type: 'click', slot: 9, button: 0, mode: 0 })
    assert.strictEqual(r.ok, true)
    assert.deepStrictEqual(f.calls[0], [9, 0, 0])
    assert.strictEqual(f.bot.inventory.selectedItem.count, 8)
  }

  // 18: Sag tik yiginin buyuk yarisini alir.
  {
    const f = fakeContext()
    f.slots[9] = item(9)
    await inventoryOperation.call(f.ctx, { type: 'click', slot: 9, button: 1, mode: 0 })
    assert.strictEqual(f.bot.inventory.selectedItem.count, 5)
    assert.strictEqual(f.slots[9].count, 4)
  }

  // 19: Surukle-birak source -> target paketlerini sirali gonderir.
  {
    const f = fakeContext()
    f.slots[9] = item(16)
    await inventoryOperation.call(f.ctx, { type: 'move', from: 9, to: 10 })
    assert.deepStrictEqual(f.calls.slice(0, 2), [[9, 0, 0], [10, 0, 0]])
    assert.strictEqual(f.slots[10].count, 16)
    assert.strictEqual(f.bot.inventory.selectedItem, null)
  }

  // 20: Pencere kapanisinda cursor esyasi bos ana slota geri konur.
  {
    const f = fakeContext()
    f.bot.inventory.selectedItem = item(3)
    await inventoryOperation.call(f.ctx, { type: 'return' })
    assert.deepStrictEqual(f.calls[0], [9, 0, 0])
    assert.strictEqual(f.slots[9].count, 3)
    assert.strictEqual(f.bot.inventory.selectedItem, null)
  }

  // 21: Bos crafting sonucuna tiklama hic paket gondermez.
  {
    const f = fakeContext()
    const r = await inventoryOperation.call(f.ctx, { type: 'click', slot: 0, button: 0, mode: 0 })
    assert.strictEqual(r.ok, true)
    assert.deepStrictEqual(f.calls, [])
  }

  console.log('Tam envanter testleri tamam: 21 senaryo.')
})().catch((err) => {
  console.error(err)
  process.exitCode = 1
})