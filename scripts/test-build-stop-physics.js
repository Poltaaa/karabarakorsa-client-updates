'use strict';
const assert=require('assert'),{EventEmitter}=require('events');
const {AutoBuild}=require('../src/main/bot/auto-build');
const {drainNativeStop}=require('../src/main/bot/build-stop-physics');
const {world}=require('./test-build-local');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){let passed=0;
 for(const kind of ['flat','slow']){
  const w=world(kind),b=w.b;let a;
  try{
   b._client.state='play';const original=b.physics.simulatePlayer;
   a=new AutoBuild(null);assert(a.start(b,{corner1:{x:4,y:1,z:4},corner2:{x:10,y:1,z:10},block:'stone',solidPattern:true}).ok);
   a.pause();while(a.worker)await sleep(5);a.status='running';a.epoch++;
   b.setControlState('forward',true);while(Math.hypot(b.entity.velocity.x,b.entity.velocity.z)<(kind==='flat'?.1:.02))await sleep(5);
   a.stop();assert(a.brakeDrain);assert(b.physicsEnabled,'do not freeze nonzero velocity');assert(!Object.values(b.controlState).some(Boolean));
   assert.equal(a.start(b,{}).error,'settling','cannot start another job during native braking');
   await a.brakeDrain.promise;assert(!a.brakeDrain);assert.equal(b.physicsEnabled,false);assert(Math.hypot(b.entity.velocity.x,b.entity.velocity.z)<.003);
   assert.equal(b.physics.simulatePlayer,original);assert.equal(b.writes.length,0);passed++;
  }finally{a?.stop();w.stop();}
 }
 function mock(){const b=new EventEmitter();b._client=new EventEmitter();b.entity={onGround:false,velocity:Object.freeze({x:.2,y:-.4,z:0})};b.physicsEnabled=true;b.__autoBuildInteracting=true;b.clearControlStates=()=>{};b.setControlState=()=>{};return b;}
 {const b=mock();let restores=0,warnings=0;const r=await drainNativeStop(b,{savedPhysics:false,restoreSurface:()=>restores++,warn:()=>warnings++,timeout:20});assert(r.keptPhysics);assert(b.physicsEnabled);assert(!b.__autoBuildInteracting);assert.equal(restores,1);assert.equal(warnings,1);assert.equal(b.listenerCount('physicsTick'),0);passed++;}
 for(const event of ['end','respawn','start_configuration']){
  const b=mock();let restores=0;const operation=drainNativeStop(b,{savedPhysics:false,restoreSurface:()=>restores++,timeout:100});
  (event==='start_configuration'?b._client:b).emit(event);const r=await operation;assert(!r.keptPhysics);assert.equal(b.physicsEnabled,false);assert.equal(restores,1);assert.equal(b.listenerCount('physicsTick'),0);passed++;
 }
 console.log(`Stop physics tests passed: ${passed} cases; actual stone/soul-sand motion drains before physics OFF, restart waits, timeout leaves physics running, world/end cleanup, no velocity/position writes.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
