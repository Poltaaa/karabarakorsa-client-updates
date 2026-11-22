'use strict';
const assert=require('assert'),{Vec3}=require('vec3');
const {AutoBuild,region}=require('../src/main/bot/auto-build');
const {SolidPattern}=require('../src/main/bot/build-solid-pattern');
const {columnStep}=require('../src/main/bot/build-precise-stance');
const {world}=require('./test-build-local');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(kind,depth,direction){
 const w=world(kind,'26.1'),b=w.b,a=new AutoBuild(null);
 assert(a.start(b,{corner1:{x:0,y:1,z:0},corner2:{x:12,y:1,z:12},block:'stone'}).ok);
 a.pause();while(a.worker)await sleep(5);
 a.status='running';a.epoch++;a.solidPattern=true;a.rows=new SolidPattern(a.area,b.entity.position,{x:0,y:1,z:0},depth);
 const p={x:4,y:1,z:4};p[depth]=6;const q=a.rows.stance(p);
 // Fixture initial condition only, before the operation being tested.
 b.entity.position=new Vec3(q.x,kind==='slow'?.875:1,q.z);b.entity.position[a.rows.cross]-=direction;
 b.entity.position[depth]+=.02;b.entity.onGround=true;
 let goals=0;const original=b.pathfinder.setGoal.bind(b.pathfinder);
 b.pathfinder.setGoal=g=>{if(g)goals++;return original(g);};
 return {w,b,a,p,q,goals:()=>goals,close:()=>{a.stop();w.stop();}};
}
async function main(){let passed=0;
 for(const kind of ['flat','slow'])for(const depth of ['x','z'])for(const dir of [-1,1]){
  const t=await setup(kind,depth,dir);try{
   assert(await columnStep(t.a,t.p,t.q,t.a.epoch));
   assert(Math.hypot(t.b.entity.position.x-t.q.x,t.b.entity.position.z-t.q.z)<.10);
   assert(Math.hypot(t.b.entity.velocity.x,t.b.entity.velocity.z)<.003);
   assert.equal(t.goals(),0,'no non-null pathfinder grid goal');assert.equal(t.b.writes.length,0);
   assert(t.b.maxStep<(kind==='slow'?.14:.3));assert(!Object.values(t.b.controlState).some(Boolean));passed++;
  }finally{t.close();}
 }
 for(const mode of ['blocked','unknown','height-change','long','terminal','cancel','server_corrections','zero-speed']){
  const t=await setup('slow','z',1);try{
   if(mode==='blocked')t.b.put(new Vec3(4,1,9),'stone');
   if(mode==='unknown'){const get=t.b.blockAt.bind(t.b);t.b.blockAt=(p,...args)=>p.x>4&&p.x<5?null:get(p,...args);}
   if(mode==='height-change')t.b.entity.onGround=false;
   if(mode==='long')t.b.entity.position.x-=2;
   if(mode==='terminal')t.p.z=12;
   if(['blocked','unknown','height-change','long','terminal'].includes(mode)){
    const before=t.b.entity.position.clone();assert.equal(await columnStep(t.a,t.p,t.q,t.a.epoch),false);assert(t.b.entity.position.equals(before));
   }else{
    const run=columnStep(t.a,t.p,t.q,t.a.epoch);
    if(mode==='zero-speed'){
     t.b.entity.attributes={[t.b.physics.movementSpeedAttribute]:{value:0,modifiers:[]}};
     await assert.rejects(run,e=>e.code==='movement_disabled');
    }else{
     setTimeout(()=>t.a.pause(mode==='cancel'?'manual':'server_corrections'),15);
     await assert.rejects(run,e=>e.code==='cancelled');assert.equal(t.a.reason,mode==='cancel'?'manual':'server_corrections');
    }
   }
   assert.equal(t.b.writes.length,0);assert(!Object.values(t.b.controlState).some(Boolean));passed++;
  }finally{t.close();}
 }
 console.log(`Column step tests passed: ${passed} cases; third-band four directions, stone/soul sand, real braking, blocked/unknown/height/long/terminal fallback, manual/correction cancellation and server zero speed.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
