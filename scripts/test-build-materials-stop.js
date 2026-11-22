'use strict';
// Deterministic offline async-boundary regressions. No remote server/account.
const assert=require('assert');
const {AutoBuild}=require('../src/main/bot/auto-build');
const {world}=require('./test-build-local');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(b,block='stone'){
 const a=new AutoBuild(null);
 assert(a.start(b,{corner1:{x:2,y:1,z:0},corner2:{x:2,y:1,z:0},block,fastWalk:true}).ok);
 a.pause();while(a.worker)await sleep(10);a.status='running';a.epoch++;
 return a;
}
async function main(){
 let passed=0;
 for(const stage of ['equip','gate','aim','final','empty-hand','wrong-hand','refusal','ack-error']){
  const w=world('flat'),b=w.b;let a;
  try{
   let amount=64,approaches=0,sends=0;const item={name:'stone',count:64};
   b.inventory.items=()=>amount>0?[{...item,count:amount}]:[];
   a=await ready(b);a.rows=null;a.standAllowed=()=>true;
   a.approach=async()=>{approaches++;};a.settle=async()=>{};
   b.equip=async i=>{b.heldItem=i;if(stage==='equip'){amount=0;b.heldItem=null;}};
   a.placementSpacing=async()=>{if(stage==='gate'){amount=0;b.heldItem=null;}};
   a.aim=async()=>{
    if(stage==='aim'){amount=0;b.heldItem=null;}
    if(stage==='empty-hand')b.heldItem={name:'stone',count:0};
    if(stage==='wrong-hand')b.heldItem={name:'dirt',count:64};
   };
   a.safety.plan=async()=>{if(stage==='final'){amount=0;b.heldItem=null;}return {path:[],end:b.entity.position.clone()};};
   b._placeBlockWithOptions=async()=>{
    sends++;
    if(stage==='ack-error')throw Error('simulated native timeout');
    // Refusal leaves the real target air; no acknowledgement is invented.
   };
   const expected=stage==='refusal'?'server_refused':stage==='ack-error'?'placement_failed':['empty-hand','wrong-hand'].includes(stage)?'inventory_changed':'materials';
   await assert.rejects(a.placeOne({x:2,y:1,z:0},a.epoch),e=>e.code===expected);
   assert.equal(approaches,1,'inventory/refusal must not cause a second walk');
   assert.equal(sends,['refusal','ack-error'].includes(stage)?1:0,'no sends after losing materials, no retry after refusal/timeout');
   assert.equal(a.placed,0n);passed++;
  }finally{a?.stop();w.stop();}
 }
 const w=world('flat');let a;
 try{
  w.b.inventory.items=()=>[{name:'nether_wart',count:64}];
  a=await ready(w.b,'nether_wart');
  assert(a.planting);assert.equal(a.fastWalk,false,'crop mode never enables sprint even if requested');passed++;
 }finally{a?.stop();w.stop();}
 console.log(`Material/first-refusal fail-stop tests passed: ${passed} scenarios; async equip/gate/aim/final losses, zero/wrong hand, one-send refusal/timeout, crop walk-only.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});