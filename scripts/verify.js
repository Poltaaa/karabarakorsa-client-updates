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
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-spawner-protect.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-connection.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-inventory.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-ui-performance.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-spawner-index.js')], { stdio: 'inherit' })

cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-auto-build.js')], { stdio: 'inherit' })

cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-nether-wart.js')], { stdio: 'inherit' })

cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-planner.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-travel.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-packet-safety.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-movement-watch.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-movement-input.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-edge.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-strafe.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-row-transition.js')], { stdio: 'inherit' })

cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-crop-rows.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-movement-attributes.js')], { stdio: 'inherit' })





cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-attribute-packet.js')], { stdio: 'inherit' })

const forbidden = ['.env', 'auth-cache', 'config.json']
for (const name of forbidden) {
  if (fs.existsSync(path.join(root, name))) throw new Error(`Yerel kullanıcı verisi depoda olmamalı: ${name}`)
}
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-rows.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-pace.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-escape-gaps.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-materials-stop.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-permission.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-client-ticks.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-refill-terminal.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-solid-pattern.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-precise-stance.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-pattern-resume.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-stop-physics.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-column-step.js')], { stdio: 'inherit' })
cp.execFileSync(process.execPath, [path.join(root, 'scripts', 'test-build-auto-pass.js')], { stdio: 'inherit' })
console.log(`Doğrulama tamam: ${jsFiles.length} JavaScript dosyası.`)
