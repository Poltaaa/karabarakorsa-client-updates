'use strict';
// Exact Y=65 soul-sand / Y=66 crop reproduction: real chunks, physics,
// pathfinder and native placement packet, with a strict local simulated server.
const assert=require('assert'),{Vec3}=require('vec3');
const {world}=require('./test-build-local');const {AutoBuild}=require('../src/main/bot/auto-build');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=15000){const end=Date.now()+ms;while(!fn()&&Date.now()<end)await sleep(15);assert(fn(),'wart local test deadline');}
function garden({soil='soul_sand',wide=false,deny=false,delay=20,count=64}={}){
 const w=world('native'),b=w.b;
 if(!b.registry.blocksByName[soil]){w.stop();throw Error('Fixture soil missing: '+soil);}
 // No safe elevated standing platform outside the crop area; the builder
 // must plant at its feet and be able to walk through existing crop cells.
 for(let x=0;x<=6;x++)for(let z=0;z<=(wide?4:0);z++)b.put(new Vec3(x,65,z),soil);
 b.entity.position=new Vec3(.5,soil==='soul_sand'?65.875:66,.5);b.amount=count;
 b.inventory.items=()=>b.amount?[{name:'nether_wart',type:b.registry.itemsByName.nether_wart.id,count:b.amount,metadata:0}]:[];
 b.swingArm=()=>{};require('mineflayer/lib/plugins/generic_place')(b);require('mineflayer/lib/plugins/place_block')(b);
 b.packets=[];b._client.write=(name,p)=>{
  if(name!=='block_place')return;
  const ref=new Vec3(p.location.x,p.location.y,p.location.z);
  assert.equal(p.direction,1,'wart must use UP, not a side / occupied neighbour');
  assert.equal(ref.y,65);assert.equal(b.blockAt(ref).name,'soul_sand');assert.equal(b.heldItem.name,'nether_wart');
  assert.equal(b.controlState.sneak,false,'no unnecessary crouch/eye-height change when planting');
  const integer=b.supportFeature('blockPlaceHasHeldItem')||b.supportFeature('blockPlaceHasHandAndIntCursor');
  const delta=new Vec3(p.cursorX/(integer?16:1),p.cursorY/(integer?16:1),p.cursorZ/(integer?16:1));
  assert.equal(delta.y,.875,'click must hit the soul-sand shape, not y=1');assert.equal(delta.x,.5);assert.equal(delta.z,.5);
  const dest=ref.offset(0,1,0);assert.equal(b.blockAt(dest).name,'air');
  // Validate physical reach and the look direction against the REAL click.
  const eye=b.entity.position.offset(0,1.62,0),aim=ref.plus(delta),d=aim.minus(eye);assert(d.norm()<=4.25);
  assert(Math.abs(b.entity.yaw-Math.atan2(-d.x,-d.z))<.001);assert(Math.abs(b.entity.pitch-Math.atan2(d.y,Math.hypot(d.x,d.z)))<.001);
  b.packets.push({dest,delta});
  setTimeout(()=>{
   b._client.emit('block_change',{location:ref,type:b.blockAt(ref).stateId});
   b._client.emit('block_change',{location:dest,type:deny?0:b.registry.blocksByName.nether_wart.minStateId});
   if(!deny)b.amount--;
  },delay);
 };
 return w;
}
const spec=(maxX=6,maxZ=0)=>({corner1:{x:0,y:66,z:0},corner2:{x:maxX,y:66,z:maxZ},block:'nether_wart'});
async function main(){
 let tests=0,w= garden(),a=new AutoBuild({warn:console.log});
 try{assert(a.start(w.b,spec()).ok);await until(()=>a.status!=='running');assert.equal(a.status,'complete',JSON.stringify(a.state()));assert.equal(a.placed,7n);assert.equal(w.b.packets.length,7);assert.equal(w.b.blockAt(new Vec3(6,66,0)).name,'nether_wart');assert(w.b.entity.position.x>1,'must walk over planted crops');assert(w.b.maxStep<1);assert(w.b.jumps===0);console.log('PASS: 7-cell strip, Y65/Y66, last cell at own feet, movement over planted crops, real click shape.');tests++;}finally{a.stop();w.stop();}
 w=garden({wide:true});a=new AutoBuild({warn:console.log});
 try{w.b.put(new Vec3(2,66,2),'nether_wart');const grown=w.b.registry.blocksByName.nether_wart.minStateId+3;w.b.world.setBlockStateId(new Vec3(2,66,2),grown);assert(a.start(w.b,spec(6,4)).ok);await until(()=>a.status!=='running',22000);assert.equal(a.status,'complete',JSON.stringify(a.state()));assert.equal(a.placed,34n);assert.equal(a.skipped,1n);assert.equal(w.b.blockAt(new Vec3(2,66,2)).stateId,grown);assert(w.b.packets.every(p=>p.dest.y===66));console.log('PASS: 7x5 garden at Y66; occupied/mature wart preserved; rows completed.');tests++;}finally{a.stop();w.stop();}
 w=garden({soil:'stone'});a=new AutoBuild({warn:()=>{}});
 try{assert(a.start(w.b,spec()).ok);await until(()=>a.status==='paused');assert.equal(a.reason,'wart_soil');assert.equal(a.cursor,0n);assert.equal(w.b.packets.length,0);console.log('PASS: wrong support gives wart_soil with no invalid placement packet.');tests++;}finally{a.stop();w.stop();}
 w=garden({count:1});a=new AutoBuild({warn:()=>{}});
 try{a.start(w.b,spec(1));await until(()=>a.status==='paused');await until(()=>!a.worker);assert.equal(a.reason,'materials');assert.equal(a.cursor,1n);w.b.amount=1;a.resume();await until(()=>a.status==='complete');assert.equal(w.b.packets.length,2);console.log('PASS: out of wart pauses, refill/Resume keeps cursor and plants remaining cell.');tests++;}finally{a.stop();w.stop();}
 w=garden({deny:true});a=new AutoBuild({warn:()=>{}});
 try{a.start(w.b,spec(1));await until(()=>a.status==='paused');assert.equal(a.cursor,0n);assert.equal(a.placed,0n);assert(w.b.packets.length<=3);console.log('PASS: valid crop click rejected by simulated server never advances.');tests++;}finally{a.stop();w.stop();}
 w=garden({delay:180});a=new AutoBuild({warn:()=>{}});
 try{a.start(w.b,spec(1));await until(()=>w.b.packets.length===1);a.pause();assert(!a.resume().ok);await until(()=>!a.worker);assert.equal(w.b.packets.length,1);a.resume();await until(()=>a.status==='complete');assert.equal(w.b.packets.length,2);assert.equal(a.skipped,1n);console.log('PASS: late wart acknowledgement after Pause drains; no duplicate crop on Resume.');tests++;}finally{a.stop();w.stop();}
 w=garden();a=new AutoBuild({warn:()=>{}});
 try{const look=w.b.look;w.b.look=async (...args)=>{await look(...args);w.b.put(new Vec3(0,65,0),'stone');};a.start(w.b,spec(0));await until(()=>a.status==='paused');assert.equal(a.reason,'wart_soil');assert.equal(a.cursor,0n);assert.equal(w.b.packets.length,0);console.log('PASS: soil changes during look; support recheck prevents stale invalid planting.');tests++;}finally{a.stop();w.stop();}
 console.log(`Wart local integration (${process.env.LOCAL_MC_VERSION||'1.20.1'}) passed: ${tests} scenarios.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
