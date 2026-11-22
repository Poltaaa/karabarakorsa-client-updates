'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const main = read('src/main/main.js')
const renderer = read('src/renderer/renderer.js')
const styles = read('src/renderer/styles.css')

// Mineflayer dünya/chunk belleği 256 MB V8 sınırında sürekli tam GC yapmamalı.
assert(/--max-old-space-size=768\b/.test(main))
assert(!/--max-old-space-size=256\b/.test(main))

// Canlı sohbet ve log olayları her IPC'de DOM'a doğrudan yazılmamalı.
assert(/bridge\.on\('chat',\s*\(m\)\s*=>\s*queueChatLine\(m\)\)/.test(renderer))
assert(/bridge\.on\('log',\s*\(e\)\s*=>\s*queueLogLine\(e\)\)/.test(renderer))
assert(/function queueChatLine\(/.test(renderer))
assert(/function queueLogLine\(/.test(renderer))
assert(/setTimeout\(\(\)\s*=>\s*\{[\s\S]{0,260}appendChatBatch\(batch,\s*false\);[\s\S]{0,30}\},\s*50\)/.test(renderer))
assert(/setTimeout\(\(\)\s*=>\s*\{[\s\S]{0,260}appendLogBatch\(batch\);[\s\S]{0,30}\},\s*50\)/.test(renderer))

// Bir mesaj grubu tek fragment, tek kırpma ve tek scroll hesabıyla çizilir.
assert((renderer.match(/createDocumentFragment\(\)/g) || []).length >= 3)
assert(/function appendChatBatch\(/.test(renderer))
assert(/function appendLogBatch\(/.test(renderer))

// Yoğun sunucu akışında her satıra ayrı giriş animasyonu uygulanmaz.
assert(/\.line\s*\{\s*animation:\s*none;\s*\}/.test(styles))

console.log('Arayüz performans testleri tamam: 10 senaryo.')