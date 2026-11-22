'use strict';
const assert=require('assert'),{world}=require('./test-build-local'),{Vec3}=require('vec3');
const {AutoBuild}=require(process.env.EDGE_CLIENT_ROOT?process.env.EDGE_CLIENT_ROOT+'/src/main/bot/auto-build':'../src/main/bot/auto-build');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(floor='flat'){
 const w=world(floor,'26.1'),b=w.b,a=new AutoBuild(null),y=floor==='slow'?.875:1;
 b.entity.position=new Vec3(-.5,y,.5);assert(a.start(b,{corner1:{x:0,y:2,z:0},corner2:{x:0,y:2,z:0},block:'stone'}).ok);a.pause();while(a.worker)await sleep(10);a.status='running';const token=++a.epoch,p={x:0,y:2,z:0},old=b.blockAt;
 b.blockAt=q=>{const n=q.floored();return n.x===-1&&n.z===0||n.x===0&&n.y===2&&n.z===0?old(q):null;};
 return {w,b,a,token,p,old};
}
async function main(){let passed=0;
 for(const floor of ['flat','slow']){const f=await fixture(floor);try{const result=await f.a.safety.plan(f.token,[f.p]);assert(result?.stationary,'safe outside ledge must not require 1.5m excursion into unknown chunks');assert.equal(result.path.length,0);assert(f.a.safety.outside(f.b.entity.position));passed++;}finally{f.a.stop();f.w.stop();}}
 for(const kind of ['unknown-target','unknown-floor','body-hit','coast-off-edge','interior','continuation']){const f=await fixture();const {a,b,p,token,w}=f;try{
  let adds=[p],dest=null;const masked=b.blockAt;
  if(kind==='unknown-target')b.blockAt=q=>q.floored().equals(new Vec3(0,2,0))?null:masked(q);
  if(kind==='unknown-floor')b.blockAt=q=>q.y<1?null:masked(q);
  if(kind==='body-hit')adds=[{x:-1,y:1,z:0}];
  if(kind==='coast-off-edge'){b.entity.position.x=-.301;b.entity.velocity.x=.024;}
  if(kind==='interior'){a.area.min.x=-1;a.area.max.x=-1;a.area.min.y=1;}
  if(kind==='continuation')dest={isEnd:q=>q.x>2,heuristic:q=>Math.abs(3.5-q.x)};
  assert.equal(await a.safety.plan(token,adds,[],dest),null,kind+' must not bypass escape/loaded-world proof');passed++;
 }finally{a.stop();w.stop();}}
 console.log(`Skyblock loaded-ledge tests passed: ${passed} cases, stationary escape with real body/support and braking, unknown/unsafe worlds still blocked.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
