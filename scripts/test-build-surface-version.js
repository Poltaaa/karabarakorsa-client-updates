'use strict';
// Independent expected golden trajectory is the pinned native 1.20.1 physics
// on uniform terrain (with the existing fractional-floor lookup fix). It is
// NOT generated from 26.1's compatibility branch.
const assert=require('assert'),{world}=require('./test-build-local');
const {surfacePhysics}=require(process.env.SURFACE_TEST_ROOT?process.env.SURFACE_TEST_ROOT+'/src/main/bot/auto-build':'../src/main/bot/auto-build'),{PlayerState}=require('prismarine-physics');
function trace(version,floor,sprint=false){
 const w=world(floor,version),b=w.b,original=b.physics.simulatePlayer,restore=surfacePhysics(b);const out=[];
 try{b.controlState.forward=true;b.controlState.sprint=sprint;
  for(let i=0;i<60;i++){
   const prev=b.entity.position.clone();b.physics.simulatePlayer(new PlayerState(b,b.controlState),{getBlock:p=>b.blockAt(p,false)}).apply(b);
   out.push({step:Math.hypot(b.entity.position.x-prev.x,b.entity.position.z-prev.z),vy:b.entity.velocity.y,ground:b.entity.onGround});
  }
 }finally{restore();assert.strictEqual(b.physics.simulatePlayer,original,'restore original physics after build');w.stop();}
 return out;
}
let passed=0;
for(const floor of ['flat','slow','honey'])for(const sprint of [false,true]){
 const expected=trace('1.20.1',floor,sprint);
 for(const version of ['1.21.4','26.1']){
  const actual=trace(version,floor,sprint);
  for(let i=0;i<actual.length;i++){
   assert(Math.abs(actual[i].step-expected[i].step)<1e-8,`${version} ${floor} tick ${i}: missing or DOUBLE slowdown`);
   assert(Math.abs(actual[i].vy-expected[i].vy)<1e-8,'no Y manipulation');assert.equal(actual[i].ground,expected[i].ground);
  }
  if(floor==='slow')assert(Math.max(...actual.map(v=>v.step))<(sprint?.18:.14),'soul sand retains terrain multiplier');
  console.log(`${version} / ${floor} / sprint=${sprint}: matches 60-tick native golden trajectory.`);passed++;
 }
}
console.log(`Surface-version physics tests passed: ${passed} scenarios; flat speed unchanged, terrain slowdown once, Y unchanged.`);
