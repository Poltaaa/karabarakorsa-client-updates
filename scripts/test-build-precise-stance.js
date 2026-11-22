'use strict';
const assert=require('assert'),{Vec3}=require('vec3');
const {AutoBuild,region}=require('../src/main/bot/auto-build');
const {SolidPattern}=require('../src/main/bot/build-solid-pattern');
const {preciseStance}=require('../src/main/bot/build-precise-stance');
const {world}=require('./test-build-local');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(b){
 const a=new AutoBuild(null);assert(a.start(b,{corner1:{x:4,y:1,z:4},corner2:{x:10,y:1,z:10},block:'stone'}).ok);
 a.pause();while(a.worker)await sleep(10);a.status='running';a.epoch++;a.rows=new SolidPattern(a.area,b.entity.position,{x:4,y:1,z:4},'x');return a;
}
async function main(){let passed=0;
 for(const kind of ['flat','slow'])for(const axis of ['x','z'])for(const direction of [-1,1]){
  const w=world(kind),b=w.b;let a;
  try{
   a=await ready(b);b.clearControlStates();const q={x:.5,z:.5};q[axis]+=direction*.32;
   await preciseStance(a,{x:4,y:1,z:4},q,a.epoch);
   assert(Math.hypot(b.entity.position.x-q.x,b.entity.position.z-q.z)<.1);
   assert(Math.hypot(b.entity.velocity.x,b.entity.velocity.z)<.003);assert(b.maxStep<.3);
   assert.equal(b.writes.length,0);passed++;
  }finally{a?.stop();w.stop();}
 }
 const w=world('slow');let a;try{
  a=await ready(w.b);const operation=preciseStance(a,{x:4,y:1,z:4},{x:1.3,z:.5},a.epoch);
  const check=assert.rejects(operation,e=>e.code==='cancelled');setTimeout(()=>a.pause('manual'),10);await check;
  assert(!Object.values(w.b.controlState).some(Boolean));assert.equal(w.b.writes.length,0);passed++;
 }finally{a?.stop();w.stop();}
 console.log(`Precise native stance tests passed: ${passed} cases; four directions, stone/soul-sand braking and cancellation, no coordinate/velocity or placement writes.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
