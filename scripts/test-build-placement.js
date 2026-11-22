'use strict';
// Native Mineflayer placement packets and acknowledgement listeners, backed by
// real local chunks. A local simulated server accepts/denies the block reply.
const assert=require('assert'),{Vec3}=require('vec3');
const {world}=require('./test-build-local');const {AutoBuild}=require('../src/main/bot/auto-build');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=8000){const end=Date.now()+ms;while(!fn()&&Date.now()<end)await sleep(15);assert(fn(),'native placement deadline');}
function native(mode){
 const w=world('native'),b=w.b;b.swingArm=()=>{};
 require('mineflayer/lib/plugins/generic_place')(b);require('mineflayer/lib/plugins/place_block')(b);
 const directions=[[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];b.packets=[];
 b._client.write=(name,p)=>{
  if(name!=='block_place')return;
  const ref=new Vec3(p.location.x,p.location.y,p.location.z),dest=ref.offset(...directions[p.direction]);b.packets.push(dest);
  assert(!b.controlState.sneak, 'non-interactive stone support needs no crouch');assert.equal(b.heldItem.name,'stone');assert.equal(b.blockAt(dest).name,'air');
  if(mode==='none')return;
  setTimeout(()=>{
   b._client.emit('block_change',{location:ref,type:b.blockAt(ref).stateId});
   b._client.emit('block_change',{location:dest,type:mode==='deny'?0:b.registry.blocksByName.stone.minStateId});
  },mode==='late'?180:35);
 };
 return w;
}
async function main(){
 let w=native('accept'),a=new AutoBuild({warn:console.log});
 try{assert(a.start(w.b,{corner1:{x:2,y:1,z:0},corner2:{x:3,y:2,z:0},block:'stone'}).ok);await until(()=>a.status==='complete');assert.equal(a.placed,4n);assert.deepEqual(w.b.packets.map(p=>p.y),[1,1,2,2]);console.log('Native placement: 4 server-confirmed blocks, two ordered Y layers.');}finally{a.stop();w.stop();}
 w=native('deny');a=new AutoBuild({warn:console.log});
 try{a.start(w.b,{corner1:{x:2,y:1,z:0},corner2:{x:3,y:1,z:0},block:'stone'});await until(()=>a.status==='paused');assert.equal(a.cursor,0n);assert.equal(a.placed,0n);assert.equal(w.b.packets.length,1);assert.equal(w.b.blockAt(new Vec3(2,1,0)).name,'air');console.log('Native placement: first server refusal pauses without retry or advancing.');}finally{a.stop();w.stop();}
 w=native('late');a=new AutoBuild({warn:console.log});
 try{a.start(w.b,{corner1:{x:2,y:1,z:0},corner2:{x:3,y:1,z:0},block:'stone'});await until(()=>w.b.packets.length===1);a.pause();assert(!a.resume().ok);await until(()=>!a.worker);assert.equal(w.b.packets.length,1);assert.equal(a.cursor,0n);assert.equal(w.b.blockAt(w.b.packets[0]).name,'stone');a.resume();await until(()=>a.status==='complete');assert.equal(w.b.packets.length,2);assert.equal(a.skipped,1n);console.log('Native placement: late acknowledgement after Pause is drained; no extra sends or duplicate placement on Resume.');}finally{a.stop();w.stop();}
 w=native('none');a=new AutoBuild({warn:console.log});
 try{a.start(w.b,{corner1:{x:2,y:1,z:0},corner2:{x:3,y:1,z:0},block:'stone'});await until(()=>a.status==='paused',20000);assert.equal(a.cursor,0n);assert.equal(w.b.packets.length,1);console.log('Native placement: missing server reply times out and pauses without retry.');}finally{a.stop();w.stop();}
 console.log('Native placement integration passed: 4 scenarios.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
