'use strict';
// Real Prismarine worlds, pathfinder and physics; placement reply is simulated.
// No external server, account, teleporting during work, mining or scaffolding.
const assert=require('assert'),{EventEmitter}=require('events'),{Vec3}=require('vec3');
const {Physics,PlayerState}=require('prismarine-physics');
const {AutoBuild,movements}=require('../src/main/bot/auto-build');
const PF=require('mineflayer-pathfinder');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=12000){const end=Date.now()+timeout;while(!fn()&&Date.now()<end)await sleep(20);assert(fn(),'physics deadline exceeded');}
function world(kind,version=process.env.LOCAL_MC_VERSION||'1.20.1'){
 const registry=require('prismarine-registry')(version),Chunk=require('prismarine-chunk')(registry),World=require('prismarine-world')(registry);
 const b=new EventEmitter();b.version=version;b.registry=registry;b._client=new EventEmitter();b._client.write=()=>{};
 b.entity={id:1,position:new Vec3(.5,1,.5),velocity:new Vec3(0,0,0),yaw:0,pitch:0,onGround:true,height:1.8,eyeHeight:1.62,effects:{},attributes:{}};
 const minY = /^1\.(8|9|10|11|12|13|14|15|16|17)(\.|$)/.test(version) ? 0 : -64, height = minY === 0 ? 256 : 384;
 b.entities={};b.game={minY,height};b.food=20;b.health=20;b.inventory={slots:[],items:()=>[{name:'stone',type:registry.itemsByName.stone.id,count:64}]};
 b.supportFeature=f=>registry.supportFeature(f);b.world=null;
 require('mineflayer/lib/plugins/blocks')(b,{version,hideErrors:true});
 b._client.emit('login',require('minecraft-data')(version).loginPacket || {dimension:0});
 for(let x=-2;x<=3;x++)for(let z=-2;z<=2;z++)b.world.setColumn(x,z,new Chunk({minY,worldHeight:height}));
 b.put=(p,name)=>{b.world.setBlockStateId(p,registry.blocksByName[name].minStateId);b.emit('blockUpdate',null,b.blockAt(p));};
 for(let x=-20;x<=45;x++)for(let z=-15;z<=15;z++)if(kind!=='jump'||z===0)b.put(new Vec3(x,0,z),kind==='slow'?'soul_sand':kind==='honey'?'honey_block':'stone');
 if(kind==='pillar')for(let y=1;y<=4;y++)for(let z=-1;z<=1;z++)b.put(new Vec3(7,y,z),'stone');
 if(kind==='jump')b.put(new Vec3(4,1,0),'stone');
 if(kind==='slow')b.entity.position.y=.875;
 if(kind==='honey')b.entity.position.y=.9375;
 b.controlState={forward:false,back:false,left:false,right:false,jump:false,sprint:false,sneak:false};b.jumps=0;
 b.setControlState=(k,on)=>{if(k==='jump'&&on&&!b.controlState.jump)b.jumps++;b.controlState[k]=on;};b.clearControlStates=()=>{for(const k in b.controlState)b.controlState[k]=false;};
 b.look=async(yaw,pitch)=>{b.entity.yaw=yaw;b.entity.pitch=pitch;};b.lookAt=async p=>{const d=p.minus(b.entity.position.offset(0,1.62,0));await b.look(Math.atan2(-d.x,-d.z),Math.atan2(d.y,Math.hypot(d.x,d.z)));};
 b.equip=async i=>{b.heldItem=i;};b.physicsEnabled=false;b.physics=Physics(registry,{getBlock:p=>b.blockAt(p,false)});b.loadPlugin=plugin=>plugin(b);
 b.writes=[];b._placeBlockWithOptions=async(ref,face)=>{const dest=ref.position.plus(face);assert.equal(b.blockAt(dest).name,'air');assert(b.heldItem.name==='stone');b.put(dest,'stone');b.writes.push(dest);};
 b.on('path_update',r=>{for(const p of r.path){assert.equal(p.toBreak.length,0);assert.equal(p.toPlace.length,0);}});
 b.maxStep=0;b.detour=0;b.ticks=0;
 const timer=setInterval(()=>{if(!b.physicsEnabled)return;const old=b.entity.position.clone();b.physics.simulatePlayer(new PlayerState(b,b.controlState),{getBlock:p=>b.blockAt(p,false)}).apply(b);b.maxStep=Math.max(b.maxStep,b.entity.position.distanceTo(old));b.detour=Math.max(b.detour,Math.abs(b.entity.position.z-.5));b.ticks++;b.emit('physicsTick');},5);
 return {b,stop:()=>clearInterval(timer)};
}
async function main(){
 for(const kind of ['pillar','jump','slow','honey']){
  if(kind==='honey' && process.env.LOCAL_MC_VERSION==='1.8') continue;
  const {b,stop}=world(kind);const a=new AutoBuild({warn:console.log});
  try{
   const m=movements(b,PF.Movements);assert(!m.canDig&&!m.allow1by1towers&&!m.allowParkour&&!m.allowSprinting&&!m.scafoldingBlocks.length);assert(m.maxDropDown===2);
   const x=kind==='pillar'?22:14;
   assert(a.start(b,{corner1:{x,y:1,z:0},corner2:{x:x+1,y:['slow','honey'].includes(kind)?1:2,z:0},block:'stone'}).ok);
   await until(()=>a.status!=='running',20000);
   assert.equal(a.status,'complete',`${kind}: ${JSON.stringify(a.state())}`);assert(b.writes.length>=2);assert(b.maxStep<1,'no teleport');
   assert(b.writes.every((p,i)=>!i||p.y>=b.writes[i-1].y),'layers must stay ordered');
   if(kind==='pillar')assert(b.detour>1.8,'must walk around tall wall');
   if(kind==='jump')assert(b.jumps>0,'must jump one-block obstacle');
   if(kind==='slow')assert(b.maxStep < .18,'soul sand must still slow native sprint movement');
   if(kind==='honey')assert(b.maxStep < .16,'honey stays walk-only with native slowdown');
   console.log(JSON.stringify({scenario:kind,placed:b.writes.length,ticks:b.ticks,jumps:b.jumps,detour:+b.detour.toFixed(2),maxPhysicalStep:+b.maxStep.toFixed(3)}));
  }finally{a.stop();stop();}
 }
 console.log('Local build integration passed: pillar detour, one-block jump, soul-sand/honey floors, two Y layers, no mining/scaffolding/teleport.');
}
module.exports = { world };
if (require.main === module) main().catch(e=>{console.error(e);process.exitCode=1;});
