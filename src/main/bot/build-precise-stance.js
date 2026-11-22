'use strict';
// Sub-cell correction using actual vanilla walking inputs. No coordinate,
// velocity, speed or packet writes. Predict powered tick + natural braking.
const {headingAligned}=require('./build-travel');
async function preciseStance(a,p,q,token,handoff=false,{column=false}={}){
 const b=a.bot,origin=b.entity.position.clone(),dx=q.x-origin.x,dz=q.z-origin.z;
 if(Math.hypot(dx,dz)>(column?1.25:.9)||!b.entity.onGround||b.jumpQueued)throw a.error('unsafe_stance');
 if(Math.hypot(dx,dz)<.09)return;
 a.halt();a.setPhase(column?'column_step':'align_stance');
 const scale=2/Math.max(.001,Math.hypot(dx,dz));await a.aim(origin.offset(dx*scale,1.62,dz*scale),token);a.check(token);
 const {PlayerState}=require('prismarine-physics'),world={getBlock:v=>b.blockAt(v,false)};
 const distance=pos=>Math.hypot(q.x-pos.x,q.z-pos.z);
 const safe=pos=>pos.distanceTo(origin)<(column?1.65:1.5)&&Math.abs(pos.y-origin.y)<.025&&a.bodyClear(pos)&&a.safeFooting(pos)&&a.rows.transitAllowed(p,pos)&&(handoff||!a.collision(p,pos));
 function predict(key){
  const controls={forward:false,back:false,left:false,right:false,jump:false,sprint:false,sneak:false};if(key)controls[key]=true;
  const s=new PlayerState(b,controls);
  for(let i=0;i<12;i++){if(i&&key)s.control[key]=false;b.physics.simulatePlayer(s,world);if(!safe(s.pos))return null;}
  return s.pos;
 }
 let done=false,timer;
 try {await new Promise((resolve,reject)=>{
  const finish=error=>{if(done)return;done=true;clearTimeout(timer);b.removeListener('physicsTick',tick);b.clearControlStates();error?reject(error):resolve();};
  const tick=()=>{
   try{
    a.check(token);const movement=require('./movement-attributes').movementInfo(b);if(movement.known&&movement.value<=0)return finish(a.error('movement_disabled'));if(!safe(b.entity.position)||!headingAligned(b))return finish(a.error('unsafe_stance'));
    const v=b.entity.velocity;if(distance(b.entity.position)<.10&&Math.hypot(v.x,v.z)<.003)return finish();
    const coast=predict(null);if(!coast)return finish(a.error('unsafe_stance'));
    let key=null,best=distance(coast);
    if(best>.075)for(const k of ['forward','back']){const next=predict(k);if(next&&distance(next)<best-.002){best=distance(next);key=k;}}
    for(const k of ['forward','back','left','right','jump','sprint','sneak'])b.setControlState(k,k===key);
   }catch(e){finish(e);}
  };
  timer=setTimeout(()=>finish(a.error('unsafe_stance')),column?5000:6000);b.on('physicsTick',tick);tick();
 });}finally{clearTimeout(timer);b.clearControlStates();}
 a.check(token);
}
// A single same-level adjacent-column transfer. Do not send a one-block grid
// goal to pathfinder and then hand its residual motion to a second controller.
// Long approach, band retreat, height changes and terminal band stay separate.
async function columnStep(a,p,q,token){
 const b=a.bot,rows=a.rows,o=b.entity.position;
 if(a.adapter||!a.solidPattern||rows.terminal(p)||!b.entity.onGround||b.jumpQueued||
  Math.hypot(b.entity.velocity.x,b.entity.velocity.z)>=.003||
  Math.abs(o[rows.depth]-q[rows.depth])>.12||
  Math.abs(Math.abs(o[rows.cross]-q[rows.cross])-1)>.12)return false;
 // Preflight the full swept body + four loaded feet, not just endpoint tiles.
 const target=o.clone();target.x=q.x;target.z=q.z;
 for(let i=0;i<=24;i++){
  const v=o.plus(target.minus(o).scaled(i/24));
  if(!a.bodyClear(v)||!a.safeFooting(v)||!rows.transitAllowed(p,v)||a.collision(p,v))return false;
 }
 a.diagnostic('solid column step','band='+rows.describe(p).band+' goal='+JSON.stringify(q));
 await preciseStance(a,p,q,token,false,{column:true});a.check(token);
 a.diagnostic('solid column settled','band='+rows.describe(p).band+' goal='+JSON.stringify(q));
 return true;
}
module.exports={preciseStance,columnStep};
