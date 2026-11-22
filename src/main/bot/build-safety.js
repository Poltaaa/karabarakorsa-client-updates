'use strict';
// Read-only predictive escape planning. Never edits the live world and never
// grants pathfinder permission to dig. Only explicit, confirmed own-block
// rescue below may use native dig, and only after a complete exit plan exists.
const AIR = new Set(['air','cave_air','void_air']);
const FORBIDDEN = /lava|fire|cactus|magma_block|powder_snow|campfire|sweet_berry|wither_rose|spawner|chest|shulker|barrel|furnace|hopper|dispenser|dropper|beacon|tnt|bed|door|portal|command|^(sand|red_sand|gravel|.*concrete_powder)$|anvil|dragon_egg/;
const wait = () => new Promise(r => setTimeout(r, 0));
const key = p => `${p.x},${p.y},${p.z}`;
class BuildSafety {
  constructor(build) {
    this.build=build;this.owned=new Map();this.repairs=new Map();this.broken=0;this.expected=new Set();this.digAttempts=new Map();
    const bot=build.bot;this.client=bot._client;this.airIds=new Set(['air','cave_air','void_air'].map(n=>bot.registry.blocksByName?.[n]?.minStateId).filter(Number.isFinite));
    this.single=p=>this.incoming(p.location,p.type);
    this.multi=p=>{for(const r of p.records||[]){const packed=bot.supportFeature?.('usesMultiblockSingleLong'),three=bot.supportFeature?.('usesMultiblock3DChunkCoords'),o=three?p.chunkCoordinates:{x:p.chunkX,y:0,z:p.chunkZ};
      const x=packed?(r>>8)&15:(r.horizontalPos>>4)&15,z=packed?(r>>4)&15:r.horizontalPos&15,y=packed?r&15:r.y;
      this.incoming({x:o.x*16+x,y:o.y*16+y,z:o.z*16+z},packed?r>>12:r.blockId);
    }};
    this.client?.on('block_change',this.single);this.client?.on('multi_block_change',this.multi);
  }
  detach(){this.client?.removeListener('block_change',this.single);this.client?.removeListener('multi_block_change',this.multi);}
  incoming(p,id) {
    if(!p)return;const a=this.build,k=key(p),attempt=this.digAttempts.get(k);
    if(!attempt||attempt.confirmed||Date.now()-attempt.time>30000||!this.airIds.has(id)||a.safety!==this||!a.bot)return;
    attempt.confirmed=true;this.owned.delete(k);this.repairs.set(k,{p:{...attempt.p}});this.broken++;a.placed--;a.updateProgress();a.diagnostic('rescue opened','cell='+k);
  }
  remember(p) {
    const a=this.build,b=a.bot.blockAt(a.vec(p));
    this.owned.delete(key(p));this.owned.set(key(p),{p:{...p},name:b.name,stateId:b.stateId});
    // Bounded recent ownership journal, NOT an array of the entire cuboid.
    // Forgotten/changed blocks are never eligible for rescue digging.
    while(this.owned.size>4096)this.owned.delete(this.owned.keys().next().value);
  }
  changed(b) { if(!b?.position)return;const k=key(b.position),r=this.owned.get(k);if(r&&!this.expected.has(k)&&b.stateId!==r.stateId)this.owned.delete(k); }
  own(p) { const a=this.build,r=this.owned.get(key(p)),b=a.bot.blockAt(a.vec(p));return !!r&&b?.name===r.name&&b.stateId===r.stateId&&!FORBIDDEN.test(b.name)&&!a.interactables?.has(b.name)&&!a.planting; }
  inside(pos) {const r=this.build.area;return pos.x+.31>r.min.x&&pos.x-.31<r.max.x+1&&pos.z+.31>r.min.z&&pos.z-.31<r.max.z+1&&pos.y+1.8>r.min.y&&pos.y<r.max.y+1;}
  outside(pos) {return !this.inside(pos);}
  async plan(token, additions=[], removals=[], destination=null) {
    const a=this.build,b=a.bot;a.check(token);
    if(a.planting)return {path:[],end:b.entity.position.clone()};
    if(a.adapter) return a.adapter.escape ? a.adapter.escape(b,additions,removals,()=>a.check(token)) : {path:[],end:b.entity.position.clone()};
    if([...additions,...removals].some(p=>!b.blockAt(a.vec(p),false)))return null;
    const add=new Map(additions.map(p=>[key(p),p])),remove=new Set(removals.map(key));
    const proof=a.solidPattern?new (require('./build-world-proof').WorldProof)(b):null;
    const certified=result=>{if(proof){if(!proof.valid())return null;result.validate=()=>proof.valid();}return result;};
    const proxy=Object.create(b),Block=require('prismarine-block')(b.registry);
    proxy.blockAt=q=>{
      const p=q.floored(),k=key(p),old=b.blockAt(q,false);proof?.record(p,old);if(!old)return null;
      if(remove.has(k)||add.has(k)) {const x=Block.fromStateId(remove.has(k)?b.registry.blocksByName.air.minStateId:b.registry.blocksByName[a.block.name].minStateId,0);x.position=p;return x;}
      // Movements decorates block objects; do not mutate cached live instances.
      return Object.assign(Object.create(Object.getPrototypeOf(old)),old);
    };
    const origin=b.entity.position.clone(),v=b.entity.velocity;
    // If already outside the work volume, standing safely is a complete
    // post-placement escape proof. Requiring an unnecessary 1.5m excursion
    // falsely rejected short Skyblock edge ledges beside unopened chunks.
    // This shortcut NEVER proves continuation to another row or an interior
    // stance: footprint and body are checked in the predicted loaded world.
    const atRestGoal=p=>destination?destination.isEnd(p):this.outside(p);
    if(atRestGoal(origin)&&b.entity.onGround!==false&&Math.hypot(v?.x||0,v?.z||0)<.025&&Math.abs(v?.y||0)<.08&&a.bodyClear(origin,proxy)&&a.safeFooting(origin,proxy)){
      // Include the complete natural braking tail, not just one safe frame.
      const {PlayerState}=require('prismarine-physics'),state=new PlayerState(b,{forward:false,back:false,left:false,right:false,jump:false,sprint:false,sneak:false});
      let resting=!b.jumpQueued;
      for(let i=0;resting&&i<12;i++){
        b.physics.simulatePlayer(state,{getBlock:q=>proxy.blockAt(q,false)});
        resting=atRestGoal(state.pos)&&a.bodyClear(state.pos,proxy)&&a.safeFooting(state.pos,proxy);
      }
      if(resting)return certified({path:[],end:origin,stationary:true});
    }
    const m=a.makeMovements(proxy);
    const feet=n=>{const f=proxy.blockAt(a.vec(n).offset(0,-1,0));const h=f?.shapes?.length?Math.max(...f.shapes.map(s=>s[4])):1;return a.vec(n).offset(.5,h-1,.5);};
    if(destination?.route){
      const neighbors=m.getNeighbors;
      m.getNeighbors=function(node){return neighbors.call(this,node).filter(n=>destination.route(feet(n),origin));};
    }
    const goal=destination?{isEnd:n=>destination.isEnd(feet(n))&&a.bodyClear(feet(n),proxy)&&m.getBlock(n,0,-1,0).physical,heuristic:n=>destination.heuristic(feet(n))}:{isEnd:n=>{
      const p=feet(n);if(!this.outside(p)||Math.hypot(p.x-origin.x,p.z-origin.z)<1.5)return false;
      return a.bodyClear(p,proxy)&&m.getBlock(n,0,-1,0).physical&&m.getBlock(n,0,0,0).safe&&m.getBlock(n,0,1,0).safe;
    },heuristic:n=>{
      const r=a.area,p=feet(n);if(this.outside(p))return Math.max(0,1.5-Math.hypot(p.x-origin.x,p.z-origin.z));
      return Math.max(0,Math.min(n.x-r.min.x+1,r.max.x-n.x+1,n.z-r.min.z+1,r.max.z-n.z+1,r.max.y+1-n.y));
    }};
    const gen=b.pathfinder.getPathFromTo(m,origin,goal,{tickTimeout:2,timeout:1200,searchRadius:-1,optimizePath:false});
    let result;
    try {
      for(const out of gen) {a.check(token);result=out.result;if(result.generatedNodes>20000)return null;if(result.status!=='partial')break;await wait();}
      if(result?.status!=='success')return null;
      return certified({path:result.path.map(n=>({x:n.x,y:n.y,z:n.z})),end:result.path.length?feet(result.path.at(-1)):origin});
    } finally {gen.return?.();}
  }
  async continuation(token,p,verifiedEscape=null){
    const a=this.build,rows=a.rows;if(!rows)return true;
    let next,seed=a.seedPlan,slice=Date.now(),index=rows.index(p)+1n,yielded=false;
    // Match the run loop: occupied cells and open repair entries are not the
    // next normal placement. An imaginary route to one caused false pauses.
    if(seed){
      for(let n=p[rows.depth]-rows.sign;rows.sign<0?n<=rows.far:n>=rows.far;n-=rows.sign){
        a.check(token);if(Date.now()-slice>=2){yielded=true;await wait();a.check(token);slice=Date.now();}
        const q={...p,[rows.depth]:n},b=a.bot.blockAt(a.vec(q));
        if(!b)throw a.error('chunk_unloaded');
        if(AIR.has(b.name)&&!this.repairs.has(key(q))&&!(a.solidPattern&&q.y===a.area.max.y&&rows.index(q)===a.area.layer-1n)){next=q;break;}
      }
    }else{
      while(index<a.area.layer){
        a.check(token);if(Date.now()-slice>=2){yielded=true;await wait();a.check(token);slice=Date.now();}
        const q=rows.cell(index++,p.y),b=a.bot.blockAt(a.vec(q));
        if(!b)throw a.error('chunk_unloaded');
        if(AIR.has(b.name)&&!this.repairs.has(key(q))&&!(a.solidPattern&&q.y===a.area.max.y&&rows.index(q)===a.area.layer-1n)){next=q;break;}
      }
    }
    // The final gap does not need a route to a fictional next strip. It still
    // needs the real predictive escape proof; never bypass safety/completion.
    if(!next)return !yielded&&verifiedEscape?verifiedEscape:this.plan(token,[p]);
    const q=rows.stance(next,seed);
    const destination={
      isEnd:pos=>rows.allowed(next,pos,seed),
      heuristic:pos=>Math.abs(pos.x-q.x)+Math.abs(pos.z-q.z)+Math.max(0,pos.y-next.y),
      route:(pos,origin)=>rows.routeAllowed(next,pos,origin,seed)
    };
    const direct=await this.plan(token,[p],[],destination);
    if(direct||!rows.transitAllowed)return direct;
    // Only the artificial strip-side transit restriction is relaxed. The
    // predicted world still includes this placement; the endpoint, roof,
    // loaded chunks, headroom, hazards and native movement remain mandatory.
    return this.plan(token,[p],[],{...destination,route:pos=>rows.transitAllowed(next,pos)});
  }
  async exit(plan,token) {
    const a=this.build;a.setPhase('escape_walk');
    if(!plan)throw a.error('escape_unverified');
    if(!a.adapter) {
      const q=plan.path.at(-1);if(q)await a.navigate(new a.nav.goals.GoalBlock(q.x,q.y,q.z),token);
    } else if(a.adapter.exit)await a.adapter.exit(a.bot,plan,()=>a.check(token));
    a.check(token);await a.settle(token);
    // A pathfinder goal can be reached by its grid cell before the whole
    // body clears the boundary. Replan one REAL walk from the settled pose;
    // never treat the issued command as proof, teleport, or seal from inside.
    if(!a.adapter&&!this.outside(a.bot.entity.position)){
      const fresh=await this.plan(token);a.check(token);
      const q=fresh?.path.at(-1);
      if(q){await a.navigate(new a.nav.goals.GoalBlock(q.x,q.y,q.z),token);a.check(token);await a.settle(token);}
    }
    // Actual position, not the issuing/completion of a movement command.
    if(!this.outside(a.bot.entity.position)||[...this.repairs.values()].some(r=>a.collision(r.p)))throw a.error('exit_not_reached');
    a.diagnostic('exit verified');
  }
  async recover(token) {
    const a=this.build;a.check(token);
    const normal=await this.plan(token);if(normal){await this.exit(normal,token);return true;}
    if(!a.rescueOwn)throw a.error('escape_unverified');
    a.setPhase('rescue_plan');
    const pos=a.bot.entity.position,eye=pos.offset(0,1.62,0),floor=Math.ceil(pos.y-.001),candidates=[];
    for(const r of this.owned.values()) {
      if(r.p.y<floor||!this.own(r.p)||a.vec(r.p).offset(.5,.5,.5).distanceTo(eye)>4.25)continue;
      // Never remove a landing floor; never open into liquids or falling blocks.
      const around=[[0,1,0],[0,-1,0],[-1,0,0],[1,0,0],[0,0,-1],[0,0,1]].map(d=>a.bot.blockAt(a.vec(r.p).offset(...d)));
      if(around.some(b=>!b||/lava|water|sand$|gravel|concrete_powder|anvil/.test(b.name)&&b.name!=='soul_sand'))continue;
      candidates.push(r.p);if(candidates.length>=16)break;
    }
    // Minimum one block first, then a two-high doorway. No arbitrary tunnel mining.
    const groups=candidates.map(p=>[p]);
    for(const p of candidates){const q={...p,y:p.y+1};if(candidates.some(t=>key(t)===key(q)))groups.push([q,p]);}
    let selected,escape;
    for(const group of groups){escape=await this.plan(token,[],group);if(escape){selected=group;break;}}
    if(!selected)throw a.error('rescue_unavailable');
    if(this.repairs.size+selected.length>32)throw a.error('repair_pending');
    for(const p of selected) {
      a.check(token);if(!this.own(p))throw a.error('rescue_changed');
      const b=a.bot.blockAt(a.vec(p)),ref=a.visibleDigFace(b);if(!ref)throw a.error('rescue_not_visible');
      a.setPhase('rescue_break');await a.aim(ref.aim,token);a.check(token);
      if(!this.own(p)||!a.sight(a.bot.entity.position.offset(0,1.62,0),ref))throw a.error('rescue_changed');
      const k=key(p);this.expected.add(k);
      try {
        await this.digConfirmed(b,token);a.check(token);
        if(!AIR.has(a.bot.blockAt(a.vec(p))?.name))throw a.error('rescue_denied');
        if(!this.repairs.has(k))throw a.error('rescue_denied');
      } finally {this.expected.delete(k);}
    }
    // Replan against confirmed world after digging; old prediction is not proof.
    const actual=await this.plan(token);await this.exit(actual,token);return true;
  }
  async digConfirmed(block,token) {
    const a=this.build,bot=a.bot,k=key(block.position);let timer;
    const tool=bot.pathfinder?.bestHarvestTool?.(block);if(tool)await a.boundedEquip(tool,token);
    const face=a.visibleDigFace(block);if(!face)throw a.error('rescue_not_visible');
    await a.aim(face.aim,token);a.check(token);
    if(!this.own(block.position))throw a.error('rescue_changed');
    if(bot.digTime?.(block)>15000)throw a.error('rescue_too_slow');
    const attempt={p:{x:block.position.x,y:block.position.y,z:block.position.z},time:Date.now(),confirmed:false};this.digAttempts.set(k,attempt);
    while(this.digAttempts.size>16)this.digAttempts.delete(this.digAttempts.keys().next().value);
    try {
      // The lifetime inbound observer also records an ACK arriving after Pause.
      // Native optimistic local-air events never count as a successful break.
      // Native dig(ignore) resets its face to UP. Use its supported face
      // vector API instead, routing only that one initial look through the
      // two-angle/real-shape gate. Restore immediately; no packet fabrication.
      const original=bot.lookAt;
      const gated=function(){if(bot.lookAt===gated)bot.lookAt=original;return a.aim(face.aim,token).then(()=>{a.check(token);a.setPhase('rescue_break');});};
      bot.lookAt=gated;
      try {await bot.dig(block,false,face.face);a.check(token);}
      finally {if(bot.lookAt===gated)bot.lookAt=original;}
      const end=Date.now()+5000;
      while(!attempt.confirmed&&Date.now()<end){a.check(token);await new Promise(r=>{timer=setTimeout(r,50);});}
      if(!attempt.confirmed)throw a.error('rescue_denied');
    } finally {clearTimeout(timer);}
  }
  async close(token,maxY=this.build.layerY) {
    const a=this.build;if(!this.repairs.size)return;
    if(!this.outside(a.bot.entity.position))throw a.error('exit_not_reached');
    for(const [k,r] of [...this.repairs].sort((a,b)=>a[1].p.y-b[1].p.y)) {
      if(r.p.y>maxY)continue;
      a.check(token);a.setPhase('rescue_close');a.target=r.p;
      // No approach back into the passage. Closing happens from outside only.
      if(!this.outside(a.bot.entity.position)||a.collision(r.p))throw a.error('exit_not_reached');
      await a.placeOne(r.p,token,{outsideOnly:true,repair:true});
      if(!this.outside(a.bot.entity.position))throw a.error('exit_not_reached');
      this.repairs.delete(k);a.diagnostic('rescue closed','cell='+k);
    }
  }
}
module.exports={BuildSafety,key};
