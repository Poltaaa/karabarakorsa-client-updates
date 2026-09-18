const fs = require('fs')
const path = require('path')
const cp = require('child_process')

const root = path.resolve(__dirname, '..')
const jsFiles = []
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(full)
    else if (ent.isFile() && ent.name.endsWith('.js')) jsFiles.push(full)
  }
}
walk(path.join(root, 'src'))
for (const file of jsFiles) cp.execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' })

const forbidden = ['.env', 'auth-cache', 'config.json']
for (const name of forbidden) {
  if (fs.existsSync(path.join(root, name))) throw new Error(`Yerel kullanıcı verisi depoda olmamalı: ${name}`)
}
console.log(`Doğrulama tamam: ${jsFiles.length} JavaScript dosyası.`)
