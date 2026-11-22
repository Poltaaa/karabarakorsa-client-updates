'use strict';
// Real chunks, pathfinder and Prismarine physics. Only local fixture look/equip
// are mocked; full-client movement/placement coverage lives in build-network.
const assert=require('assert'),{world}=require('./test-build-local');
const {AutoBuild}=require('../src/main/bot/auto-build');const PF=require('mineflayer-pathfinder');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,ms=10000){const end=Date.now()+ms;while(!fn()&&Date.now()<end)await sleep(10);assert(fn(),'travel deadline');}
async function measure(kind,fast,lateral=false){
 const w=world(kind),b=w.b,a=new AutoBuild({warn:console.log});let sprintTicks=0;
 try {
  assert(a.start(b,{corner1:{x:30,y:1,z:0},corner2:{x:30,y:1,z:0},block:'stone',fastWalk:fast}).ok);a.pause();await until(()=>!a.worker);a.status='running';const token=++a.epoch;a.phase='walk';
  b.on('physicsTick',()=>{if(b.controlState.sprint)sprintTicks++;});
  const before=b.ticks;await a.navigate(new PF.goals.GoalBlock(lateral?0:10,1,lateral?10:0),token);
  assert(!b.controlState.sprint);assert(!b.pathfinder.movements.allowSprinting,'sprint policy withdrawn after travel');
  return {ticks:b.ticks-before,sprintTicks,maxStep:b.maxStep};
 }finally{a.stop();w.stop();}
}
async function main(){
 for(const kind of ['flat','slow']){
  const walk=await measure(kind,false),fast=await measure(kind,true);
  assert(fast.sprintTicks>0,'vanilla sprint must actually be used on '+kind);assert(fast.ticks<walk.ticks*.93,'should reduce real physics travel ticks');
  if(kind==='slow')assert(fast.maxStep<.18,'native soul-sand slowdown retained during sprint');
  console.log(JSON.stringify({scenario:kind,walkTicks:walk.ticks,fastTicks:fast.ticks,walkEquivalentSeconds:+(walk.ticks/20).toFixed(2),fastEquivalentSeconds:+(fast.ticks/20).toFixed(2),sprintTicks:fast.sprintTicks,maxStep:+fast.maxStep.toFixed(3)}));
 }
 const sideWalk=await measure('flat',false,true),sideFast=await measure('flat',true,true);assert(sideFast.ticks<sideWalk.ticks*.93);console.log(JSON.stringify({scenario:'lateral-z',walkTicks:sideWalk.ticks,fastTicks:sideFast.ticks}));
 const honey=await measure('honey',true);assert.equal(honey.sprintTicks,0,'no sprint on honey');assert(honey.maxStep<.16);console.log('Travel local physics passed: flat, soul sand, lateral movement, honey safety, control cleanup.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
