'use strict';
const assert=require('assert'),{world}=require('./test-build-local'),{AutoBuild}=require('../src/main/bot/auto-build'),{rowStrafe}=require('../src/main/bot/build-strafe'),{Vec3}=require('vec3');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(depth,sign,floor,version){
 const w=world(floor,version),b=w.b,y=floor==='slow'?.875:1,other=depth==='x'?'z':'x';
 b.entity.position=new Vec3(-.5,y,.5);if(depth==='z')b.entity.position=new Vec3(.5,y,-.5);
 const start=b.entity.position.clone(),a=new AutoBuild(null);
 assert(a.start(b,{corner1:{x:0,y:2,z:0},corner2:{x:depth==='x'?2:4,y:2,z:depth==='z'?2:4},block:'stone'}).ok);a.pause();while(a.worker)await sleep(10);a.status='running';const token=++a.epoch;
 // Explicit fixture world orientation and initial row, before any work.
 a.rows.depth=depth;a.rows.cross=other;a.rows.sign=-1;a.rows.far=2;a.rows.length=3n;a.rows.width=5n;
 b.entity.yaw=depth==='x'?-Math.PI/2:Math.PI;
 const p=depth==='x'?{x:2,y:2,z:sign}:{x:sign,y:2,z:2};const target=a.rows.stance(p);
 return {w,b,a,token,p,target,start};
}
async function main(){let passed=0;
 for(const version of ['1.20.1','26.1'])for(const floor of ['flat','slow'])for(const depth of ['x','z'])for(const sign of [-1,1]){
  const f=await setup(depth,sign,floor,version);const {w,b,a,token,p,target,start}=f;
  let lookCalls=0,lateralTicks=0;const oldLook=b.look;b.look=async(...args)=>{lookCalls++;return oldLook(...args);};
  // Test focuses on movement; reference/raycast placement remains covered by
  // full native fixtures. Real body/support, route and physics are NOT mocked.
  const originalUsable=a.usable;a.usable=()=>true;const originalStand=a.standAllowed;a.standAllowed=pos=>true;
  b.on('physicsTick',()=>{if(a.phase==='strafe'){assert(!b.controlState.forward&&!b.controlState.back&&!b.controlState.jump&&!b.controlState.sprint);if(b.controlState.left||b.controlState.right)lateralTicks++;}});
  try{const result=await rowStrafe(a,p,token,[]);assert(result,`${depth}/${sign}/${floor} failed`);assert(Math.abs(b.entity.position[a.rows.cross]-target[a.rows.cross])<.11);assert(Math.abs(b.entity.position[depth]-start[depth])<.001);assert.equal(lookCalls,0);assert(lateralTicks>0);assert(a.safeFooting(b.entity.position));passed++;}
  finally{a.usable=originalUsable;a.standAllowed=originalStand;a.stop();w.stop();}
 }
 // Unknown support/obstacle blocks deny the shortcut without synthetic moves.
 for(const kind of ['unknown','wall','cancel']){const f=await setup('x',1,'slow','26.1');const {w,b,a,p,token}=f;try{
  const old=b.blockAt;if(kind==='unknown')b.blockAt=q=>q.z>.9?null:old(q);if(kind==='wall')b.put(new Vec3(-1,1,1),'stone');
  if(kind==='cancel')a.pause();const before=b.entity.position.clone();
  if(kind==='cancel')await assert.rejects(rowStrafe(a,p,token,[]),e=>e.code==='cancelled');else assert.equal(await rowStrafe(a,p,token,[]),false);
  assert(b.entity.position.distanceTo(before)<.21);if(kind!=='unknown')assert(a.bodyClear(b.entity.position));assert(!b.controlState.left&&!b.controlState.right);passed++;
 }finally{a.stop();w.stop();}}
 for(const kind of ['lock-before','lock-during']){
  const f=await setup('x',1,'slow','26.1'),{w,b,a,p,token}=f;
  const lock=()=>{b.entity.attributes['minecraft:movement_speed']={value:0,modifiers:[]};};
  if(kind==='lock-before')lock();
  else b.on('physicsTick',()=>{if(a.phase==='strafe'&&(b.controlState.left||b.controlState.right))lock();});
  try{
   await assert.rejects(rowStrafe(a,p,token,[]),e=>e.code==='movement_disabled');
   assert(!b.controlState.left&&!b.controlState.right&&!b.controlState.forward,'server lock releases native controls');passed++;
  }finally{a.stop();w.stop();}
 }
 console.log(`Natural A/D row tests passed: ${passed} cases, both world axes/directions, no camera turns, unknown/wall/cancel safety.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
