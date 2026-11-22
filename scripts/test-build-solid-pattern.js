'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),{Vec3}=require('vec3');
const {region,catalog,AutoBuild}=require('../src/main/bot/auto-build');
const {SolidPattern}=require('../src/main/bot/build-solid-pattern');
const {WorldProof}=require('../src/main/bot/build-world-proof');
let passed=0;
for(const depth of ['x','z'])for(const sign of [-1,1])for(const crossSign of [-1,1])for(const length of [1,2,3,4,5,6,7,8,46]){
 const area=region({x:-9,y:71,z:-13},{x:-9+(depth==='x'?length-1:6),y:71,z:-13+(depth==='z'?length-1:6)}),cross=depth==='x'?'z':'x';
 const corner={x:area.min.x,y:71,z:area.min.z};corner[depth]=sign===1?area.min[depth]:area.max[depth];corner[cross]=crossSign===1?area.min[cross]:area.max[cross];
 const rows=new SolidPattern(area,new Vec3(0,69.875,0),corner,depth),seen=new Set(),groups=new Map();
 for(let i=0n;i<area.layer;i++){
  const p=rows.cell(i,71),d=rows.describe(p),q=rows.stance(p);
  assert.equal(rows.index(p),i);seen.add(`${p.x},${p.z}`);
  if(!rows.terminal(p)){
   const id=d.band+':'+p[cross];if(!groups.has(id))groups.set(id,[]);groups.get(id).push({p,q});
   assert.equal(q[depth],d.near+rows.sign+ .5);assert.equal(q[cross],p[cross]+.5);
  }else if(i<area.layer-1n){
   assert(q.x>=area.min.x+.5&&q.x<=area.max.x+.5&&q.z>=area.min.z+.5&&q.z<=area.max.z+.5,'terminal placement never needs an outside platform');
  }
  assert(!rows.allowed(p,{...q,y:72}),'cannot stand on the new roof');
 }
 assert.equal(BigInt(seen.size),area.layer);
 for(const group of groups.values()){
  assert.equal(group.length,3);assert(group.every(v=>JSON.stringify(v.q)===JSON.stringify(group[0].q)));
  assert(group.every((v,i)=>!i||v.p[depth]-group[i-1].p[depth]===rows.sign));
 }
 const last=rows.last(71),d=rows.describe(last);assert.equal(last[depth],d.near);
 assert(!Object.values(rows).some(Array.isArray),'no whole-area coordinate allocation');passed++;
}
const map=new Map(),bot={blockAt:p=>map.has(`${p.x},${p.y},${p.z}`)?{stateId:map.get(`${p.x},${p.y},${p.z}`)}:null},p=new Vec3(1,2,3);
map.set('1,2,3',4);let proof=new WorldProof(bot);proof.record(p,bot.blockAt(p));assert(proof.valid());map.set('20,20,20',9);assert(proof.valid(),'unread remote updates cannot invalidate a proof');map.set('1,2,3',4);assert(proof.valid(),'identical update is not a changed dependency');map.set('1,2,3',5);assert(!proof.valid(),'read block change invalidates');passed++;
proof=new WorldProof(bot);proof.record(new Vec3(4,4,4),null);map.set('4,4,4',0);assert(!proof.valid(),'unknown becoming loaded changes the proof');passed++;
proof=new WorldProof(bot,1);proof.record(p,bot.blockAt(p));proof.record(new Vec3(4,4,4),bot.blockAt(new Vec3(4,4,4)));assert(!proof.valid(),'bounded proof fails closed');passed++;
proof=new WorldProof(bot);proof.record(p,bot.blockAt(p));map.set('1,2,3',6);proof.record(p,bot.blockAt(p));map.set('1,2,3',5);assert(!proof.valid(),'inconsistent slice cannot become certified again');passed++;
const r=require('minecraft-data')('26.1'),c=catalog(r);assert(c.find(b=>b.name==='soul_sand').solid);assert(c.find(b=>b.name==='stone').solid);assert(!c.find(b=>b.name==='nether_wart').solid);assert(!c.find(b=>b.name==='torch').solid);passed++;
const ui=fs.readFileSync(path.join(__dirname,'../src/renderer/auto-build-ui.js'),'utf8');assert(ui.includes('solidPattern:blocks.find(b=>b.name===selected)?.solid===true'));assert(ui.includes('manual_last_block'));assert(ui.includes('build.manualTarget'));passed++;
// Manual remainder is separate from placed/skipped, not fictitious 100%.
const a=new AutoBuild(null);a.area=region({x:0,y:71,z:0},{x:1,y:71,z:1});a.cursor=3n;a.manualRemaining=1;a.manualTarget={x:1,y:71,z:1};a.status='complete';a.reason='manual_last_block';assert.equal(a.state().percent,75);assert.equal(a.state().manualRemaining,1);assert.deepEqual(a.state().manualTarget,a.manualTarget);passed++;
console.log(`Solid fixed-pattern tests passed: ${passed} cases; four corner directions, X/Z, 1/2/3 tails, fixed triples, roof/terminal bounds, huge-strip order, dependency snapshots, solid-only UI and honest manual remainder.`);
