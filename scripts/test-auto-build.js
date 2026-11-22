'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const { AutoBuild, region, cell } = require('../src/main/bot/auto-build');
class Vec {
  constructor(x,y,z){this.x=x;this.y=y;this.z=z;}
  offset(x,y,z){return new Vec(this.x+x,this.y+y,this.z+z);}
  plus(v){return this.offset(v.x,v.y,v.z);} minus(v){return this.offset(-v.x,-v.y,-v.z);}
  scaled(n){return new Vec(this.x*n,this.y*n,this.z*n);} norm(){return Math.hypot(this.x,this.y,this.z);}
  equals(v){return this.x===v.x&&this.y===v.y&&this.z===v.z;} clone(){return new Vec(this.x,this.y,this.z);}
  floored(){return new Vec(Math.floor(this.x),Math.floor(this.y),Math.floor(this.z));}
  distanceTo(v){return this.minus(v).norm();}
}
class Goal { constructor(x,y,z){Object.assign(this,{x,y,z});} }
const adapter = {Vec3:Vec,goals:{GoalBlock:Goal,GoalNearXZ:Goal,GoalCompositeAny:class{constructor(goals){this.goals=goals;}}},navigate:async(bot,goal,check)=>{check();const g=goal.goals?.[0]||goal;bot.entity.position=new Vec(g.x+.5,g.y??1,g.z+.5);}};
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=8000){const end=Date.now()+ms;while(!fn()&&Date.now()<end)await sleep(10);assert(fn(),'deadline');}
function bot(count=30){
 const b=new EventEmitter();b.physicsEnabled=false;b.game={minY:0,height:256};b.entity={position:new Vec(-1.5,1,.5),onGround:true};
 b.registry={blocksArray:[{name:'air',id:0},{name:'stone',id:1}],itemsByName:{stone:{id:1,name:'stone'}},items:{}};
 b.map=new Map();b.writes=[];b.amount=count;
 b.inventory={items:()=>b.amount?[{name:'stone',count:b.amount}]:[]};
 b.blockAt=p=>{p=p.floored();const name=b.map.get(`${p.x},${p.y},${p.z}`)||(p.y===0?'stone':'air');return{name,position:p,boundingBox:name==='air'?'empty':'block',shapes:name==='air'?[]:[[0,0,0,1,1,1]]};};
 b.equip=async i=>{b.heldItem=i;};b.lookAt=async()=>{};b.clearControlStates=()=>{};b.setControlState=()=>{};
 b.pathfinder={setGoal:()=>{}};
 b._placeBlockWithOptions=async(ref,face)=>{const p=ref.position.plus(face);b.writes.push(p);b.map.set(`${p.x},${p.y},${p.z}`,'stone');b.amount--;};
 return b;
}
const spec=(a={x:0,y:1,z:0},c={x:1,y:2,z:0})=>({corner1:a,corner2:c,block:'stone'});
async function main(){
 let tests=0;
 const r=region({x:2,y:3,z:1},{x:0,y:1,z:0});assert.equal(r.total,18n);tests++;
 const ordered=Array.from({length:18},(_,i)=>cell(r,BigInt(i)));assert(ordered.every((p,i)=>!i||p.y>=ordered[i-1].y));assert.deepEqual(ordered.slice(0,6).map(p=>p.x),[0,1,2,2,1,0]);tests++;
 const huge=region({x:-29999983,y:-64,z:-29999983},{x:29999983,y:319,z:29999983});assert(huge.total>BigInt(Number.MAX_SAFE_INTEGER));assert.deepEqual(cell(huge,huge.total-1n),{x:29999983,y:319,z:29999983});assert.equal(Object.keys(huge).length,6);tests++;
 for(const bad of [{x:0.1,y:1,z:0},{x:0,y:320,z:0},{x:30000000,y:1,z:0},{x:NaN,y:1,z:0}])assert.throws(()=>region(bad,{x:0,y:1,z:0}));tests++;
 let b=bot(),a=new AutoBuild(null,adapter);assert(a.start(b,spec()).ok);assert(b.physicsEnabled&&b.__autoBuildInteracting);await until(()=>a.status==='complete');await until(()=>!a.worker);assert.deepEqual(b.writes.map(p=>p.y),[1,1,2,2]);assert.equal(a.state().placed,'4');assert(!b.physicsEnabled&&!b.__autoBuildInteracting);tests++;
 b=bot();b.map.set('0,1,0','stone');a=new AutoBuild(null,adapter);a.start(b,spec({x:0,y:1,z:0},{x:1,y:1,z:0}));await until(()=>a.status==='complete');assert.equal(a.state().skipped,'1');assert.equal(b.writes.length,1);tests++;
 b=bot(1);a=new AutoBuild(null,adapter);a.start(b,spec({x:0,y:1,z:0},{x:1,y:1,z:0}));await until(()=>a.status==='paused');await until(()=>!a.worker);assert.equal(a.reason,'materials');assert.equal(a.cursor,1n);b.amount=1;assert(a.resume().ok);await until(()=>a.status==='complete');assert.equal(b.writes.length,2);tests++;
 b=bot();a=new AutoBuild(null,adapter);let release; b.lookAt=()=>new Promise(r=>release=r);a.start(b,spec());await until(()=>!!release);a.pause();assert(!a.resume().ok);release();await until(()=>!a.worker);assert.equal(b.writes.length,0);assert.equal(a.cursor,0n);b.lookAt=async()=>{};a.resume();await until(()=>a.status==='complete');tests++;
 b=bot();a=new AutoBuild(null,adapter);b._placeBlockWithOptions=async()=>{throw Error('server denied');};a.start(b,spec());await until(()=>a.status==='paused');assert.equal(a.cursor,0n);assert.equal(a.reason,'placement_failed');a.stop();tests++;
 b=bot();a=new AutoBuild(null,adapter);b._placeBlockWithOptions=async()=>{};a.start(b,spec());await until(()=>a.status==='paused');assert.equal(a.reason,'server_refused');assert.equal(a.placed,0n);a.stop();tests++;
 b=bot();a=new AutoBuild(null,adapter);a.start(b,spec());b.emit('respawn');await until(()=>!a.worker);assert.equal(a.status,'stopped');assert.equal(a.reason,'world_changed');assert.equal(b.listenerCount('respawn'),0);assert(!a.resume().ok);tests++;
 b=bot();a=new AutoBuild(null,adapter);a.start(b,spec());b.emit('windowOpen');await until(()=>!a.worker);assert.equal(a.status,'paused');assert.equal(a.reason,'window_open');a.stop();tests++;
 b=bot();a=new AutoBuild(null,adapter);assert(!a.start(b,{...spec(),block:'air'}).ok);tests++;
 b=bot();a=new AutoBuild(null,{...adapter,navigate:async()=>{throw Object.assign(Error('no path'),{code:'no_path'});}});b.entity.position=new Vec(-20,1,0);a.start(b,spec());await until(()=>a.status==='paused');assert.equal(a.reason,'no_path');assert.equal(a.cursor,0n);assert.equal(b.writes.length,0);a.stop();tests++;
 b=bot();a=new AutoBuild(null,adapter);a.bot=b;a.Vec3=Vec;assert(a.collision({x:-2,y:1,z:0}));assert(!a.collision({x:2,y:1,z:0}));tests++;
 b.map.set('-1,1,0','stone');assert(!a.sight(new Vec(-2,2.5,.5),{ref:b.blockAt(new Vec(0,0,0)),aim:new Vec(.5,1,.5)}));tests++;

 // Native look's promise can finish after yaw while pitch is still in flight.
 b=bot();a=new AutoBuild(null,adapter);a.bot=b;a.status='running';a.epoch=1;b.waitForTicks=()=>{};b.__kbMotionTracing=true;b.entity.yaw=0;b.entity.pitch=0;
 b.look=async(yaw,pitch)=>{b.entity.yaw=yaw;b.entity.pitch=pitch;b.emit('kb:view-sent',{yaw:(Math.PI-yaw)*180/Math.PI,pitch:5});setTimeout(()=>b.emit('kb:view-sent',{yaw:(Math.PI-yaw)*180/Math.PI,pitch:-pitch*180/Math.PI}),90);};
 let done=false;const aiming=a.aim(new Vec(-1.5,1,.5),1).then(()=>done=true);await sleep(35);assert(!done,'yaw-only completion must not allow placement');await aiming;assert(done);assert.equal(b.listenerCount('kb:view-sent'),0);tests++;
 b=bot();a=new AutoBuild(null,adapter);a.bot=b;a.status='running';a.epoch=1;b.waitForTicks=()=>{};b.__kbMotionTracing=true;b.entity.yaw=0;b.entity.pitch=0;b.look=async(yaw,pitch)=>{b.entity.yaw=yaw;b.entity.pitch=pitch;};
 const cancelled=a.aim(new Vec(-1.5,1,.5),1);const rejected=assert.rejects(cancelled,e=>e.code==='cancelled');await sleep(30);a.pause();await rejected;assert.equal(b.writes.length,0);assert.equal(b.listenerCount('kb:view-sent'),0);a.stop();tests++;
 b=bot();const blockAt=b.blockAt;b.blockAt=q=>{const v=blockAt(q);if(v.position.y===0){v.name='soul_sand';v.shapes=[[0,0,0,1,.875,1]];}return v;};a=new AutoBuild(null,adapter);a.bot=b;a.Vec3=Vec;
 const top=a.references({x:0,y:1,z:0})[0];assert.equal(top.delta.y,.875);assert.equal(top.aim.y,.875);tests++;
 // An already usable face ends navigation before an unnecessarily exact cell.
 b=bot();a=new AutoBuild(null);a.bot=b;a.status='running';a.epoch=1;let goalsCleared=0;
 b.pathfinder.setGoal=g=>{if(g)setTimeout(()=>{b.entity.position.x=.5;b.emit('physicsTick');},30);else goalsCleared++;};
 await a.navigate({isEnd:()=>false},1,()=>b.entity.position.x>0);assert(goalsCleared);assert.equal(b.listenerCount('physicsTick'),0);assert.equal(b.listenerCount('path_update'),0);tests++;
 b=bot();a=new AutoBuild(null,adapter);a.bot=b;a.status='running';a.epoch=1;let observed;
 b.look=async(yaw,pitch)=>{observed=pitch;};await a.aim(new Vec(.5,1,.5),1,1.27);assert(Math.abs(observed-Math.atan2(-1.27,2))<.000001,'crouch eye height used before click');tests++;
 console.log(`Auto Build tests passed: ${tests} scenarios.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
