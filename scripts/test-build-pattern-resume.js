'use strict';
const assert=require('assert'),{Vec3}=require('vec3');
const {region,AutoBuild}=require('../src/main/bot/auto-build');
const {SolidPattern,firstPending,choosePattern,rememberPattern,restorePattern,runSolidPattern}=require('../src/main/bot/build-solid-pattern');
function fixture(){
 const area=region({x:0,y:71,z:0},{x:3,y:71,z:6}),map=new Map(),unknown=new Set(),calls=[];
 const b={version:'26.1',game:{dimension:'overworld',minY:-64,height:384},entity:{position:new Vec3(.5,69.875,3.5)}};
 b.blockAt=q=>{const p=q.floored(),k=`${p.x},${p.y},${p.z}`;return unknown.has(k)?null:{name:map.get(k)||'air',stateId:map.has(k)?1:0,position:p};};
 const a={area,block:{name:'soul_sand'},bot:b,solidPattern:true,patternReady:true,check:()=>{},error:code=>Object.assign(Error(code),{code}),vec:p=>new Vec3(p.x,p.y,p.z),diagnostic:()=>{},references:()=>[{}]};
 a.rows=new SolidPattern(area,b.entity.position,{x:0,y:71,z:0},'z');a.air=p=>b.blockAt(a.vec(p))?.name==='air';
 a.patternStands=(p,q)=>{calls.push({...p});return [{}];};
 const put=(i,name='soul_sand')=>{const p=a.rows.cell(BigInt(i),71),k=`${p.x},${p.y},${p.z}`;if(name==='air')map.delete(k);else map.set(k,name);};
 return {a,b,map,unknown,calls,put};
}
async function main(){let passed=0;
 {const f=fixture();for(let i=0;i<5;i++)f.put(i);let n=await firstPending(f.a,f.a.rows,1);assert.equal(n.index,5n);assert.equal(n.prefix,5n);passed++;
  f.put(5);n=await firstPending(f.a,f.a.rows,1);assert.equal(n.index,6n,'late real ACK after Pause is skipped');passed++;
  f.put(1,'air');n=await firstPending(f.a,f.a.rows,1);assert.equal(n.index,1n,'removed prior block is not silently skipped');passed++;
 }
 {const f=fixture();for(let i=0;i<27;i++)f.put(i);const n=await firstPending(f.a,f.a.rows,1);assert(n.manual&&!n.filled);assert.equal(n.index,27n);passed++;f.put(27);assert((await firstPending(f.a,f.a.rows,1)).filled);passed++;}
 {const f=fixture();f.unknown.add('0,71,0');await assert.rejects(firstPending(f.a,f.a.rows,1),e=>e.code==='chunk_unloaded');passed++;}
 {const f=fixture();f.a.check=()=>{throw f.a.error('cancelled');};await assert.rejects(firstPending(f.a,f.a.rows,1),e=>e.code==='cancelled');passed++;}
 {const f=fixture();for(let i=0;i<10;i++)f.put(i);f.a.patternReady=false;await choosePattern(f.a,1);const n=await firstPending(f.a,f.a.rows,1);assert(n.prefix>=10n);assert(f.calls.every(p=>f.a.air(p)||f.a.rows.index(p)===27n),'candidate stances are evaluated at an empty frontier, not a filled corner');passed++;}
 {const f=fixture();rememberPattern(f.a);const corner={...f.a.rows.corner},depth=f.a.rows.depth;f.b.entity.position=new Vec3(2.5,69.875,6.5);f.a.patternReady=false;assert(restorePattern(f.a));assert.deepEqual(f.a.rows.corner,corner);assert.equal(f.a.rows.depth,depth);passed++;}
 {const f=fixture();f.a.lastPlaceAt=Date.now();rememberPattern(f.a);const sent=f.a.lastPlaceAt;f.a.lastPlaceAt=-Infinity;assert(restorePattern(f.a));assert.equal(f.a.lastPlaceAt,sent,'restart keeps the real last-send spacing');passed++;}
 {const a=new AutoBuild(null);a.patternCheckpoint={};a.stop('world_changed');assert.equal(a.patternCheckpoint,null);passed++;}
 for(const change of ['bot','dimension','bounds','block','version']){
  const f=fixture();rememberPattern(f.a);
  if(change==='bot')f.a.bot={...f.b};if(change==='dimension')f.b.game.dimension='the_nether';if(change==='bounds')f.a.area=region({x:0,y:71,z:0},{x:4,y:71,z:6});if(change==='block')f.a.block={name:'stone'};if(change==='version')f.b.version='1.21.4';
  assert(!restorePattern(f.a));assert.equal(f.a.patternCheckpoint,null);passed++;
 }
 {const a=new AutoBuild(null);a.preview=()=>({ok:true});a.movementHoldUntil=Date.now()+10000;assert.equal(a.start({currentWindow:null},{}).error,'movement_cooldown');passed++;
 a.movementHoldUntil=0;a.trafficHoldUntil=Date.now()+10000;assert.equal(a.start({currentWindow:null},{}).error,'packet_cooldown');passed++;}
 {const f=fixture(),a=f.a;a.area=region({x:0,y:71,z:0},{x:3,y:72,z:6});a.rows=new SolidPattern(a.area,f.b.entity.position,{x:0,y:71,z:0},'z');
  for(let y=71;y<=72;y++)for(let i=0n;i<a.area.layer;i++){const p=a.rows.cell(i,y);if(y!==72||i!==a.area.layer-1n)f.map.set(`${p.x},${p.y},${p.z}`,'soul_sand');}
  const last=a.rows.last(72);f.b.entity.position=new Vec3(last.x+.5,71.875,last.z+.5);a.layerY=71;a.placed=a.skipped=a.finishedVolume=a.layerBasePlaced=0n;a.manualRemaining=0;
  const walked=[];a.settle=async()=>{};a.setPhase=()=>{};a.patternWalk=async p=>walked.push(p);a.bodyClear=a.safeFooting=()=>true;a.notify=a.release=()=>{};a.safety={inside:()=>true,plan:async()=>{throw Error('must not walk out of an already filled prior layer');}};
  await runSolidPattern(a,1);assert.equal(a.status,'complete');assert.equal(a.manualRemaining,1);assert.equal(walked.length,1);assert.equal(walked[0].y,72);assert.equal(a.cursor,a.area.total-1n);passed++;
 }
 console.log(`Solid resume/restart tests passed: ${passed} cases; real frontier scan, late ACK, removed blocks, manual last cell, unknown/cancel, filled-corner avoidance, pinned same-job orientation, scope invalidation and unchanged cooldowns.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
