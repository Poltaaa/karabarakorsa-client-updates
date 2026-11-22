'use strict';
// Offline async-boundary tests: no external account, no fake network ACK.
const assert=require('assert'),{Vec3}=require('vec3');
const {AutoBuild,region}=require('../src/main/bot/auto-build');
const {CropRows}=require('../src/main/bot/build-crop-rows');
const {world}=require('./test-build-local');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(b,block='stone'){
 const a=new AutoBuild(null);assert(a.start(b,{corner1:{x:2,y:1,z:0},corner2:{x:2,y:1,z:0},block}).ok);
 a.pause();while(a.worker)await sleep(10);a.status='running';a.epoch++;return a;
}
async function main(){let passed=0;
 for(const stage of ['equip','gate','aim','final']){
  const w=world('flat'),b=w.b;let a;
  try{
   const item={name:'stone',count:64};let disturbed=false,equips=0,walks=0,checks=0;
   b.inventory.items=()=>[item];a=await ready(b);a.rows=null;
   a.approach=async()=>{walks++;};a.settle=async()=>{};
   const disturb=where=>{if(stage===where&&!disturbed){disturbed=true;b.heldItem=null;}};
   b.equip=async i=>{equips++;b.heldItem=i;disturb('equip');};
   a.placementSpacing=async()=>disturb('gate');a.aim=async()=>disturb('aim');
   a.safety.plan=async()=>{checks++;disturb('final');return {path:[],end:b.entity.position.clone()};};
   assert(await a.placeOne({x:2,y:1,z:0},a.epoch));
   assert(disturbed);assert.equal(equips,2);assert.equal(walks,1);assert.equal(b.writes.length,1);assert.equal(a.placed,1n);
   if(stage==='final')assert.equal(checks,2,'escape proof is recomputed after inventory refill');passed++;
  }finally{a?.stop();w.stop();}
 }
 // Explicit Pause during restock must cancel without equipping or sending.
 {const w=world('flat'),b=w.b;let a;try{
  const item={name:'stone',count:64};b.inventory.items=()=>[item];a=await ready(b);a.rows=null;
  a.approach=async()=>{};a.settle=async()=>{};a.placementSpacing=async()=>{b.heldItem=null;};
  setTimeout(()=>a.pause('manual'),50);
  await assert.rejects(a.placeOne({x:2,y:1,z:0},a.epoch),e=>e.code==='cancelled');assert.equal(b.writes.length,0);passed++;
 }finally{a?.stop();w.stop();}}
 // The same target can use its confirmed own floor despite a strip-side
 // stance preference; this does not skip the post-placement escape proof.
 for(const owned of [true,false]){const w=world('flat'),b=w.b;let a;try{
  a=await ready(b);if(owned)a.safety.remember({x:2,y:0,z:0});
  let modes=[],proofs=0;a.approach=async(_p,_t,_e,_o,row)=>{modes.push(row);if(row)throw a.error('unsafe_stance');};
  a.settle=async()=>{};a.aim=async()=>{};a.standAllowed=()=>true;
  a.safety.plan=async(_t,add)=>{if(add?.length){proofs++;return {path:[],end:b.entity.position.clone()};}return null;};
  a.safety.continuation=async()=>true;
  if(owned){assert(await a.placeOne({x:2,y:1,z:0},a.epoch));assert.deepEqual(modes,[true,false]);assert.equal(proofs,1);assert.equal(b.writes.length,1);}
  else{await assert.rejects(a.placeOne({x:2,y:1,z:0},a.epoch));assert(!modes.includes(false));assert.equal(b.writes.length,0);}passed++;
 }finally{a?.stop();w.stop();}}
 // Incomplete grid arrival gets one fresh walk, never an inside reseal.
 for(const clears of [true,false]){const w=world('flat'),b=w.b;let a;try{
  a=await ready(b);b.physicsEnabled=false;b.entity.position=new Vec3(2.5,1,.5);
  let walks=0,replans=0;a.navigate=async()=>{walks++;if(clears&&walks===2)b.entity.position=new Vec3(-2.5,1,.5);};a.settle=async()=>{};
  a.safety.plan=async()=>{replans++;return {path:[{x:-3,y:1,z:0}],end:new Vec3(-2.5,1,.5)};};
  const operation=a.safety.exit({path:[{x:1,y:1,z:0}],end:new Vec3(1.5,1,.5)},a.epoch);
  if(clears)await operation;else await assert.rejects(operation,e=>e.code==='exit_not_reached');
  assert.equal(walks,2);assert.equal(replans,1);assert.equal(b.writes.length,0);passed++;
 }finally{a?.stop();w.stop();}}
 for(const depth of ['x','z'])for(const low of [true,false])for(const len of [1,2,3,4,5,6,7]){
  const area=region({x:0,y:66,z:0},{x:depth==='x'?len-1:3,y:66,z:depth==='z'?len-1:3});
  const r=new CropRows(area,{x:.5,z:.5},{axis:depth,low});
  for(let i=0n;i<area.layer;i++){
   const p=r.cell(i,66),info=r.describe(p);if(info.band*3+info.len<Number(r.length))continue;
   const q=r.stance(p);assert.equal(q[depth],info.near+.5,'terminal stance at near end, never trio centre');
   const click=p[depth]+.5-r.sign*.38;
   for(const drift of [-.12,0,.12])assert((click-q[depth]-drift)*r.sign<0,'all terminal crop clicks face the same depth direction');
  }passed++;
 }
 console.log(`Refill/own-floor/terminal tests passed: ${passed} cases; bounded refill, cancellation, fresh proof, no unowned-floor fallback, same-direction terminal clicks.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
