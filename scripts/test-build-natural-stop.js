'use strict';
// The upstream version reproduced non-physics X/Z snaps up to .447 blocks
// on this fixture. Observe before/after the synchronous pathfinder listeners:
// physics is allowed to change pose/velocity; pathfinder only changes INPUT.
const assert=require('assert'),{world}=require('./test-build-local');
const {AutoBuild}=require('../src/main/bot/auto-build');
const PF=require('mineflayer-pathfinder'),fs=require('fs'),crypto=require('crypto');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const filename=require.resolve('mineflayer-pathfinder'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),beforeHash=hash();
 for(const version of ['1.20.1','1.21.4','26.1'])for(const floor of ['flat','slow','honey']){
  const w=world(floor,version),b=w.b,a=new AutoBuild(null);let before,observed=0;
  try{
   assert(a.start(b,{corner1:{x:30,y:1,z:0},corner2:{x:30,y:1,z:0},block:'stone'}).ok);
   a.pause();while(a.worker)await sleep(10);a.status='running';const token=++a.epoch;
   assert(b.pathfinder.__kbNaturalStops);
   b.prependListener('physicsTick',()=>{before={p:b.entity.position.clone(),v:b.entity.velocity.clone()};});
   b.on('physicsTick',()=>{assert(b.entity.position.distanceTo(before.p)<1e-9,'pathfinder must not recenter position');assert(b.entity.velocity.distanceTo(before.v)<1e-9,'pathfinder must not force-zero velocity');observed++;});
   for(const [x,z] of [[8,3],[9,4],[10,5]]){
    await a.navigate(new PF.goals.GoalBlock(x,1,z),token);await a.settle(token);
    assert.equal(b.controlState.forward,false);assert.equal(b.controlState.jump,false);assert(Math.hypot(b.entity.velocity.x,b.entity.velocity.z)<.025);
   }
   assert(observed>10);console.log(`Natural stops: ${version} / ${floor} / 3 destinations, no synchronous pose or velocity writes.`);
  }finally{a.stop();w.stop();}
 }
 assert.equal(hash(),beforeHash,'installed dependency must remain byte-identical');
 console.log('Natural stop tests passed: 9 native physics/pathfinder scenarios, dependency unchanged.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
