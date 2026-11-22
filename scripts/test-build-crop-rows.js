'use strict';
const assert=require('assert'),{region}=require('../src/main/bot/auto-build'),{CropRows}=require('../src/main/bot/build-crop-rows');
let passed=0;
for(const depth of ['x','z'])for(const low of [true,false])for(const size of [1,2,3,4,7]){
 const area=region({x:-9,y:66,z:-13},{x:-9+(depth==='x'?size-1:6),y:66,z:-13+(depth==='z'?size-1:6)}),entry={x:-8.5,z:-12.5},r=new CropRows(area,entry,{axis:depth,low});
 const seen=new Set(),groups=new Map();for(let i=0n;i<area.layer;i++){
  const p=r.cell(i,66);assert.equal(r.index(p),i);seen.add(`${p.x},${p.z}`);const q=r.stance(p),info=r.describe(p),id=info.band+':'+p[r.cross];
  assert(q.x>=area.min.x+.299&&q.x<=area.max.x+.701&&q.z>=area.min.z+.299&&q.z<=area.max.z+.701,'last strip stays over garden, no outside platform');
  assert(r.allowed(p,{...q,y:65.875}));assert(!r.allowed(p,{...q,y:67}));
  if(!groups.has(id))groups.set(id,[]);groups.get(id).push({p,q});
 }
 assert.equal(BigInt(seen.size),area.layer);for(const group of groups.values()){
  assert(group.length<=3);assert(group.every(v=>JSON.stringify(v.q)===JSON.stringify(group[0].q)),'one shared stance per trio');
  assert(group.every((v,i)=>!i||v.p[depth]-group[i-1].p[depth]===r.sign),'far-to-near aligned order');
 }
 passed++;
}
const huge=region({x:-10000000,y:66,z:-10000000},{x:10000000,y:66,z:10000000}),r=new CropRows(huge,{x:0,z:0},{axis:'z',low:true});
for(const n of [0n,59999999n,huge.layer-1n])assert.equal(r.index(r.cell(n,66)),n);
assert(!Object.values(r).some(Array.isArray),'constant memory, no full cuboid allocation');passed++;
console.log(`Crop three-deep planner tests passed: ${passed} cases; X/Z, reversed/negative, 1/2-cell tails, garden-only shared stance, huge constant-memory area.`);
