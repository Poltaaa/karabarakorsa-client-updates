'use strict';
// Dependency-free planning/ownership/cancellation regressions. Native physics,
// actual wire angles, dig ACK and escape/reseal are covered by build-network.
const assert=require('assert'),{EventEmitter}=require('events');
const {AutoBuild,region}=require('../src/main/bot/auto-build'),{BuildSafety}=require('../src/main/bot/build-safety');
class V {
 constructor(x,y,z){Object.assign(this,{x,y,z});}offset(x,y,z){return new V(this.x+x,this.y+y,this.z+z);}plus(v){return this.offset(v.x,v.y,v.z);}minus(v){return this.offset(-v.x,-v.y,-v.z);}scaled(n){return new V(this.x*n,this.y*n,this.z*n);}norm(){return Math.hypot(this.x,this.y,this.z);}distanceTo(v){return this.minus(v).norm();}equals(v){return this.x===v.x&&this.y===v.y&&this.z===v.z;}clone(){return new V(this.x,this.y,this.z);}floored(){return new V(Math.floor(this.x),Math.floor(this.y),Math.floor(this.z));}
}
class G{constructor(x,y,z){Object.assign(this,{x,y,z});}}
const adapter={Vec3:V,goals:{GoalBlock:G,GoalNearXZ:G,GoalCompositeAny:class{constructor(goals){this.goals=goals;}}},navigate:async(b,g,check)=>{check();const q=g.goals?.[0]||g;b.entity.position=new V(q.x+.5,q.y||1,q.z+.5);}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,ms=9000){const end=Date.now()+ms;while(!fn()&&Date.now()<end)await sleep(10);assert(fn(),'planner deadline');}
const names=['air','stone','soul_sand','dirt','oak_planks','spawner'];
function fixture(){
 const b=new EventEmitter();b._client=new EventEmitter();b.physicsEnabled=false;b.game={minY:0,height:256};b.entity={position:new V(-1.5,1,.5),velocity:new V(0,0,0),onGround:true,yaw:0,pitch:0};b.map=new Map();b.amount=100;b.writes=[];
 b.registry={blocksArray:names.map((name,id)=>({name,id})),blocksByName:Object.fromEntries(names.map((name,id)=>[name,{name,id,minStateId:id}])),itemsByName:Object.fromEntries(names.map((name,id)=>[name,{name,id}])),items:{}};
 b.blockAt=q=>{const p=q.floored(),name=b.map.get(`${p.x},${p.y},${p.z}`)||(p.y===0?'stone':'air');return {name,type:names.indexOf(name),stateId:names.indexOf(name),position:p,boundingBox:name==='air'?'empty':'block',shapes:name==='air'?[]:[[0,0,0,1,name==='soul_sand'?.875:1,1]]};};
 b.put=(p,name)=>{b.map.set(`${p.x},${p.y},${p.z}`,name);b.emit('blockUpdate',null,b.blockAt(p));};
 b._client.on('block_change',p=>b.put(new V(p.location.x,p.location.y,p.location.z),names[p.type]));
 b.inventory={items:()=>b.amount?[{name:b.material||'stone',type:b.registry.itemsByName[b.material||'stone'].id,count:b.amount}]:[]};
 b.equip=async i=>b.heldItem=i;b.look=async(y,p)=>{b.entity.yaw=y;b.entity.pitch=p;};b.lookAt=async()=>{};b.pathfinder={setGoal:()=>{}};b.setControlState=()=>{};b.clearControlStates=()=>{};b.stopDigging=()=>{};b.digTime=()=>10;
 b._placeBlockWithOptions=async(ref,face)=>{const p=ref.position.plus(face);b.put(p,b.heldItem.name);b.writes.push(p);b.amount--;};return b;
}
function spec(y=1,x=2){return {corner1:{x:0,y,z:0},corner2:{x,y,z:0},block:'stone',rescueOwn:true};}
async function ready(b,ad=adapter,s=spec()){const a=new AutoBuild(null,ad);assert(a.start(b,s).ok);a.pause();await until(()=>!a.worker);a.status='running';++a.epoch;return a;}
async function main(){let passed=0;
 for(const seed of [-1,5]) {const b=fixture();b.put(new V(seed,3,0),'oak_planks');b.entity.position=new V(seed<0?-1.5:6.5,1,.5);const a=new AutoBuild(null,adapter);try{assert(a.start(b,spec(3,4)).ok);await until(()=>a.status!=='running');assert.equal(a.status,'complete');assert.equal(a.placed,5n);assert.equal(b.blockAt(new V(seed,3,0)).name,'oak_planks');assert(b.writes.every(p=>p.y===3));passed++;}finally{a.stop();}}
 let b=fixture(),a=await ready(b);try{
  const ref=b.blockAt(new V(2,1,0));b.put(new V(2,1,0),'stone');const r=b.blockAt(new V(2,1,0)),eye=new V(.5,1.5,.5);
  assert(!a.sight(eye,{ref:r,face:new V(1,0,0),aim:new V(3,1.5,.5)}));assert(a.sight(eye,{ref:r,face:new V(-1,0,0),aim:new V(2,1.5,.5)}));passed++;
  const old=b.blockAt;b.blockAt=q=>{const out=old(q);if(out.position.equals(new V(1,1,0))){out.name='stone';out.shapes=[[.005,0,0,.01,1,1]];}return out;};assert(!a.sight(eye,{ref:r,face:new V(-1,0,0),aim:new V(2,1.5,.5)}),'thin occluder cannot be missed');passed++;
 }finally{a.stop();}
 b=fixture();a=await ready(b);try{
  const p={x:1,y:1,z:0};b.put(a.vec(p),'soul_sand');assert(!a.safety.own(p),'pre-existing matching block is not owned');a.safety.remember(p);assert(a.safety.own(p),'owned soul sand may be a rescue wall');passed++;
  b.put(a.vec(p),'dirt');assert(!a.safety.own(p),'changed block loses ownership');b.put(a.vec(p),'spawner');a.safety.remember(p);assert(!a.safety.own(p),'protected block never becomes rescue material');passed++;
  for(let i=0;i<4100;i++){const q={x:i,y:1,z:2};b.put(a.vec(q),'stone');a.safety.remember(q);}assert.equal(a.safety.owned.size,4096);assert(!a.safety.own({x:0,y:1,z:2}));passed++;
  a.area=region({x:0,y:1,z:0},{x:10000,y:1,z:0});for(let i=0;i<10000;i++)a.enqueue({x:i,y:1,z:0});assert.equal(a.frontier.length,128);passed++;
 }finally{a.stop();}
 b=fixture();a=await ready(b,{...adapter,exit:async()=>{}});try{
  b.entity.position=new V(.5,1,.5);a.safety.repairs.set('0,1,0',{p:{x:0,y:1,z:0}});
  await assert.rejects(a.safety.exit({path:[],end:new V(-2,1,0)},a.epoch),e=>e.code==='exit_not_reached');assert.equal(b.writes.length,0);passed++;
  await assert.rejects(a.safety.close(a.epoch),e=>e.code==='exit_not_reached');assert.equal(b.writes.length,0);passed++;
 }finally{a.stop();}
 b=fixture();a=await ready(b,{...adapter,escape:async()=>null});try{
  b.entity.position=new V(.5,.875,.5);b.put(new V(0,0,0),'soul_sand');a.safety.remember({x:0,y:0,z:0});
  await assert.rejects(a.safety.recover(a.epoch),e=>e.code==='rescue_unavailable');assert.equal(a.safety.broken,0);passed++;
 }finally{a.stop();}
 b=fixture();a=await ready(b);try{
  const p={x:1,y:1,z:0};b.put(a.vec(p),'stone');a.safety.remember(p);a.placed=1n;
  b.dig=async block=>{await b.lookAt();b.put(block.position,'air');};
  await assert.rejects(a.safety.digConfirmed(b.blockAt(a.vec(p)),a.epoch),e=>e.code==='rescue_denied');assert.equal(a.safety.broken,0);assert.equal(a.safety.repairs.size,0);assert.equal(a.placed,1n);passed++;
 }finally{a.stop();}
 b=fixture();a=await ready(b);try{
  const p={x:1,y:1,z:0};b.put(a.vec(p),'stone');a.safety.remember(p);a.placed=1n;
  b.dig=async block=>{await b.lookAt();setTimeout(()=>b._client.emit('block_change',{location:block.position,type:0}),70);await sleep(30);};
  const operation=a.safety.digConfirmed(b.blockAt(a.vec(p)),a.epoch);const rejected=assert.rejects(operation,e=>e.code==='cancelled');await sleep(10);a.pause();await rejected;await sleep(100);
  assert.equal(a.safety.repairs.size,1,'late actual ACK is recorded after Pause');assert.equal(a.safety.broken,1);assert.equal(b.writes.length,0,'Pause never starts exit or resealing');passed++;
 }finally{a.stop();}
 b=fixture();a=await ready(b);try{
  const p={x:1,y:1,z:0};b.equip=async i=>{b.heldItem=i;b.put(a.vec(p),'stone');};
  await a.placeOne(p,a.epoch);assert(!a.safety.own(p),'another player filling during equip must not be claimed');assert.equal(a.placed,0n);passed++;
 }finally{a.stop();}
 b=fixture();let attempts=0;const original=b._placeBlockWithOptions;b._placeBlockWithOptions=async(...args)=>{if(++attempts===1)throw Object.assign(Error('bad angle'),{code:'out_of_reach'});return original(...args);};a=new AutoBuild(null,adapter);
 try{assert(a.start(b,spec(1,0)).ok);await until(()=>a.status!=='running');assert.equal(a.status,'complete');assert(attempts>=2);assert.equal(a.placed,1n);passed++;}finally{a.stop();}
 b=fixture();a=await ready(b,{...adapter,escape:async(_b,_add,removed)=>removed.length?{path:[],end:new V(-2,1,0)}:null});
 try{b.entity.position=new V(.5,1,.5);b.put(new V(1,1,0),'stone');a.safety.remember({x:1,y:1,z:0});for(let i=0;i<32;i++)a.safety.repairs.set(String(i),{p:{x:100+i,y:1,z:0}});await assert.rejects(a.safety.recover(a.epoch),e=>e.code==='repair_pending');assert.equal(a.safety.broken,0);passed++;}finally{a.stop();}
 console.log(`Build frontier/escape/ownership tests passed: ${passed} scenarios.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
