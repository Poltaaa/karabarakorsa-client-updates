'use strict';
// Straight adjacent-row shortcut. Native A/D inputs and native physics only;
// no look(), synthetic yaw/velocity/position or chunk fabrication.
const {headingAligned}=require('./build-travel');
const {movementInfo}=require('./movement-attributes');
const SLIPPERY=/ice|slime_block/;
const AIR=new Set(['air','cave_air','void_air']);
function adjacentRow(a,p){
 const r=a.rows,old=a.lastRowCell;if(!r||!old)return false;
 if(old.y!==p.y||r.describe(old).band!==r.describe(p).band||Math.abs(old[r.cross]-p[r.cross])!==1)return false;
 const from=r.index(old),to=r.index(p);
 if(to<=from||to-from>5n)return false;
 // A row can finish early when its near cell is already filled, and the
 // next row can start after a filled far cell. Do not require both to be
 // placements by this job. Verify every skipped cell from the loaded world;
 // never jump an empty/unknown cell, another band or an outstanding repair.
 for(let i=from+1n;i<to;i++){
   const q=r.cell(i,p.y),b=q&&a.bot.blockAt(a.vec(q),false);
   if(!b||AIR.has(b.name)||a.safety?.repairs.has(`${q.x},${q.y},${q.z}`))return false;
 }
 return true;
}
async function rowStrafe(a,p,token,refs){
 a.check(token);
 const move=movementInfo(a.bot);if(move.known&&move.value<=0)throw a.error('movement_disabled');
 const b=a.bot,r=a.rows;if(a.adapter||!r||!b.physics?.simulatePlayer||!b.entity.onGround||b.jumpQueued)return false;
 const target=r.stance(p),origin=b.entity.position.clone(),yaw=b.entity.yaw,cross=r.cross,depth=r.depth;
 const delta=target[cross]-origin[cross];
 if(Math.abs(delta)>1.65||Math.abs(delta)<.08||Math.abs(origin[depth]-target[depth])>.6||!a.safeFooting(origin)||!headingAligned(b))return false;
 // Right's native direction is (cos(yaw), -sin(yaw)); only accept a
 // nearly axis-aligned side step. Angled/obstructed paths use the old router.
 const side={x:Math.cos(yaw),z:-Math.sin(yaw)};
 if(Math.abs(side[cross])<.985)return false;
 const {PlayerState}=require('prismarine-physics'),world={getBlock:q=>b.blockAt(q,false)};
 const safe=pos=>Math.abs(pos[cross]-origin[cross])<=1.85&&a.bodyClear(pos)&&a.safeFooting(pos)&&Math.abs(pos.y-origin.y)<.025&&Math.abs(pos[depth]-target[depth])<=.65&&r.routeAllowed(p,pos,origin)&&!SLIPPERY.test(b.blockAt(pos.offset(0,-.02,0))?.name||'');
 if(!safe(origin))return false;
 const current=()=>({forward:false,back:false,left:false,right:false,jump:false,sprint:false,sneak:false});
 function predict(key){
  const controls=current();if(key)controls[key]=true;
  const s=new PlayerState(b,controls);
  // Check one powered tick, then the full native braking tail. This also
  // rejects unknown chunks, ledge falls and dynamic obstacles ahead of time.
  for(let i=0;i<12;i++){if(i>0&&key)s.control[key]=false;b.physics.simulatePlayer(s,world);if(!safe(s.pos))return null;}
  return s.pos;
 }
 a.halt();a.setPhase('strafe');const start=Date.now();let done=false;
 try{return await new Promise((resolve,reject)=>{
  const finish=(value,error)=>{if(done)return;done=true;clearTimeout(timer);b.removeListener('physicsTick',tick);b.clearControlStates();error?reject(error):resolve(value);};
  const tick=()=>{
   try{
    a.check(token);const move=movementInfo(b);if(move.known&&move.value<=0)return finish(false,a.error('movement_disabled'));
    const pos=b.entity.position,v=b.entity.velocity;
    if(!safe(pos)||!headingAligned(b)||Math.abs(Math.atan2(Math.sin(b.entity.yaw-yaw),Math.cos(b.entity.yaw-yaw)))>.02)return finish(false);
    const left=target[cross]-pos[cross],speed=Math.hypot(v.x,v.z);
    if(Math.abs(left)<.11&&speed<.015)return finish(a.standAllowed(p,pos)&&!!a.usable(p,refs));
    if(Date.now()-start>6000)return finish(false);
    const coast=predict(null);if(!coast)return finish(false);
    let key=null;
    if(Math.abs(left)>.075&&(target[cross]-coast[cross])*left>0&&Math.abs(target[cross]-coast[cross])>.07){
      key=left*side[cross]>0?'right':'left';const next=predict(key);if(!next||(next[cross]-pos[cross])*left<=0)return finish(false);
    }
    for(const k of Object.keys(current()))b.setControlState(k,k===key);
   }catch(e){finish(false,e);}
  };
  const timer=setTimeout(()=>finish(false),6100);b.on('physicsTick',tick);tick();
 });}finally{b.clearControlStates();}
}
module.exports={rowStrafe,adjacentRow};
