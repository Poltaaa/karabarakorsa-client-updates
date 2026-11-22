'use strict';
const assert=require('assert'),{EventEmitter}=require('events'),{Vec3}=require('vec3');
const {AutoBuild,region}=require('../src/main/bot/auto-build'),{BuildRows}=require('../src/main/bot/build-rows'),{BuildSafety}=require('../src/main/bot/build-safety');
let passed=0;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function test(name,fn){await fn();passed++;}
function fixture(){
 const area=region({x:0,y:85,z:0},{x:5,y:85,z:1}),rows=new BuildRows(area,new Vec3(-1.5,83,.5),{axis:'x',low:true}),map=new Map(),calls=[];
 const a={area,rows,seedPlan:null,bot:{_client:new EventEmitter(),registry:{blocksByName:{}},blockAt:p=>({name:map.get(`${p.x},${p.y},${p.z}`)||'air'})},vec:p=>new Vec3(p.x,p.y,p.z),check:()=>{},error:code=>Object.assign(Error(code),{code})};
 const s=new BuildSafety(a);s.plan=async(...args)=>{calls.push(args);return {path:[],verified:true};};return {a,s,map,calls,p:rows.cell(0n,85)};
}
async function main(){
 await test('occupied upcoming row skipped',async()=>{const f=fixture(),one=f.a.rows.cell(1n,85),two=f.a.rows.cell(2n,85);f.map.set(`${one.x},85,${one.z}`,'stone');await f.s.continuation(1,f.p);const dest=f.calls[0][3],q=f.a.rows.stance(two);assert(dest.isEnd(new Vec3(q.x,83,q.z)));assert(!dest.isEnd(new Vec3(q.x,86,q.z)));});
 await test('all later cells occupied: still requires escape',async()=>{const f=fixture();for(let i=1n;i<f.a.area.layer;i++){const p=f.a.rows.cell(i,85);f.map.set(`${p.x},85,${p.z}`,'stone');}const result=await f.s.continuation(1,f.p);assert(result.verified);assert.equal(f.calls.length,1);assert.equal(f.calls[0][3],undefined);});
 await test('final cell never bypasses failed escape',async()=>{const f=fixture();f.s.plan=async()=>null;const p=f.a.rows.cell(f.a.area.layer-1n,85);assert.equal(await f.s.continuation(1,p),null);});
 await test('genuinely blocked upcoming air row remains blocked',async()=>{const f=fixture();f.s.plan=async()=>null;assert.equal(await f.s.continuation(1,f.p,{verified:true}),null);});
 await test('physical gap fallback keeps next stance and rejects roof',async()=>{
  const f=fixture();let count=0;
  f.s.plan=async(_token,add,_remove,destination)=>{
   assert.deepEqual(add,[f.p]);if(++count===1)return null;
   const next=f.a.rows.cell(1n,85),q=f.a.rows.stance(next);
   assert(destination.isEnd(new Vec3(q.x,83,q.z)));
   assert(!destination.isEnd(new Vec3(q.x,86,q.z)));
   assert(!destination.route(new Vec3(1.5,86,.5)));
   return {verified:true};
  };
  assert((await f.s.continuation(1,f.p)).verified);assert.equal(count,2);
 });
 await test('unloaded future cell is not completion',async()=>{const f=fixture();f.a.bot.blockAt=()=>null;await assert.rejects(f.s.continuation(1,f.p),e=>e.code==='chunk_unloaded');});
 await test('repair entries skipped like normal run loop',async()=>{const f=fixture(),one=f.a.rows.cell(1n,85),two=f.a.rows.cell(2n,85);f.s.repairs.set(`${one.x},85,${one.z}`,{p:one});await f.s.continuation(1,f.p);const q=f.a.rows.stance(two);assert(f.calls[0][3].isEnd(new Vec3(q.x,83,q.z)));});
 await test('occupied seed continuation skipped',async()=>{const f=fixture();f.a.seedPlan={column:0,side:1};const p={x:0,y:85,z:0};f.map.set('1,85,0','stone');await f.s.continuation(1,p);const q=f.a.rows.stance({x:2,y:85,z:0},f.a.seedPlan);assert(f.calls[0][3].isEnd(new Vec3(q.x,83,q.z)));});
 await test('seed endpoint uses real escape',async()=>{const f=fixture();f.a.seedPlan={column:0,side:1};await f.s.continuation(1,{x:5,y:85,z:0});assert.equal(f.calls[0][3],undefined);});
 await test('send gap waits for actual interval',async()=>{const a=new AutoBuild(null);a.bot={};a.status='running';a.epoch=1;a.lastPlaceAt=Date.now();const start=Date.now();await a.placementSpacing(1);assert(Date.now()-start>=270);});
 await test('elapsed ack time consumes gap, no fixed post-ack sleep',async()=>{const a=new AutoBuild(null);a.bot={};a.status='running';a.epoch=1;a.lastPlaceAt=Date.now()-400;const start=Date.now();await a.placementSpacing(1);assert(Date.now()-start<200);});
 await test('gap remains cancellable',async()=>{const a=new AutoBuild(null);a.bot={};a.status='running';a.epoch=1;a.lastPlaceAt=Date.now();const task=a.placementSpacing(1);const reject=assert.rejects(task,e=>e.code==='cancelled');await sleep(30);a.pause();await reject;});
 console.log(`Placement spacing/real-next-cell tests passed: ${passed} scenarios.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
