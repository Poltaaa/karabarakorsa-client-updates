'use strict';
// Offline real Prismarine world/physics tests. No account or remote server.
const assert=require('assert'),{Vec3}=require('vec3');
const {AutoBuild,region}=require('../src/main/bot/auto-build');
const {BuildRows}=require('../src/main/bot/build-rows');
const {world}=require('./test-build-local');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(b,area){
  const a=new AutoBuild(null);
  assert(a.start(b,{corner1:area.min,corner2:area.max,block:'stone',rescueOwn:false}).ok);
  a.pause();while(a.worker)await sleep(10);
  a.status='running';a.epoch++;return a;
}
async function main(){
  let passed=0;
  for(const axis of ['x','z'])for(const sign of [-1,1]){
    const w=world('flat'),b=w.b;let a;
    try{
      for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
        for(let y=1;y<=3;y++)if(Math.abs(x)===2||Math.abs(z)===2)b.put(new Vec3(x,y,z),'stone');
        b.put(new Vec3(x,3,z),'stone');
      }
      const door=new Vec3(axis==='x'?sign*2:0,1,axis==='z'?sign*2:0);
      b.put(door,'air');b.put(door.offset(0,1,0),'air');
      b.entity.position=new Vec3(.76,1,.73);
      a=await ready(b,region({x:-2,y:1,z:-2},{x:2,y:3,z:2}));
      const plan=await a.safety.plan(a.epoch);assert(plan,'one-wide two-high exit must be found');
      assert.equal(await a.safety.plan(a.epoch,[{x:door.x,y:1,z:door.z}]),null,'never seal the only exit');
      passed+=2;
      await a.safety.recover(a.epoch);
      assert(a.safety.outside(b.entity.position),'actual native walk must reach outside');
      assert.equal(b.writes.length,0);assert.equal(a.safety.broken,0);
      assert(b.maxStep<.5,'no teleport or synthetic recenter');passed++;
      // A one-block-HIGH hole is not a doorway for a standing player.
      b.physicsEnabled=false;b.entity.position=new Vec3(.5,1,.5);b.entity.velocity=new Vec3(0,0,0);
      b.put(door.offset(0,1,0),'stone');
      assert.equal(await a.safety.plan(a.epoch),null,'insufficient headroom stays rejected');passed++;
    }finally{a?.stop();w.stop();}
  }
  // The only passage to the next stance lies behind the preferred strip side.
  const w=world('flat'),b=w.b;let a;
  try{
    for(let x=-2;x<=2;x++)for(let z=-2;z<=4;z++){
      for(let y=1;y<=3;y++)if(x===-2||x===2||z===-2||z===4||z===1&&x<=0)b.put(new Vec3(x,y,z),'stone');
      b.put(new Vec3(x,3,z),'stone');
    }
    b.entity.position=new Vec3(-.5,1,-.5);
    const area=region({x:0,y:1,z:0},{x:2,y:1,z:3});
    a=await ready(b,area);a.rows=new BuildRows(area,b.entity.position,{axis:'x',low:true});
    const p={x:0,y:1,z:2},q=a.rows.stance(p);
    const destination={isEnd:pos=>a.rows.allowed(p,pos),heuristic:pos=>Math.abs(pos.x-q.x)+Math.abs(pos.z-q.z)};
    assert.equal(await a.safety.plan(a.epoch,[],[],{...destination,route:(pos,origin)=>a.rows.routeAllowed(p,pos,origin)}),null);
    assert(await a.safety.plan(a.epoch,[],[],{...destination,route:pos=>a.rows.transitAllowed(p,pos)}),'loaded physical gap, not strip ordering, decides reachability');passed+=2;
    await a.approach(p,a.epoch);
    assert(a.rows.allowed(p,b.entity.position),'detour keeps the original placement stance');
    assert.equal(b.writes.length,0);assert.equal(a.safety.broken,0);
    assert(b.maxStep<.5);assert.equal(a.routeDetour,false);passed++;
    assert(!a.rows.transitAllowed(p,new Vec3(.5,2,.5)),'detour never authorizes roof walking');
    assert(a.rows.transitAllowed(p,new Vec3(.5,1,.5)));passed+=2;
  }finally{a?.stop();w.stop();}
  // Placement safety is checked once at the final gate, never skipped.
  for(const mutate of [false,true]){
    const w=world('flat'),b=w.b;let a;
    try{
      a=await ready(b,region({x:2,y:1,z:0},{x:2,y:1,z:0}));
      a.approach=async()=>{};a.settle=async()=>{};a.aim=async()=>{};a.standAllowed=()=>true;
      let checks=0;
      a.safety.plan=async()=>{checks++;return {path:[],end:b.entity.position.clone()};};
      if(mutate){
        a.safety.continuation=async()=>{a.worldRevision++;return true;};
        await assert.rejects(a.placeOne({x:2,y:1,z:0},a.epoch),e=>e.code==='world_changed_at_target');
        assert.equal(b.writes.length,0,'a stale escape proof never sends placement');assert.equal(checks,3);
      }else{
        a.rows=null;
        assert(await a.placeOne({x:2,y:1,z:0},a.epoch));
        assert.equal(checks,1,'one final escape search, no duplicate pre-equip search');
        assert.equal(b.writes.length,1);assert.equal(a.placed,1n);
      }
      passed++;
    }finally{a?.stop();w.stop();}
  }
  console.log(`Escape/gap tests passed: ${passed} checks; four doorway directions, seal prevention, actual off-centre native exits, insufficient headroom, loaded-gap detour, unchanged stance/no-roof/no-dig.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});