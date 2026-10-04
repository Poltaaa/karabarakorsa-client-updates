'use strict';
// Diag: chickennw ping + entity_teleport schema per supported version
const mcData = require('minecraft-data');
const mcp = require('minecraft-protocol');

const HOST = process.argv[2] || 'oyna.chickennw.com';

async function main() {
  // 1) Ping server
  const ping = await new Promise((resolve) => {
    let done = false;
    mcp.ping({ host: HOST, port: 25565 }, (err, res) => {
      if (done) return; done = true;
      if (err) return resolve({ ok: false, error: err.message });
      resolve({ ok: true, version: res.version, players: res.players, latency: res.latency });
    });
  });
  console.log('PING:', JSON.stringify(ping, null, 2));

  // 2) List supported versions + entity_teleport schema
  const versions = mcData.versions.pc
    .filter((v) => v.releaseType === 'release' || !v.releaseType)
    .map((v) => v.minecraftVersion)
    .filter((v, i, arr) => v && arr.indexOf(v) === i);
  console.log('SUPPORTED VERSIONS COUNT:', versions.length);
  console.log('first 3:', versions.slice(0, 3), 'last 3:', versions.slice(-3));

  // find protocol for the pinged version name by searching all entries
  const proto = ping.version && ping.version.protocol;
  console.log('SERVER PROTOCOL ID:', proto, 'NAME:', ping.version && ping.version.name);

  const schema = (v) => {
    try {
      const d = mcData(v);
      const pkt = d.protocol.types.packet[1][1].type.find((t) => t.name === 'entity_teleport');
      if (!pkt) return { err: 'no entity_teleport mapping' };
      // pkt = { name, type: [...] } under packet[1][1]? Actually find through player.packets...
      return pkt;
    } catch (e) { return { err: e.message }; }
  };

  // Search where entity_teleport is defined in the protocol for a few versions
  for (const v of ['1.20.1', '1.20.2', '1.20.4', '1.20.6', '1.21', '1.21.1', '1.21.4', '1.21.8']) {
    try {
      const d = mcData(v);
      const pr = d.protocol;
      // find types containing entity_teleport
      let found = null;
      for (const [tname, tdef] of Object.entries(pr.types || {})) {
        if (JSON.stringify(tdef).includes('entity_teleport')) {
          const holder = pr.types[tname];
          found = found || { tname, tdef: holder };
        }
      }
      const layout = findEntityTeleport(pr.types);
      console.log(`\n=== ${v} ===`);
      console.log('packets root:', pr.types &&
        Object.keys(pr.types).filter((k) => /packet|play/gi.test(k)).join(','));
      if (layout) console.log('entity_teleport fields:', JSON.stringify(layout));
      else console.log('entity_teleport: NOT FOUND');
    } catch (e) {
      console.log(`\n=== ${v} === ERR: ${e.message}`);
    }
  }
}

function findEntityTeleport(types) {
  if (!types) return null;
  for (const [tn, tdef] of Object.entries(types)) {
    const s = JSON.stringify(tdef);
    if (s.includes('entity_teleport')) {
      // try to find the array-of-fields form
      if (Array.isArray(tdef) && tdef.every((x) => x && x.name && x.type)) {
        // container of named fields
        return tdef;
      }
      if (Array.isArray(tdef)) {
        // container with [name, type] pairs possibly
        const fields = [];
        for (const item of tdef) {
          if (Array.isArray(item)) fields.push(item.map((i) => (typeof i === 'string' ? i : JSON.stringify(i))));
        }
        if (fields.length) return fields;
      }
    }
  }
  return null;
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });